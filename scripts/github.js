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

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.get(`https://api.github.com/repos/${owner}/${repos}/contents/${file}`, {
        auth,
        headers: HEADERS
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

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    log.info(`Putting ${file.url}`);

    axios.put(file.url, {
        path: file.path,
        message: commitMessage,
        sha: file.sha,
        content: Buffer.from(newContents).toString('base64')
    }, {
        auth,
        headers: HEADERS
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

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.get(release.assets_url, {
        auth,
        headers: HEADERS
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

function deleteReleaseAsset(asset, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.delete(asset.url, {
        auth,
        headers: HEADERS
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

function deleteRelease(release, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    log.info(`Deleting release: ${release.tag_name}`);

    axios.delete(release.url, {
        auth,
        headers: HEADERS
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

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.get(`https://api.github.com/repos/${owner}/${repos}/releases`, {
        auth,
        headers: HEADERS
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

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.patch(release.url, object, {
        auth,
        headers: HEADERS
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

function createRelease(owner, repos, tagName, targetCommitish, options) {
    const deferred = Q.defer();
    const auth = {};

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    axios.get(`https://api.github.com/repos/${owner}/${repos}/releases`, {
        auth,
        headers: HEADERS
    })
        .then(response => {
            const releases = response.data;
            for (const release of releases) {
                if (release.tag_name === tagName) {
                    log.info(`Release for ${tagName} already exists`);
                    deferred.resolve(release);
                    return;
                }
            }

            log.info(`Release for ${tagName} does not already exist`);

            const json = {
                tag_name: tagName,
                target_commitish: tagName === targetCommitish ? undefined : targetCommitish,
                message: options.message
            };

            axios.post(`https://api.github.com/repos/${owner}/${repos}/releases`, json, {
                auth,
                headers: HEADERS
            })
                .then(response => {
                    if (response.status !== 201) {
                        deferred.reject(new Error(`${response.status}: ${response.statusText}`));
                    } else {
                        deferred.resolve(response.data);
                    }
                })
                .catch(error => {
                    log.error(error);
                    deferred.reject(error);
                });
        })
        .catch(error => {
            log.error(error);
            deferred.reject(error);
        });

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

function addReleaseAsset(release, filename, options) {
    const deferred = Q.defer();
    const name = path.basename(filename);
    const uploadURL = URITemplateSubst(release.upload_url, { name });
    const auth = {};

    if (options.username || options.password) {
        auth.username = options.username;
        auth.password = options.password;
    }

    fs.stat(filename, (err, stat) => {
        if (err) {
            deferred.reject(err);
            return;
        }

        fs.createReadStream(filename).pipe(
            axios.post(uploadURL, fs.createReadStream(filename), {
                auth,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Content-Length': stat.size
                }
            })
                .then(response => {
                    if (response.status !== 201) {
                        deferred.reject(new Error(response.data));
                    } else {
                        log.info(`Added release asset: ${filename}`);
                        deferred.resolve(response.data.browser_download_url);
                    }
                })
                .catch(error => {
                    log.error(error);
                    deferred.reject(error);
                })
        );
    });

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
                username: {
                    required: true,
                    message: 'Github Username:'
                },
                password: {
                    required: true,
                    hidden: true,
                    message: 'Github Password:'
                }
            }
        };

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
