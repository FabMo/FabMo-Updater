var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');
var argv = require('minimist').argv;
var fs = require('fs');

var log = require('../log').logger('build');

var IGNORE_NPM_ERROR = true;

var OS = 'linux';
var PLATFORM = 'edison';
var PRODUCT = 'FabMo-Engine';
var SYSTEM = 'handibot';
var TOKEN = '/fabmo/engine/install_token';
var REPOSITORY = 'https://github.com/FabMo/FabMo-Engine';
var UPDATER_NEEDED = 'v2.0.0';
var SERVICES = ['fabmo'];
var SE

// Globals that are setup by the build process
var reposDirectory = '/fabmo/engine';
var buildDirectory = path.resolve(reposDirectory, 'build');
var stagingDirectory = path.resolve(buildDirectory, 'stage');
var distDirectory = path.resolve(buildDirectory, 'dist');
var nodeModulesDirectory = path.resolve(reposDirectory, 'node_modules');
var versionFilePath = path.resolve(stagingDirectory, 'version.json');
var firmwarePath = path.resolve(reposDirectory, 'firmware/g2.bin');

var version = null;

var OPERATIONS = [
		{
			op : "deleteFiles",
			paths : [
				"/fabmo/engine"
			]
		},
		{
			op : "expandArchive",
			src : "files.tar.gz",
			dest : "/fabmo/engine"
		},
		{
		    op : "installFirmware",
		    src : "g2.bin"
		}
	]

function stagePath(pth) { return path.resolve(stagingDirectory, pth); }

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

function createBuildDirectories() {
	log.info("Creating build directory tree");
	return doshell('mkdir -p ' + buildDirectory + ' ' + stagingDirectory + ' ' + distDirectory);
}

function getLatestVersionNumber() {
	log.info("Getting latest version number")
	return doshell('git tag | tail -1', {cwd : reposDirectory}).then(function(v) {
		version = v.trim();
	});
}

function checkout() {
	log.info("Checking out version " + version)
	return doshell('git checkout ' + version, {cwd : reposDirectory});
}

function npmInstall() {
	log.info("Installing dependencies")
	var npmPromise =  doshell('npm install', {cwd : reposDirectory});
	if(IGNORE_NPM_ERROR) {
		return npmPromise.catch(function(err) {
			log.warn('npm install failed, but we are ignoring the error:')
			//log.warn(err)
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
	log.info('Copying firmware into staging area')
	return doshell('cp ' + firmwarePath + ' ' + path.resolve(stagingDirectory, 'g2.bin'), {cwd : reposDirectory});
}

function stageFilesArchive() {
	log.info('Copying firmware into staging area')
	return doshell('mv files.tar.gz ' + stagingDirectory, {cwd : buildDirectory});
}


function stageManifestJSON() {
	log.info('Compiling package manifest')
	var manifest = {}

	manifest.os = OS;
	manifest.platform = PLATFORM;
	manifest.produdct = PRODUCT;
	manifest.system = SYSTEM;
	manifest.operations = OPERATIONS;
	manifest.token = TOKEN;
	manifest.updaterNeeded = UPDATER_NEEDED;
	manifest.repository = REPOSITORY;
	manifest.services = SERVICES;

	return Q.nfcall(fs.writeFile, stagePath('manifest.json'), JSON.stringify(manifest))
}

function createFMPArchive() {
	log.info("Creating FMP package")
	doshell('tar -czf ../dist/fabmo-engine-' + version + '.fmp ./*', {cwd:stagingDirectory})
}

clean()
.then(createBuildDirectories)
.then(getLatestVersionNumber)
.then(checkout)
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
.catch(function(err) {
	log.error(err);
}).done();
