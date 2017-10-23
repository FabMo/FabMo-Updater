var Q = require('q');
var fs = require('fs-extra');
var async = require('async');
var glob = require('glob');
var child_process = require('child_process');
var path = require('path');
var log = require('../log').logger('fmp');

// Denodeified functions
var ensureDir = Q.nfbind(fs.ensureDir)

var getExpandCommand = function(path) {
	if(path.match(/.tar$/i)) {
		return 'tar -xf '
	}
	if(path.match(/.tar.gz$/i)) {
		return 'tar -xzf '
	}
	if(path.match(/.tar.bz2?$/i)) {
		return 'tar -xjf '
	}
	throw new Error(path + ' is an unknown archive type.');
}

var resolveCwdPath = function(cwd, pth) {
		pth = path.normalize(pth)
		if (path.resolve(pth) === path.normalize(pth) ) {
			// Path is absolute (firmware on disk somewhere)
		} else {
			// Path is relative (firmware included in package)
			pth = path.resolve(cwd, pth);
		}
		return pth
}

function deleteFiles(operation) {
	var deferred = Q.defer();
	try {
		if (!operation.paths) {
			throw new Error('No paths to delete.')
		}
		// Iterate over all paths (which may have wildcards)
		async.each(
			operation.paths, 
			function(path, callback) {
				// Glob wildcards into individual paths
				glob(path, {}, function(err, files) {
					if(err) {
					callback(err); }
					// Iterate over individual file paths
					async.each(
						files, 
						function(file, callback) {
							log.info('Deleting ' + file)
							// Remove files/folders one by one
							fs.remove(file, function(err) {
								if(err) { callback(err); }
								callback();
							});
						},
						// If any removal fails 
						function(err) {
							log.warn(err);
							callback();
						}
					);
				});
			}, 
			// If any path processing operation fails (globbing or removing files)
			function(err) {
				if(err) { return deferred.reject(err); }
				return deferred.resolve();
			}
		);
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

function expandArchive(operation) {
	var deferred = Q.defer();
	try {
		// Be sane
		if (!operation.src) {
			throw new Error('No source archive specified for expandArchive');
		}
		if (!operation.dest) {
			throw new Error('No destination specified for expandArchive');
		}

		// Make sure that the directory we're expanding into exists
		ensureDir(operation.dest)
			.then(function() {
				// Get the appropriate expansion command
				var expandCommand = getExpandCommand(operation.src);

				// Call to shell to expand source archive into destination directory
				var sourceFile = resolveCwdPath(operation.cwd, operation.src);
				
				log.info('Expanding archive '  + sourceFile + ' to ' +  operation.dest);
				child_process.exec(expandCommand + sourceFile, {cwd : operation.dest}, function(err, stdout, stderr) {
					if(err) { return deferred.reject(err); }
					deferred.resolve();
				});

			})
			.catch(function(err) {
				deferred.reject(err);
			});
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

function installFirmware(operation) {
	if (!operation.src) {
		throw new Error('No source file specified for installFirmware')
	}

	var srcPath = resolveCwdPath(operation.cwd, operation.src);
	log.info('Installing firmware from ' + srcPath);

	return require('../hooks').installFirmware(srcPath);		
}
	
function createDirectories(operation) {
	var deferred = Q.defer();
	try {
		var paths = operation.paths || [];
		if (operation.path) {
			paths.push(operation.path);		
		}
		// Make sure all the specified directories exist
		async.each(
			paths, 
			function(pth, callback) {
				log.info('Creating directory ' + pth)
				fs.ensureDir(pth, callback);
			}, 
			// If any path processing operation fails
			function(err) {
				if(err) { return deferred.reject(err); }
				return deferred.resolve();
			}
		);
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

function sleep(operation) {
	var deferred = Q.defer();
	if(!operation.seconds) {
		throw new Error('No time (seconds) specified for sleep operation')
	}

	setTimeout(function() {
		deferred.resolve();
	}, operation.seconds*1000);

	return deferred.promise;
}

function updateJSONFile(operation) {
	var deferred = Q.defer();
	try {

		if(!operation.path) {
			throw new Error('No path specified.');
		}

		if(!operation.data) {
			throw new Error('No update data specified.');
		}
		log.info("Reading " + operation.path + '...')
		var data = fs.readJSON(operation.path, function(err, json) {
			if(err) {
				return deferred.reject(err);
			}
			for(key in operation.data) {
				log.info('Updating key ' + key + '->' + operation.data[key])
				json[key] = operation.data[key];
			}
			log.info('Writing ' + operation.path + '...')
			fs.writeJSON(operation.path, json, function(err) {
				if(err) {
					return deferred.reject(err);
				}
				log.info('Done.')
				deferred.resolve()
			});
		});
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

exports.deleteFiles = deleteFiles;
exports.expandArchive = expandArchive;
exports.installFirmware = installFirmware;
exports.createDirectories = createDirectories;
exports.createDirectory = createDirectories;
exports.sleep = sleep;
exports.updateJSONFile = updateJSONFile;
