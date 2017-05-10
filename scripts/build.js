/**
 * FabMo Build Script
 *
 * This script conducts the build for both the FabMo Engine and FabMo Updater
 * It also provides release/deployment automation.
 *
 * Releases are done through github using the github Release API.
 *
 * The process goes like this:
 * 1. Checkout the appropriate release for the specified product
 * 2. Check
 */

var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');
var argv = require('minimist')(process.argv);
var fs = require('fs');
var github = require('./github');
var fmp = require('../fmp');

var log = require('../log').logger('build');


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
var SKIP_NPM_INSTALL = argv['skip-npm-install'];

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

var version;					// dev, rc, or the released version number (eg: v1.2.3)
var versionString;				// The version string associated with the build (eg: v1.2.3-gabcde)
var candidateVersion;			// The version of the next release, if this build is a release candidate
var isFinalRelease = false;		// Set to true if this is going to be a final release
var releaseName = '';			// The name of the release on github.  This will be dev, release_candidate, or the versioned release number (eg v1.2.3)
var package = {};				// The package object that will appear in the package listing
var githubCredentials;

if(argv['rc']) {
	version = 'rc';
	releaseName = 'release_candidate';
} else if(argv['dev']) {
	version = argv['branch'] || 'master';
	releaseName = 'dev';
} else if(argv['release']) {
	version = 'release';
	isFinalRelease = true;
}
else {
	version = argv.version ? argv.version.trim() : null;
	if(version) {
		isFinalRelease = true;
		releaseName = version;
	}
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

function clean() {
	log.info('Cleaning the build directory');
	return doshell('rm -rf ' + buildDirectory);
}

function getLatestReleasedVersion() {
	if(version === 'release') {
		return doshell('git tag --sort=v:refname | tail -1', {cwd : reposDirectory})
			.then(function(v) {
				version = v.trim();
				releaseName = version;
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
		versionString = parts[0]
		if(parts[2]) {
			versionString += '-' + parts[2];
			if(version != 'release' && version != 'rc') {
				versionString += '-dev';
			} else {
				releaseName = versionString;
			}
		}
		fmpArchiveBaseName = 'fabmo-' + product + '_' + manifest.os + '_' + manifest.platform
		fmpArchiveName = fmpArchiveBaseName + '_' + versionString + '.fmp';
		fmpArchivePath = distPath(fmpArchiveName);
	});
}

function checkout() {
	if(version) {
		log.info("Checking out version " + version)
		return doshell('git fetch origin --tags; git checkout ' + version, {cwd : reposDirectory});
	} else {
		log.info("Skipping checkout because version is " + version)
	}
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
			return doshell('cp -R ./dashboard/build/* ' + path.join(stagingDirectory, 'dashboard/build'), {cwd : reposDirectory});
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
	type : isFinalRelease ? 'release' : 'dev',
		date : new Date().toISOString(),
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
	doshell('tar -czf ' + fmpArchivePath + ' ./*', {cwd:stagingDirectory})
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
					//console.log(oldPackageList);
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
	package.date = (new Date()).toISOString();
	if(argv['branch']) {
		package.branch = argv['branch'];
	}
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
									return github.createRelease(githubReposOwner, githubRepos, releaseName, version, githubCredentials);
								});
						})
						.then(function(r) {
							release = r;
						})
				} else {
					return github.createRelease(githubReposOwner, githubRepos, releaseName, version, githubCredentials)
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
	}
	return Q();
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
.then(publishGithubRelease)			// Set changelog
.then(createPackageEntry)
.then(updatePackagesList)
.catch(function(err) {
	log.error(err);
}).done();
