var Q = require('q');
var fs = require('fs-extra');
var async = require('async');

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
					console.log('globbed')
					if(err) {
					console.log(err); 
					callback(err); }
					console.log(files);
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
							console.log('failed removal')
							callback(err);
						}
					);
				});
			}, 
			// If any path processing operation fails (globbing or removing files)
			function(err) {
				if(err) { return deferred.reject(err); }
				return deferred.resolve(e);
			}
		);
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

exports.deleteFiles = deleteFiles;