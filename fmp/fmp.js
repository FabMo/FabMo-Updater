var Q = require('q');
var fs = require('fs-extra');
var fmpOperations = require('./fmp_operations');
var child_process = require('child_process');
var os = require('os');
var async = require('async');
var path = require('path');
var log = require('../log').logger('fmp');
var config = require('../config');
var engine = require('../engine');
var http = require('http');
var https = require('https');
var fs = require('fs-extra');
var util = require('../util');
var TEMP_DIRECTORY = os.tmpdir();
var request = require('request');

// Compare two semantic version strings, which can be of the form 1.2.3, v1.2.3, V 1.2.3, etc.
// Returns 1 for a > b, 0 for equal, and -1 for a < b
function compareVersions(a,b) {
	try {
		a = a.replace(/v|\s/ig, '').split('.').map(function(x) {return parseInt(x,10)});
		b = b.replace(/v|\s/ig, '').split('.').map(function(x) {return parseInt(x,10)});		
		if (a.length !== 3 || b.length !== 3) {
			throw new Error()
		}
	} catch(err) {
		throw new Error('Invalid version number format')
	}
	if(a[0] === b[0]) {
		if(a[1] === b[1]) {
			if(a[2] === b[2]) {
				return 0
			} else {
				return a[2] > b[2] ? 1 : -1;
			}
		} else {
			return a[1] > b[1] ? 1 : -1;
		}
	} else {
		return a[0] > b[0] ? 1 : -1;
	}
}

// Return a promise that fulfills with a registry object loaded from the provided URL
function fetchUpdateRegistry(url) {
	log.info('Retrieving a list of packages from ' + url)
	return util.httpGET(url)
		.then(function(body) {
			var p = JSON.parse(body);
			return p
		});
}

// Given the filename for a package manifest, return a promise that fulfills with the manifest object
// Basic checks are performed on the manifest to determine whether or not it is legitimate
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

// Given the unpac
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
				child_process.exec('tar -xzf ' + path.resolve(filename), {cwd : updateDir}, function(err, stdout, stderr) {
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

function installPackage(package) {
	if(!package || !package.local_filename) {
		return Q();
	}
	log.info('Installing package ' + package.local_filename);
	return unpackUpdate(package.local_filename)
	.then(loadManifest)
	.then(stopServices)
	.then(unlock)
	.then(clearToken)
	.then(executeOperations)
	.then(setToken)
	.finally(lock)
	.then(startServices)
}

function filterPackagesByProduct(registry, product) {
	var packages =  registry.packages.filter(function(package) {
		return (package.product === product);
	})
	return packages.sort(function(a,b) {
		return compareVersions(a.version, b.version);
	}).reverse();
}

function downloadPackage(package) {
	
	// Deal with insane package
	if(!package) {return Q();}
	if(!package.url) {
		log.warn('No url specified in download package');
		return Q();
	}

	var deferred = Q.defer();
	var filename = "/opt/fabmo/update.fmp";
	log.info('Starting download of ' + package.url);
	var file = fs.createWriteStream(filename);
	request(package.url)
		.on('error', function(err) { // Handle errors
    		deferred.reject(err);
  		})
		.pipe(file).on('finish', function() {
			file.close(function(err) {
      			if(err) { 
      				return deferred.reject(err); 
      			}
	  			log.info('Download of ' + package.url + ' is complete.')
  				package.local_filename = filename;
  				deferred.resolve(package);
      			});  // close() is async, call cb after close completes.
    		});

	return deferred.promise;
}

// Check the package source for an available update that is appropriate for the provided constraints
function checkForAvailablePackage(options) {
	var updateSource = config.updater.get('engine_package_source');
	var OS = config.updater.get('os');
	var options = options || {};

	log.info("Checking online source for updates");
	return fetchUpdateRegistry(updateSource)
		.then(function(registry) {
			var deferred = Q.defer();

			// Cut down the list of packages to only ones for the specified product
			engineUpdates = filterPackagesByProduct(registry, options.product);
		
			// If no updates are available for the product, end the process
			if(engineUpdates.length == 0) {
				return deferred.resolve();
			}

			// Read the version manifest for the currently installed engine
			engine.getVersion(function(err, engineVersion) {
				if(err) {
					deferred.reject(err);
				}

				// Determine if the newest package listed in the package registry is newer than the installed version
				var newerPackageAvailable = false;
				try {
					var newerPackageAvailable = compareVersions(engineUpdates[0].version, engineVersion.number) > 0;
				} catch(e) {
					return deferred.resolve(engineUpdates[0]);
					log.warn(e);
				}

				// If so, return it, or return nothing if not
				if(newerPackageAvailable) {
					log.info("A newer package update is available!");
					return deferred.resolve(engineUpdates[0]);
				}
				return deferred.resolve();
			});
			return deferred.promise;
		});
}


exports.installPackage = installPackage;
exports.checkForAvailablePackage = checkForAvailablePackage;
exports.downloadPackage = downloadPackage;
