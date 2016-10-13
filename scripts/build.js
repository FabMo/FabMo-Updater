var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');

var log = require('../log').logger('build')

// Globals that are setup by the build process
var reposDirectory = '/fabmo/engine';
var buildDirectory = path.resolve(reposDirectory, 'build');
var stagingDirectory = path.resolve(reposDirectory, 'stage');

var archivePath = path.resolve(buildDirectory, 'build.tar');
var version = null;


function doshell(command, options) {
	deferred = Q.defer();
	log.command(command);
    exec(command, function(err, stdout, stderr) {
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
	return doshell('npm install', {cwd : reposDirectory});
}

function createBuildDirectory() {
	log.info("Creating build directory tree");
	return doshell('mkdir -p ' + buildDirectory + ' ' + stagingDirectory);
}

function stageRepos() {
	log.info('Copying repository into staging area')
	return doshell('git archive ' + version + ' | tar -x -C ' + stagingDirectory;
}

function addExtraFilesToArchive() {
	return doshell('tar --append --file=' + archivePath + ' node_modules')
}
function clean() {
	log.info('Cleaning the build directory');
	return doshell('rm -rf ' + buildDirectory);
}

	clean()
	.then(createBuildDirectory)
	.then(getLatestVersionNumber)
	.then(checkout)
	.then(npmInstall)
	.then(stageRepos)
	.catch(function(err) {
		console.error(err);
	})
