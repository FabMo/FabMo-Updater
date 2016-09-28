var Q = require('q');
var fs = require('fs-extra');
var async = require('async');
var glob = require('glob');
var child_process = require('child_process');
var path = require('path');

// Denodeified functions
var ensureDir = Q.nfbind(fs.ensureDir)

var getExpandCommand = function(path) {
	if(path.match(/.tar.gz$/i)) {
		return 'tar -xvzf '
	}
	if(path.match(/.tar.bz2$/i)) {
		return 'tar -xvjf '
	}
	throw new Error(path + ' is an unknown archive type.');
}

var deleteFiles = function(operation) {
	var deferred = Q.defer();
	console.log('deleting files')
	try {
		if (!operation.paths) {
			throw new Error('No paths to delete.')
		}
		// Iterate over all paths (which may have wildcards)
		async.each(
			operation.paths, 
			function(path, callback) {
				console.log(path)
				// Glob wildcards into individual paths
				glob(path, {}, function(err, files) {
					if(err) {
					callback(err); }
					// Iterate over individual file paths
					async.each(
						files, 
						function(file, callback) {
							// Remove files/folders one by one
							fs.remove(file, function(err) {
								if(err) { callback(err); }
								console.log(file + ' was removed successfully.')
								callback();
							});
						},
						// If any removal fails 
						function(err) {
							callback(err);
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

var expandArchive = function(operation) {
	var deferred = Q.defer();
	try {
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
				var sourceFile = path.join(operation.cwd, operation.src);
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
exports.deleteFiles = deleteFiles;
exports.expandArchive = expandArchive;