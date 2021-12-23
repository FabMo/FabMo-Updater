/*
 * fmp_operations.js
 *
 * This file defines individual operations that can be conducted by .fmp packages.
 *
 */
var Q = require('q');
var fs = require('fs-extra');
var async = require('async');
var glob = require('glob');
var child_process = require('child_process');
var path = require('path');
var log = require('../log').logger('fmp');

// Denodeified functions
var ensureDir = Q.nfbind(fs.ensureDir)

// Return the expand command that is appropriate for the provided file, based on its file extension
//   path - Full path to the file to check
var getExpandCommand = function(path) {
	if(path.match(/.tar$/i)) {
		return 'tar -xf '
	}
	if(path.match(/.tar.gz$/i) || path.match(/.tgz$/i)) {
		return 'tar -xzf '
	}
	if(path.match(/.tar.bz2?$/i)) {
		return 'tar -xjf '
	}
	throw new Error(path + ' is an unknown archive type.');
}

// If the path is an absolute path, return it.
// If it is a relative path, assume it is relative to `cwd`, resolve it to an absolute path and return it.
//   cwd - Working directory (Assumed root path if `pth` is a relative path)
//   pth - Absolute path, or one that is relative to `cwd`
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

// OPERATIONS BELOW HERE
// ---------------------
//
// Notes about operations:
//  * Operation functions all take an `operation` argument as their single argument.
//  * The attributes of the `operation` object vary by operation, but are described in the docs for each function.
//  * All operations return a promise that resolves when the operation is complete (or rejects when it fails)
//

// Delete the files provided by the `paths` attribute
//   operation - Operation object
//      paths - List of files to delete.  glob-style wildcards are acceptable.
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

// Expand the archive specified by `src`into the directory specified by `dest`
// tar, gzipped tar and bzipped tar archives are all supported.
//   operation - Operation object
//      src - Path to the source archive. This is usually a path relative to the package dir, but can be absolute.
//     dest - Path to the destination directory.  This must be an absolute path
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

// Install the firmware specified by `src`
//   operation - Operation object
//      src - Path to the firmware. This can be an absolute or package-relative path
function installFirmware(operation) {
    //if (!operation.src) {
	// 	throw new Error('No source file specified for installFirmware')
	// }

	var srcPath = resolveCwdPath(operation.cwd, operation.src);
	log.info('Installing firmware from ' + srcPath);
	return require('../hooks').installFirmware(srcPath);		

}

// Create all of the directories specified by `path` or `paths` attributes.
// This will recursively create parents, as in `mkdir -p`
//   operation - Operation object
//      path(s) - Path or list of (absolute) paths to create
function createDirectories(operation) {
	var deferred = Q.defer();
	try {
		// Build the list of directories to create
		var paths = operation.paths || [];
		if (operation.path) {
			paths.push(operation.path);		
		}
		// Make sure all the specified directories exist (creates them if not)
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

// Do nothing for `seconds` 
//   operation - Operation object
//      seconds - The number of seconds to sleep
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

// Update the JSON file at `path` with the keys/values contained in `data`
// This will only update top-level keys/values, but this makes it suitable for updating most FabMo settings
// TODO - This function could be expanded to allow you to delete keys, or to use the `extend()` function to
//        do more complex file modifications.
//   operation - Operation object
//      path - Path to the JSON file to modify.  This operation will fail if the file does not already exist.
//      data - Object mapping keys to their new values.  See above.
function updateJSONFile(operation) {
	var deferred = Q.defer();
	try {
		// Bail on insane data
		if(!operation.path) {
			throw new Error('No path specified.');
		}
		if(!operation.data) {
			throw new Error('No update data specified.');
		}

		// Read, modify, write.
		log.info("Reading " + operation.path + '...')
		var data = fs.readJSON(operation.path, function(err, json) {
			if(err) {
				return deferred.reject(err);
			}
			// Perform updates
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

// Helper functions are not exposed, only operations
// DON'T put helpers in the exports, because the exports list is used for operation lookup
exports.deleteFiles = deleteFiles;
exports.expandArchive = expandArchive;
exports.installFirmware = installFirmware;
exports.createDirectories = createDirectories;
exports.createDirectory = createDirectories;
exports.sleep = sleep;
exports.updateJSONFile = updateJSONFile;
