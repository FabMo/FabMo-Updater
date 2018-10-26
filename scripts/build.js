/**
 * FabMo Build Script
 *
 * This script conducts the build for both the FabMo Engine and FabMo Updater
 * It also provides release/deployment automation.
 *
 * Releases are done through github using the github Release API.
 *
 * Related files in this directory:
 *    engine.json - Package manifest template for engine builds
 *   updater.json - Package manifest template for updater builds
 *      github.js - Some functions for communicating with the github release API 
 */
var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');
var argv = require('minimist')(process.argv);
var fs = require('fs');
var github = require('./github');
var fmp = require('../fmp');
var util = require('../util');
var log = require('../log').logger('build');
//require('longjohn'); // Used for logging, not for production

var buildDate = new Date().toISOString();
log.info('Build date: ' + buildDate);

if(!('product' in argv)) {
	log.error("You must specify a product (--product=engine|updater)")
	process.exit(1);
}


switch(argv.product) {
	case 'engine':
		var product = 'engine';
		var reposDirectory = '/fabmo/engine';
		var githubRepos = 'FabMo-Engine';
		break;
	case 'updater':
		var product = 'updater';
		var reposDirectory = '/fabmo/updater';
		var githubRepos = 'FabMo-Updater';
		break;
	default:
		log.error("Product specified must be either engine or updater.");
		process.exit(1);
}

var IGNORE_NPM_ERROR = argv['ignore-npm-error'];
var SKIP_NPM_INSTALL = !argv['do-npm-install'];
var RETRIES = argv['retries'] || 5;

// Globals that are setup by the build process
var githubReposOwner = 'FabMo';

// Directories for build
var buildDirectory = path.resolve('/root', 'build');
var stagingDirectory = path.resolve(buildDirectory, 'stage');
var distDirectory = path.resolve(buildDirectory, 'dist');
var nodeModulesDirectory = path.resolve(reposDirectory, 'node_modules');
var scriptDirectory = path.resolve(__dirname);

// Path to specific files
var versionFilePath = path.resolve(stagingDirectory, 'version.json');
var firmwarePath = path.resolve(reposDirectory, 'firmware/g2.bin');

// Package Destination
var fmpArchivePath;
var fmpArchiveBaseName;

var buildType                   // dev, rc, or release (the type of requested build)
var branch                      // The branch to build from
var versionNumber;				// The released version number, in the case of a release build. (eg: v1.2.3)
var versionString;				// The version string associated with the build (eg: v1.2.3-gabcde)
var candidateVersion;			// The version of the next release, if this build is a release candidate
var isFinalRelease = false;		// Set to true if this is going to be a final release
var releaseName = '';			// The name of the release on github.  This will be dev, release_candidate, or the versioned release number (eg v1.2.3)
var package = {};				// The package object that will appear in the package listing
var githubCredentials;

if(argv['rc']) {
	buildType = 'rc';
    branch = 'rc';
    candidateVersion = argv['rc'].trim();
    if(!candidateVersion) {
        throw new Error('No candidate version specified with --rc');
    }
    if(candidateVersion[0] != 'v') {
        candidateVersion = 'v' + candidateVersion;
    }
} else if(argv['dev']) {
	buildType = 'dev';
    branch = argv['branch'] || 'master';
} else if(argv['release']) {
	buildType = 'release';
	branch = 'release';
} else if(argv['version']) {
    buildType = 'release';
	versionNumber = argv['version'] ? argv['version'].trim() : null;
} else {
    buildType = 'release'
	branch = 'release';
}

if(argv['version'] && argv['branch']) {
    throw new Error('You can specify a version number or a branch, but not both.');
}
if(versionNumber) {
    commitish = versionNumber
} else {
    commitish = branch
}

var manifest = {};
var md5;
var packageDownloadURL;
var changelog = '';
var manifestTemplatePath = scriptPath(product + '.json');

function stagePath(pth) { return path.resolve(stagingDirectory, pth); }
function distPath(pth) { return path.resolve(distDirectory, pth); }
function scriptPath(pth) { return path.resolve(scriptDirectory, pth); }

/*
 * Conduct the specified shell operation, and return a promise that resolves upon completion of the command.
 * If the command was successful (0 error code) the promise resolves with all the stdout data from the process.
 * If the command fails (nonzero error code) the promise rejects with all the stderr data from the process.
 */
function doshell(command, options) {
	var deferred = Q.defer();
	log.command(command);
    exec(command, options, function(err, stdout, stderr) {
    	log.stdout(stdout);
    	log.stderr(stderr);
        if(err) {
        	deferred.reject(err);
        } else {
        	deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

/*
 * Clear the build directory
 */
function clean() {
	log.info('Cleaning the build directory');
	return doshell('rm -rf ' + buildDirectory);
}

function getLatestReleasedVersion() {
	if(buildType === 'release' && !versionNumber) {
		return doshell('git tag --sort=v:refname | tail -2', {cwd : reposDirectory})
			.then(function(v) {
				versionNumber = v.split('\n')[0].trim();
                		commitish = versionNumber;
				releaseName = versionNumber;
			});
	} else {
		return Q();
	}
}

function createBuildDirectories() {
	log.info("Creating build directory tree");
	return doshell('mkdir -p ' + buildDirectory + ' ' + stagingDirectory + ' ' + distDirectory);
}

function getProductVersion() {
    return doshell('git describe --dirty', {cwd : reposDirectory}).then(function(v) {
		v = v.trim().replace('-dirty', '!');
		parts = v.split('-');
		versionString = buildType === 'rc' ? candidateVersion : parts[0]
		if(parts[2]) {
			versionString += '-' + parts[2];
		    switch(buildType) {
                case 'dev':
                    versionString += '-dev';
	                releaseName = 'dev';
                    break;
                case 'rc':
                    versionString += '-rc';
	                releaseName = 'release_candidate';
                    break;
                case 'release':
                    releaseName = versionString;
                    break;
            }
		} else {
            if(buildType == 'rc') {
                throw new Error('Cannot build a candidate release from this version.  This is the same as released version ' + parts[0] + '!')
            }
        }
		fmpArchiveBaseName = 'fabmo-' + product + '_' + manifest.os + '_' + manifest.platform
		fmpArchiveName = fmpArchiveBaseName + '_' + versionString + '.fmp';
		fmpArchivePath = distPath(fmpArchiveName);
	});
}

function checkout() {
	log.info("Checking out version " + commitish)
	return doshell('git fetch origin --tags; git checkout ' + commitish, {cwd : reposDirectory});
	return Q();
}

function npmClean() {
	if(SKIP_NPM_INSTALL) { return Q(); }
	log.info('Removing node_modules directory')
	return doshell('rm -rf node_modules', {cwd : reposDirectory});
}

function npmInstall() {
	if(SKIP_NPM_INSTALL) { return Q(); }
	log.info("Installing dependencies")
	var npmPromise = doshell('npm install --production', {cwd : reposDirectory});
	if(IGNORE_NPM_ERROR) {
		return npmPromise.catch(function(err) {
			log.warn('npm install failed, but we are ignoring the error:')
		})
	}
	return npmPromise;
}

function webpack() {
	if(SKIP_NPM_INSTALL || product !== 'engine') { return Q(); }
	log.info("Webpacking")
	var npmPromise = doshell('./node_modules/.bin/webpack -p', {cwd : reposDirectory});
	return npmPromise;
}

function stageRepos() {
	log.info('Copying repository into staging area')
	doshell('git archive --format=tar HEAD | tar -x -C ' + stagingDirectory, {cwd : reposDirectory})
	.then(function() {
		if(product === 'engine') {
			var profilesDir = path.resolve(reposDirectory, 'profiles')
            return doshell('cp -R ./dashboard/build/* ' + path.join(stagingDirectory, 'dashboard/build'), {cwd : reposDirectory})
		    .then(function() { return doshell('cp -R ' + profilesDir + ' ' + stagingDirectory)}, {cwd : reposDirectory})
        	    .then(function() { return doshell('rm -rf profiles/*/.git*', {cwd : stagingDirectory}); })
	}
		return Q();
	});
}

function stageNodeModules() {
	log.info('Copying other stuff into staging area')
	return doshell('cp -R ' + nodeModulesDirectory + ' ' + path.resolve(stagingDirectory, 'node_modules'), {cwd : reposDirectory});
	}

function stageVersionJSON() {
	log.info('Creating version.json for release package');

	var versionObject = {
	    type : buildType,
		date : buildDate,
		number : versionString
 	}

 	return Q.nfcall(fs.writeFile, versionFilePath, JSON.stringify(versionObject))
 		.then(function() {log.info(versionFilePath + ' written.')})
}

function createFilesArchive() {
	log.info('Creating the files archive')
	return doshell('tar -czf  ../files.tar.gz ./*', {cwd : stagingDirectory});
}

function clearStagingArea() {
	log.info('Clearing the staging area')
	return doshell('rm -rf ' + stagingDirectory + '/*');
}

function stageFirmware() {
	if(product === 'updater') {
		return Q();
	}
	log.info('Copying firmware into staging area')
	return doshell('cp ' + firmwarePath + ' ' + path.resolve(stagingDirectory, 'g2.bin'), {cwd : reposDirectory});
}

function stageFilesArchive() {
	log.info('Copying firmware into staging area')
	return doshell('mv files.tar.gz ' + stagingDirectory, {cwd : buildDirectory});
}

function getMD5Hash() {
	log.info('Getting MD5 hash of ' + fmpArchivePath);
	return doshell('md5sum ' + fmpArchivePath)
		.then(function(hash) {
			md5 = hash.split(' ')[0].trim();
		}).catch(function(err) {
			return doshell('md5 -q ' + fmpArchivePath)
					.then(function(hash) {
						md5 = hash.split(' ')[0].trim();
					});
		});
}

function loadManifestTemplate() {
	return Q.nfcall(fs.readFile, manifestTemplatePath)
		.then(function(data) {
			manifest = JSON.parse(data);
		})
}

function stageManifestJSON() {
	log.info('Compiling package manifest')
	manifest.version = versionString
	return Q.nfcall(fs.writeFile, stagePath('manifest.json'), JSON.stringify(manifest))
}

function createFMPArchive() {
	log.info("Creating FMP archive")
	return doshell('tar -czf ' + fmpArchivePath + ' ./*', {cwd:stagingDirectory})
}

function updatePackagesList() {
	if(!argv.publish) { return Q(); }
	var thisVersion = fmp.parseVersion(package.version);
	var packageLists = {
		'dev' :  'manifest/packages-dev.json',
		'rc' :  'manifest/packages-rc.json',
		'release' :  'manifest/packages.json'
	}

	log.info("Updating package entry on fabmo.github.io/" + packageLists[thisVersion.type]);

	return github.getFileContents(githubReposOwner, 'fabmo.github.io', packageLists[thisVersion.type], githubCredentials)
		.then(function(file) {
			switch(thisVersion.type) {
				case 'rc':
				case 'dev':
					var updated = false;
					oldPackageList = JSON.parse(file.content.toString());
					for(var i=0; i<oldPackageList.packages.length; i++) {
						if(oldPackageList.packages[i].product === package.product) {
							oldPackageList.packages[i] = package;
							updated = true;
						}
					}
					if(!updated) {
						oldPackageList.packages.push(package);
					}
					
					return github.updateFileContents(file, JSON.stringify(oldPackageList,null,2), "Add version " + versionString, githubCredentials)
				case 'release':
					var updated = false;
					oldPackageList = JSON.parse(file.content.toString());
					for(var i=0; i<oldPackageList.packages.length; i++) {
						if(oldPackageList.packages[i].product === package.product && oldPackageList.packages[i].version === package.version) {
							oldPackageList.packages[i] = package;
							updated = true;
						}
					}
					if(!updated) {
						oldPackageList.packages.push(package);
					}
					return github.updateFileContents(file, JSON.stringify(oldPackageList,null,2), "Add version " + versionString, githubCredentials)
				break;

				default:
					throw new Error("Unknown release type: " + thisVersion.type);
					break;
			}
		});
}

function createPackageEntry() {

	log.info("Creating package entry");
	var fields = ['os','product','platform','system','updaterNeeded','version']

	fields.forEach(function(item) {
		package[item] = manifest[item];
	});

	package.md5 = md5;
	package.url = packageDownloadURL;
	package.changelog = changelog;
	package.date = buildDate;
	if(argv['branch']) {
		package.branch = argv['branch'];
	}
	log.info("Done creating package entry.");
	return Q(package);
}

function publishGithubRelease() {
	var release;
	if(argv.publish) {
		log.info("Publishing Github release...")
		return github.getCredentials()
			.then(function(creds) {
				githubCredentials = creds;
			})
			.then(function() {
				if(releaseName === 'dev' || releaseName === 'release_candidate') {
					log.info("Deleting remote tag '" + releaseName + "'")
					return doshell('git push origin :refs/tags/' + releaseName, {cwd : reposDirectory})
						.then(function() {
							return github.getReleaseByTag(githubReposOwner, githubRepos, releaseName, githubCredentials);
						})
						.then(function(r) {
							return (r ? github.deleteRelease(r, githubCredentials) : Q())
								.then(function() {
									return github.createRelease(githubReposOwner, githubRepos, releaseName, commitish, githubCredentials);
								});
						})
						.then(function(r) {
							release = r;
						})
				} else {
					return github.createRelease(githubReposOwner, githubRepos, releaseName, commitish, githubCredentials)
						.then(function(r) {
							release = r;
						})
				}
			})
			.then(function() {
				return github.deleteReleaseAssets(release, new RegExp(fmpArchiveBaseName + '.*'), githubCredentials);
			})
			.then(function() {
				changelog = release.body || '';
				log.info("Uploading FMP package " + fmpArchiveName + " to github...")

				return github.addReleaseAsset(release, fmpArchivePath, githubCredentials);

			}).then(function(downloadURL) {
				packageDownloadURL = downloadURL;
				return Q();
			});
	} else {
		return Q();
	}
}

clean()
.then(createBuildDirectories)
.then(loadManifestTemplate)      	// Set manifest
.then(getLatestReleasedVersion)  	// Set version
.then(checkout)
.then(getProductVersion)			// Set versionString, fmpArchiveName, fmpArchivePath
.then(npmClean)
.then(npmInstall)
.then(webpack)
.then(stageRepos)
.then(stageNodeModules)
.then(stageVersionJSON)
.then(createFilesArchive)
.then(clearStagingArea)
.then(stageFilesArchive)
.then(stageFirmware)
.then(stageManifestJSON)
.then(createFMPArchive)
.then(getMD5Hash)					// Set md5
.then(util.retry(publishGithubRelease, RETRIES, 1000))
.then(createPackageEntry)
.then(util.retry(updatePackagesList, RETRIES, 1000))
.catch(function(err) {
	log.error("Final catch:");
	log.error(err);
}).done();
