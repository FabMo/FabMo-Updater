var Q = require('q');
var fs = require('fs-extra');
var fmpOperations = require('./fmp_operations');
var child_process = require('child_process');
var os = require('os');
var async = require('async');
var path = require('path');
var log = require('../log').logger('fmp');
var config = require('../config');

var TEMP_DIRECTORY = os.tmpdir();

function loadManifest(filename) {
	var deferred = Q.defer()
	fs.readFile(filename, 'utf8', function (err, data) {
		if(err) {
			return deferred.reject(err);
		}
		try {
	    	// Parse the data
	    	var manifest = JSON.parse(data);
			
	    	// Check for mandatory fields
			var requiredFields = ['product', 'repository', 'os', 'platform', 'version', 'operations', 'updaterNeeded']
			requiredFields.forEach(function(field) {
				if(!manifest[field]) {
					throw new Error('Update manifest is missing the required "' + field + '" field.');
				}
			});

			// Clean up object manifest
			manifest.services = manifest.services || [];
		
			manifest.operations.forEach(function(operation) {
				if(!(operation.op in fmpOperations)) {
					throw new Error('Operation "' + operation + '" found in the manifest is unknown.');
				}
			});

			manifest.cwd = path.resolve(path.dirname(filename));

			// Resolve promise, deliver manifest
			deferred.resolve(manifest);

		} catch(e) {
			deferred.reject(e);
		}
	});
	return deferred.promise;
}

function unpackUpdate(filename) {
	log.info('Unpacking update from '  + filename);
	var deferred = Q.defer();
	try {		
		var updateDir = path.resolve(TEMP_DIRECTORY, 'fmp-update');
		// Trash the update directory if it already exists
		fs.remove(updateDir, function(err) {
			// Create a new empty one
			fs.mkdir(updateDir, function(err) {
				if(err) { return deferred.reject(); }
				// Unpack the actual file into the newly created directory
				child_process.exec('tar -xvjf ' + path.resolve(filename), {cwd : updateDir}, function(err, stdout, stderr) {
					if(err) { return deferred.reject(err); }
					deferred.resolve(path.resolve(updateDir, 'manifest.json'));
				});
			});
		});
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise;
}

function executeOperation(operation) {
	var deferred = Q.defer();
	try {
		// Double check to make sure this operation is defined
		if(!(operation.op in fmpOperations)) {
			throw new Error('Operation "' + operation.op + '" found in the manifest is unknown.');
		}
		log.info('Executing operation: ' + operation.op)		
		// Execute the operation (return the operations promise to complete)
		return fmpOperations[operation.op](operation);
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise
}

function executeOperations(manifest) {
	deferred = Q.defer();
	var cwd = manifest.cwd
	async.eachSeries(
		manifest.operations,
		function(operation, callback) {
			operation.cwd = cwd;
			executeOperation(operation)
				.then(function() {callback();})
				.catch(callback)
		},
		function(err) {
			if(err) { return deferred.reject(err); }
			return deferred.resolve(manifest);
		}
	);
	return deferred.promise
}

function clearToken(manifest) {
	var deferred = Q.defer();

	if(manifest.token) {
		log.info('Clearing update token ' + manifest.token)
		fs.unlink(manifest.token, function(err) {
			// err is swallowed on purpose.  It's ok if this operation fails due to the file not existing
		    deferred.resolve(manifest);
		});
	} else {
		deferred.resolve(manifest);
	}
	return deferred.promise;
}

function setToken(manifest) {
	var deferred = Q.defer();
	log.info('Setting update token ' + manifest.token)
	if(manifest.token) {
		fs.writeFile(manifest.token, "", function(err) {
	    	if(err) {
	        	return deferred.reject(err);
		    }
		    deferred.resolve(manifest);
		}); 
	}
	return deferred.promise;
}

function stopService(service, callback) {
	log.info('Stopping service ' + service)

	var config = require('../config');
	var OS = config.platform;

	switch(OS) {
		case 'linux':
			child_process.exec('systemctl stop ' + service, {}, function(err, stdout, stderr) {
				if(err) { return callback(err); }
				callback();
			});
		break;

		default:
			setImmediate(callback);
		break;
	}
}

function startService(service, callback) {
	log.info('Starting service ' + service)

	var config = require('../config');
	var OS = config.platform;

	switch(OS) {
		case 'linux':
			child_process.exec('systemctl start  ' + service, {}, function(err, stdout, stderr) {
				if(err) { return callback(err); }
				callback();
			});
		break;

		default:
			setImmediate(callback);
		break;
	}
}

function stopServices(manifest) {
	var deferred = Q.defer();
	if (manifest.services.length > 0) {
		async.mapSeries(
			manifest.services,
			stopService,
			function(err) {
				if(err) { return deferred.reject(err); }
				return deferred.resolve(manifest);
			}
		);
	} else {
		deferred.resolve(manifest);
	}
	return deferred.promise
}

function startServices(manifest) {
	var deferred = Q.defer();
	if (manifest.services.length > 0) {
		async.mapSeries(
			manifest.services,
			startService,
			function(err) {
				if(err) { return deferred.reject(err); }
				return deferred.resolve(manifest);
			}
		);
	} else {
		deferred.resolve(manifest);
	}
	return deferred.promise
}

function unlock(manifest) {
	var deferred = Q.defer();
	log.info('Unlocking the disk')
	
	var config = require('../config');
	var OS = config.platform;

	switch(OS) {
		case 'linux':
			child_process.exec('mount -w -o remount /', {}, function(err, stdout, stderr) {
				if(err) { return deferred.reject(err); }
				deferred.resolve(manifest);
			});	
		break;

		default:
			deferred.resolve(manifest);
			break;
	}
	return deferred.promise;
}

function lock(manifest) {
	var deferred = Q.defer();
	log.info('Locking the disk')

	var config = require('../config');
	var OS = config.platform;

	switch(OS) {
		case 'linux':
			child_process.exec('mount -r -o remount /', {}, function(err, stdout, stderr) {
				if(err) { return deferred.reject(err); }
				deferred.resolve(manifest);
			});	
		break;

		default:
			deferred.resolve(manifest);
			break;
	}
	return deferred.promise;
}

function installUpdate(filename) {
	return unpackUpdate(filename)
	.then(loadManifest)
	.then(stopServices)
	.then(unlock)
	.then(clearToken)
	.then(executeOperations)
	.then(setToken)
	.then(lock)
	.then(startServices)
}

exports.installUpdate = installUpdate;