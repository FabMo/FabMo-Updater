const axios = require('axios');
const prompt = require('prompt');
const Q = require('q');
const path = require('path');
const fs = require('fs');
const log = require('../log').logger('github');

const USER_AGENT = 'DangerBuns';
const HEADERS = { 'User-Agent': USER_AGENT };

function getFileContents(owner, repos, file, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    axios.get(`https://api.github.com/repos/${owner}/${repos}/contents/${file}`, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            const file = response.data;
            file.content = Buffer.from(file.content, 'base64');
            deferred.resolve(file);
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

function updateFileContents(file, newContents, commitMessage, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    log.info(`Putting ${file.url}`);

    axios.put(file.url, {
        path: file.path,
        message: commitMessage,
        sha: file.sha,
        content: Buffer.from(newContents).toString('base64')
    }, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            deferred.resolve(response.data);
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

function getReleaseAssets(release, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    axios.get(release.assets_url, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            deferred.resolve(response.data);
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

function deleteReleaseAssets(asset, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    const maxRetries = 3;
    let attempt = 0;

    function attemptDelete() {
        attempt++;
        axios.delete(asset.url, {
            headers: { ...HEADERS, ...auth },
            timeout: 10000 // Increase timeout to 10 seconds
        })
            .then(response => {
                if (response.status !== 204) {
                    deferred.reject(new Error(response.statusText));
                } else {
                    deferred.resolve(null);
                }
            })
            .catch(error => {
                if (attempt < maxRetries && error.code === 'EPIPE') {
                    log.warn(`Retrying deleteReleaseAssets (attempt ${attempt}) due to EPIPE error`);
                    setTimeout(attemptDelete, 1000); // Retry after 1 second
                } else {
                    log.error(error);
                    deferred.reject(error);
                }
            });
    }

    attemptDelete();

    return deferred.promise;
}

function deleteRelease(release, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    log.info(`Deleting release: ${release.tag_name}`);

    axios.delete(release.url, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            if (response.status !== 204) {
                deferred.reject(new Error(response.statusText));
            } else {
                deferred.resolve(null);
            }
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

function getReleaseByTag(owner, repos, tagName, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    axios.get(`https://api.github.com/repos/${owner}/${repos}/releases`, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            const releases = response.data;
            for (const release of releases) {
                if (release.tag_name === tagName) {
                    deferred.resolve(release);
                    return;
                }
            }
            deferred.resolve(null);
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

function updateRelease(release, object, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.token) {
        auth.Authorization = `token ${options.token}`;
    }

    axios.patch(release.url, object, {
        headers: { ...HEADERS, ...auth }
    })
        .then(response => {
            deferred.resolve(response.data);
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

    return deferred.promise;
}

async function createRelease(owner, repos, tagName, targetCommitish, options) {
    const deferred = Q.defer();
    const url = `https://api.github.com/repos/${owner}/${repos}/releases`;
    const auth = options.token ? { Authorization: `token ${options.token}` } : {};

    // Ensure target_commitish is always set
    targetCommitish = tagName === targetCommitish ? 'master' : targetCommitish;

    const payload = {
        tag_name: tagName,
        target_commitish: targetCommitish,
        name: tagName,
        body: options.message,
        draft: false,
        prerelease: false
    };

    log.debug(`Creating release for ${tagName} on ${owner}/${repos}`);
    log.debug(`Payload for release creation: ${JSON.stringify(payload)}`);

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                ...auth
            }
        });

        if (response.status !== 201) {
            throw new Error(`Failed to create release: ${response.status} ${response.statusText}`);
        }

        log.info(`Release created successfully: ${JSON.stringify(response.data)}`);
        deferred.resolve(response.data);
    } catch (error) {
        log.error(`Failed to create release: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        deferred.reject(error);
    }

    return deferred.promise;
}

function URITemplateSubst(template, obj) {
    const urlRegex = /([^{]+)(?:{\?([\w,]+)})?/g;
    const match = urlRegex.exec(template);
    const base = match[1];
    const args = (match[2] || '').split(',');
    const parts = [base, '?'];
    args.forEach(arg => {
        if (arg in obj) {
            parts.push(`${arg}=${obj[arg]}`);
            parts.push('&');
        }
    });
    return parts.join('').replace(/[\?\&]$/g, '');
}

async function addReleaseAsset(release, filename, options) {
    const deferred = Q.defer();
    const name = path.basename(filename);
    const uploadURL = URITemplateSubst(release.upload_url, { name });
    const auth = options.token ? { Authorization: `token ${options.token}` } : {};

    try {
        const stat = await fs.promises.stat(filename);
        log.debug(`Uploading asset to URL: ${uploadURL}`);
        log.debug(`Asset size: ${stat.size}`);
        log.debug(`Asset path: ${filename}`);

        const response = await axios.post(uploadURL, fs.createReadStream(filename), {
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/octet-stream',
                'Content-Length': stat.size,
                ...auth
            }
        });

        if (response.status !== 201) {
            throw new Error(`Failed to upload asset: ${response.status} ${response.statusText}`);
        }

        log.info(`Added release asset: ${filename}`);
        deferred.resolve(response.data.browser_download_url);
    } catch (error) {
        log.error(`Error uploading asset: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        deferred.reject(error);
    }

    return deferred.promise;
}

function getCredentials() {
    const deferred = Q.defer();
    let creds;

    try {
        creds = require('/fabmo-updater/scripts/credentials.json');
    } catch (e) {
        creds = null;
    }

    if (!creds) {
        const schema = {
            properties: {
                token: {
                    required: true,
                    hidden: true,
                    message: 'GitHub Personal Access Token:'
                }
            }
        };

        log.debug(creds);
        prompt.start();
        prompt.message = '';
        prompt.delimiter = '';
        prompt.get(schema, (err, result) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(result);
            }
        });
    } else {
        deferred.resolve(creds);
    }

    return deferred.promise;
}

exports.createRelease = createRelease;
exports.addReleaseAsset = addReleaseAsset;
exports.deleteRelease = deleteRelease;
exports.getCredentials = getCredentials;
exports.getReleaseByTag = getReleaseByTag;
exports.updateRelease = updateRelease;
exports.deleteReleaseAssets = deleteReleaseAssets;
exports.getFileContents = getFileContents;
exports.updateFileContents = updateFileContents;