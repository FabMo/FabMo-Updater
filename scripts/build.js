var exec = require('child_process').exec;
var Q = require('q');
var path = require('path');
var argv = require('minimist')(process.argv);
var fs = require('fs');

var log = require('../log').logger('build');


if(!('product' in argv)) {
	log.error("You must specify a product (--product=engine|updater)")
	process.exit(1);
}

var IGNORE_NPM_ERROR = argv['ignore-npm-error'];

switch(argv.product) {
	case 'engine':
		var product = 'engine';
		var reposDirectory = '/fabmo/engine';
		break;
	case 'updater':
		var product = 'updater';
		var reposDirectory = '/fabmo/updater';
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
var version = argv.version ? argv.version.trim() : null;
var manifest = {};
var md5;
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

function createBuildDirectories() {
	log.info("Creating build directory tree");
	return doshell('mkdir -p ' + buildDirectory + ' ' + stagingDirectory + ' ' + distDirectory);
}

function getProductVersion() {
	
	var setupPaths = function(v) {
		version = v.trim()
		var fnversion  = version.replace(/\./g,'-');
		fmpArchiveName = 'fabmo-' + product + '-' + manifest.os + '-' + manifest.platform + '-' + fnversion + '.fmp';
		fmpArchivePath = distPath(fmpArchiveName);
	}

	if(version) {
		log.info("Using the provided version: " + version)
		return Q(setupPaths(version))
	} else {
		log.info("Getting latest version number")
		return doshell('git tag --sort=v:refname | tail -1', {cwd : reposDirectory})
			.then(setupPaths);		
	}
}

function checkout() {
	log.info("Checking out version " + version)
	return doshell('git checkout ' + version, {cwd : reposDirectory});
}

function npmClean() {
	log.info('Removing node_modules directory')
	return doshell('rm -rf node_modules', {cwd : reposDirectory});
}

function npmInstall() {
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

	package.md5 = md5

	console.log(JSON.stringify(package,null, 3));
	return Q();
}

clean()
.then(createBuildDirectories)
.then(getProductVersion)
.then(checkout)
.then(npmClean)
.then(npmInstall)
.then(stageRepos)
.then(stageNodeModules)
.then(stageVersionJSON)
.then(createFilesArchive)
.then(clearStagingArea)
.then(stageFilesArchive)
.then(stageFirmware)
.then(loadManifestTemplate)
.then(stageManifestJSON)
.then(createFMPArchive)
.then(getMD5Hash)
.then(printPackageEntry)
.catch(function(err) {
	log.error(err);
}).done();
