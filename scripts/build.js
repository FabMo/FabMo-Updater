var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');
var argv = require('minimist')(process.argv);
var fs = require('fs');
var github = require('./github');

var log = require('../log').logger('build');


if(!('product' in argv)) {
	log.error("You must specify a product (--product=engine|updater)")
	process.exit(1);
}

var IGNORE_NPM_ERROR = argv['ignore-npm-error'];
var SKIP_NPM_INSTALL = argv['skip-npm-install'];

var githubReposOwner = 'FabMo';

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

// Globals that are setup by the build process
var buildDirectory = path.resolve(reposDirectory, 'build');
var stagingDirectory = path.resolve(buildDirectory, 'stage');
var distDirectory = path.resolve(buildDirectory, 'dist');
var nodeModulesDirectory = path.resolve(reposDirectory, 'node_modules');
var scriptDirectory = path.resolve(__dirname);

var versionFilePath = path.resolve(stagingDirectory, 'version.json');
var firmwarePath = path.resolve(reposDirectory, 'firmware/g2.bin');


var fmpArchivePath;
var version;
var versionString;
var candidateVersion;
var isFinalRelease = false;

if(argv['rc']) {
	version = 'rc';
} else if(argv['dev']) {
	version = 'master';
} else if(argv['release']) {
	version = 'release';
	isFinalRelease = true;

}
else {
	version = argv.version ? argv.version.trim() : null;
	if(version) {
		isFinalRelease = true;
	}
}
var manifest = {};
var md5;
var packageDownloadURL;
var manifestTemplatePath = scriptPath(product + '.json');

function stagePath(pth) { return path.resolve(stagingDirectory, pth); }
function distPath(pth) { return path.resolve(distDirectory, pth); }
function scriptPath(pth) { return path.resolve(scriptDirectory, pth); }

function doshell(command, options) {
	deferred = Q.defer();
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
	if(version == 'release') {
		return doshell('git tag --sort=v:refname | tail -1', {cwd : reposDirectory})
			.then(function(v) {
				version = v.trim();
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
		console.log(v)
		parts = v.split('-');
		versionString = parts[0]
		if(parts[2]) {
			versionString += '-' + parts[2];
			if(version === 'master') {
				versionString += '-dev';
			}
		} 
		fmpArchiveName = 'fabmo-' + product + '_' + manifest.os + '_' + manifest.platform + '_' + versionString + '.fmp';
		fmpArchivePath = distPath(fmpArchiveName);
	});
}

function checkout() {
	if(version) {
		log.info("Checking out version " + version)
		return doshell('git checkout ' + version, {cwd : reposDirectory});		
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

function stageRepos() {
	log.info('Copying repository into staging area')
	return doshell('git archive --format=tar ' + version + ' | tar -x -C ' + stagingDirectory, {cwd : reposDirectory})
}

function stageNodeModules() {
	log.info('Copying other stuff into staging area')
	return doshell('cp -R ' + nodeModulesDirectory + ' ' + path.resolve(stagingDirectory, 'node_modules'), {cwd : reposDirectory});
}

function stageVersionJSON() {
	log.info('Creating version.json for release package');

	var versionObject = {
		type : 'release',
		date : new Date().toISOString(),
		number : version
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
		}).catch(function(err){
			log.error(err);
		})
}

function stageManifestJSON() {
	log.info('Compiling package manifest')
	manifest.version = version
	return Q.nfcall(fs.writeFile, stagePath('manifest.json'), JSON.stringify(manifest))
}

function createFMPArchive() {
	log.info("Creating FMP archive")
	doshell('tar -czf ' + fmpArchivePath + ' ./*', {cwd:stagingDirectory})
}

function printPackageEntry() {
	var package = {}
	var fields = ['os','product','platform','system','updaterNeeded','version']

	fields.forEach(function(item) {
		package[item] = manifest[item];
	});

	package.md5 = md5;
	package.url = packageDownloadURL;

	console.log(JSON.stringify(package,null, 3));
	return Q();
}

function publishGithubRelease() {
	if(argv.publish) {
		log.info("Publishing Github release...")
		return github.getCredentials()
			.then(function(creds) {
				return github.createRelease(githubReposOwner, githubRepos, version, creds)
			})
			.then(function(release) {
				return github.addReleaseAsset(release, fmpArchivePath);
			}).then(function(downloadURL) {
				packageDownloadURL = downloadURL;
			});
		}
	}
	return Q();
}

clean()
.then(createBuildDirectories)
.then(loadManifestTemplate)
.then(getLatestReleasedVersion)
.then(checkout)
.then(getProductVersion)
.then(npmClean)
.then(npmInstall)
.then(stageRepos)
.then(stageNodeModules)
.then(stageVersionJSON)
.then(createFilesArchive)
.then(clearStagingArea)
.then(stageFilesArchive)
.then(stageFirmware)
.then(stageManifestJSON)
.then(createFMPArchive)
.then(getMD5Hash)
.then(printPackageEntry)
.then(publishGithubRelease)
.catch(function(err) {
	log.error(err);
}).done();
