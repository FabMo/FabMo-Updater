/*
 * fmp.js
 * 
 * This package defines the functions for dealing with fmp packages.
 *
 * An .fmp (FabMo Package) is a package that is used to deliver updates to a 
 * FabMo instance.  A FabMo package is just a tarball with a manifest that explains
 * how files in the archive should be installed, and what commands should be executed
 * pre- and post-installation.  Rather than a detailed explanation or specification
 * here, to learn about the package manifest format, look at the `example` directory
 * that is in the same directory as this file.  It contains a few example packages.  
 * For more detail about the kinds of operations that are supported by .fmp files, 
 * check out `fmp_operations.js`
 */
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
var request = require('request');

// TODO - this is platform specific
var TEMP_DIRECTORY = '/tmp';

// Parse a version string, and return an object that describes details of the version number
// Example:
//   parseVersion('v2.3.3-g20ec0a1-rc') -> 
//      {
//	       dirty:false, 
//           scm:'git', 
//          hash:'20ec0a1',
//          type:'rc',
//         major:2,
//         minor:3,
//         patch:3
//		}
function parseVersion(v) {
	var retval = {
		'dirty' : false,
		'scm' : null,
		'hash' : null
	}
	var parts = v.split('-');
	var type = null;
	var hash = null;
	if(parts[2]) {
		type = parts[2];
		hash = parts[1];
	} else if(parts[1]) {
		hash = parts[1];
		type = 'dev';
	} else {
		type = 'release';
	}

	switch(type) {
		case 'dev':
		case 'rc':
		case 'release':
			retval.type = type;
		break;
		case 'rel':
			retval.type = 'release';
		break;
		default:
			throw new Error('Unknown release type ' + type);
		break;
	}

	if(hash) {
		hash = hash.trim()
		if(hash[0] === 'g') {
			retval.scm = 'git'
			hash = hash.replace('g','');
		}

		if(hash.search('!') >= 0) {
			retval.dirty = true;
			hash = hash.replace('!','');
		}
		retval.hash = hash;
	}

	mmp = parts[0].replace(/v?|\s/ig, '').split('.').map(function(x) {return parseInt(x,10)});
	if(mmp.length != 3) {
		throw new Error('Invalid version number: ' + parts[0]);
	}
	retval.major = mmp[0];
	retval.minor = mmp[1];
	retval.patch = mmp[2];

	if(retval.type === 'release' && (retval.dirty || retval.hash)) {
		throw new Error('Invalid version string: ' + v);
	}
	retval.number = v;
	return retval;
}

// Compare two semantic version strings, which can be of the form 1.2.3, v1.2.3, V 1.2.3, etc.
// Returns 1 for a > b, 0 for equal, and -1 for a < b
// A released version is always considered to be "greater" than a dev/rc version
function compareVersions(a,b) {
	a = parseVersion(a);
	b = parseVersion(b);
	if(a.type === 'release' && b.type !== 'release') {
		return (b.type === 'dev') || (b.type === 'rc') ? 1 : -1;
	} else if(b.type === 'release' && a.type !== 'release') {
		// TODO: This looks like a bug to me
		return (a.type === 'dev') || (b.type === 'rc') ? -1 : 1;
	}
	if(a.major === b.major) {
		if(a.minor === b.minor) {
			if(a.patch === b.patch) {
				return 0;
			} else {
				return a.patch > b.patch ? 1 : -1;
			}
		} else {
			return a.minor > b.minor ? 1 : -1;
		}
	} else {
		return a.major > b.major ? 1 : -1;
	}
}

// Compare two products, indicating which one is of higher update priority
function compareProducts(a,b) {
	if(a.product === 'FabMo-Updater') {
		return b.product === 'FabMo-Updater' ? 0 : -1;
	}
	if(b.product === 'FabMo-Updater') {
		return a.product === 'FabMo-Updater' ? 0 : 1;
	}
	return 0;
}

// Return a promise that fulfills with a registry object loaded from the provided URL
// Returns a promise that resolves with the parsed packages list (or rejects with an error)
//   url - The url from which to retrieve the list of packages
function fetchPackagesList(url) {
	log.info('Retrieving a list of packages from ' + url)
	var deferred = Q.defer();
	try {
		// TODO - Magic number - pull this timeout out
		request(url, {timeout: 5000}, function (error, response, body) {
		  	if(error) {
		  		return deferred.reject(error);
		  	}
		  	if (response.statusCode == 200) {

		    	try {
		    		var p = JSON.parse(body);
					return deferred.resolve(p);
		    	} catch(err) {
		    		return deferred.reject(err);
		    	}
		  	} else {
		  		return deferred.reject(new Error(response.statusMessage));
		  	}
		});
	} catch(err) {
		deferred.reject(err);
	}
	return deferred.promise;
}

// Given the filename for a package manifest, return a promise that fulfills with the manifest object
// Basic checks are performed on the manifest to determine whether or not it is legitimate
// Returns a promise that resolves with the parsed/cleaned up manifest or rejects with an error
//   filename - Full path to the manifest file
function loadManifest(filename) {
	log.info('Loading the package manifest ' + filename);
	var deferred = Q.defer()
	fs.readFile(filename, 'utf8', function (err, data) {
		if(err) {
			log.error('Could not read the package manifest file.');
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
				if(!operation.op) {
					throw new Error('Malformed operation in manifest.')
				}
				if(!(operation.op in fmpOperations)) {
					throw new Error('Operation "' + operation.op + '" found in the manifest is unknown.');
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

// Given a filename, unpack the update into a temporary directory.  
// Return a promise that fulfills with the path to the package manifest (or rejects with error)
//   filename - Full path to the package to unpack
function unpackPackage(filename) {
	log.info('Unpacking update from '  + filename);
	var deferred = Q.defer();
	try {
		var updateDir = path.resolve(TEMP_DIRECTORY, 'fmp-update');

		// Trash the update directory if it already exists
		fs.remove(updateDir, function(err) {
			// Create a new empty one
			fs.mkdir(updateDir, function(err) {
				if(err) { return deferred.reject(err); }
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

// Execute an operation object found in the package manifest.  
// Return a promise that resolves with the result of the operation.
//   operation - The operation object.  See fmp_operations.js for viable operations
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

// Execute the operations in the provided manifest in sequence. Return a promise that resolves with the package manifest object.
//   manifest - Parsed manifest containing the operations to execute.
function executeOperations(manifest) {
	var deferred = Q.defer();
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
			if(err) {
				return deferred.reject(err);
			}
			return deferred.resolve(manifest);
		}
	);
	return deferred.promise
}

// Delete the token file specified by the provided package manifest.  Do nothing if there is no token file specified.
// Return a promise that resolves with the manifest object
//   manifest - Parsed manifest object that may or may not contain a token attribute
function clearToken(manifest) {
	var deferred = Q.defer();

	if(!manifest) { deferred.reject(new Error('No manifest was provided.')); }
	else if(manifest.token) {
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

// Create the token file specified by the provided package manifest.  Do nothing if there is no token file specified.
// Return a promise that resolves with the manifest object
//   manifest - Parsed manifest object that may or may not contain a token attribute
function setToken(manifest) {
	var deferred = Q.defer();

	if(!manifest) { deferred.reject(new Error('No manifest was provided.')); }
	else if(manifest.token) {
		log.info('Setting update token ' + manifest.token)
		fs.writeFile(manifest.token, "", function(err) {
	    	if(err) {
	        	return deferred.reject(err);
		    }
		    deferred.resolve(manifest);
		});
	}
	return deferred.promise;
}

// Stop the named service specified
//   service - The system service to stop
//   callback - Callback with null or error if there was an error.
function stopService(service, callback) {
	log.info('Stopping service ' + service)

	var hooks = require('../hooks');
	return hooks.stopService(service).then(callback).done();
}

// Start the named service specified
// TODO: Above, in startService we return the return value of hooks.stopService, which is nothing
//       These two function should be symmetrical,  minimally, and they should maybe return promises?
//   service - The system service to start
//   callback - Callback with null or error if there was an error.
function startService(service, callback) {
	log.info('Starting service ' + service)
	var hooks = require('../hooks');
	hooks.startService(service).then(callback).done();
}

// Stop all the services in the provided manifest.
// Returns a promise that resolves with the manifest object
//   manifest - Manifest object containing the list of services to stop
function stopServices(manifest) {
	var deferred = Q.defer();
	if (manifest && manifest.services && manifest.services.length > 0) {
		log.info('Stopping services');
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

// Start all the services in the provided manifest.
// Returns a promise that resolves with the manifest object
//   manifest - Manifest object containing the list of services to start
function startServices(manifest) {
	var deferred = Q.defer();
	try {
		if (manifest && manifest.services && manifest.services.length > 0) {
			log.info('Starting services');
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
	} catch(err) {
		deferred.reject(err);
	}

	return deferred.promise
}

// Unlock the installation
// Return a promise that resolves with the manifest object
//   manifest - The parsed manifest object.  Not used, but pass through for promise chaining
function unlock(manifest) {
	try {
		if(manifest) {
			log.info('Unlocking the installation');
			return require('../hooks').unlock().then(function() { return manifest; });
		}
		return Q(manifest);
	} catch(err) {
		return Q.reject(err);
	}
}

// Lock the installation
// Return a promise that resolves with the manifest object
//   manifest - The parsed manifest object.  Not used, but pass through for promise chaining
function lock(manifest) {
	try {
		log.info('Locking the installation');
		return require('../hooks').lock().then(function() { return manifest; });
	} catch(err) {
		return Q.reject(err);
	}
}

// Install a package from the provided file
//   package - Path to the package file
function installPackage(package) {
	if(!package || !package.local_filename) {
		return Q();
	}
	return installPackageFromFile(package.local_filename);
}

// Install a package from the provided file
// Return a promise that resolves with the manifest object
// TODO - why the redundancy with installPackage above (do we really need both?)
//   package - Path to the package file
function installPackageFromFile(filename) {
	if(!filename) {
		return Q();
	}
	log.info('Installing package ' + filename);
	return unpackPackage(filename)
		.then(installUnpackedPackage)

}

// Install a package that has already been unpacked.
// Return a promise that resolves with the manifest object (or rejects with an error) 
// after installation is complete (or fails).
//   manifest_filename - Full path to the manifest file in the root directory of the package. 
function installUnpackedPackage(manifest_filename) {
	var manifest;

	return loadManifest(manifest_filename)
		.then(function(m) {
			manifest = m;
			return m;
		})
		.then(stopServices)
		.then(unlock)
		.then(clearToken)
		.then(executeOperations)
		.then(setToken)
		.finally(lock)
		.then(function() {
			return startServices(manifest);
		});
}

// Filter the list of packages in a registry down to only packages that meet certain criteria
// This is used mainly to take a package registry that might contain entries for multiple products
// and platforms, and cut it down to only packages that are relevant to this maching.
// Packages are returned in update priority order, which means for packages that are the same product
// the highest-version-numbered version is first in the list.  For packages that are different products,
// The product that should be updated first is first.  See `compareVersions` and `compareProducts` for
// a primer on how this works.
//   options - Options maps keys to values that represent packages that are allowable.
//             Example 1:  filterPackages(registry, {os : 'linux', platform : 'edison'})
//                         would return a list of packages appropriate to a linux/edison installation
//             Example 2:  filterPackages(registry, {product : 'FabMo-Engine'}))
//                         would return a list of packages only for the engine. (Regardless of platform)
//             Special Values: Option values can be '*' which would allow for any value of that attribut
//                             Option values can also be multiple values, separated by '|' characters
//             Example 3:  filterPackages(registry, {product : 'FabMo-Engine|FabMo-Updater', })
//                         would return a list of packages only for the engine OR the updater.
function filterPackages(registry, options) {
	// If we didn't get a sane input, return a list of no packages
	// TODO - I'm sure there's a reason not to throw an exception here, but it might
	//        make more sense to raise an error if we were called with something that isn't registry-like
	if(!registry || !registry.packages) { return []; }

	// 
	var packages = registry.packages.filter(function(package) {
		// This function returns true if a package is to be kept, based on its attributes
		for(var key in options) {
			if(options.hasOwnProperty(key)) {
				try {
					allowed = options[key].split('|');
					var accept = false;
					for(var i=0; i<allowed.length; i++) {
						var field = allowed[i];
						// Accept this package if keys match
						if(field === package[key] || package[key] === '*') {
							accept = true;
							break;
						}
					}
					if(!accept) {
						return false;
					}
				} catch(e) {
					return false;
				}
			}
		}
		// TODO This should probably be false?  This reads as an 'accept' type filter above, so 
		// if we pass *no* options above, it should reject everything?
		return true;
	});

    // Packages are returned in update-priority order
	return packages
		.sort(function(a,b) {
			if(a.product === b.product) {
				return compareVersions(a.version, b.version);
			}
			return compareProducts(a.product, b.product);
		})
		.reverse();
}

// Given a package metadata object (from the package registry)
// Download the actual package file (specified by package.url)
// Return a promise that resolves with the package object
//   package - Package metadata object from the package registry.  (Anything with a 'url' attribute will do)
function downloadPackage(package) {
	// Deal with insane package
	if(!package) {return Q();}
	if(!package.url) {
		log.warn('No url specified in download package');
		return Q();
	}

	var deferred = Q.defer();
	// TODO this is a magic path - this should be specified in the settings somewhere
	//      (or defined up at the top of this file, or passed in as an argument)
	var filename = "/opt/fabmo/update.fmp";

	// Kick off the package download with request
	log.info('Starting download of ' + package.url);
	var file = fs.createWriteStream(filename);
	var statusCode;
	var statusMessage;
	request(package.url)
		.on('error', function(err) { // Handle errors
    		deferred.reject(err);
  		})
  		.on('response', function(response) {
  			statusCode = response.statusCode;
  			statusMessage = response.statusMessage;
  		})
		.pipe(file).on('finish', function() {
			file.close(function(err) {
      			if(err) {
      				return deferred.reject(err);
      			}
      			if(statusCode !== 200) {
      				return deferred.reject(new Error(statusCode + ' ' + statusMessage));
      			}
      			// Resolve with the package object
	  			log.info('Download of ' + package.url + ' is complete.')
  				package.local_filename = filename;
  				deferred.resolve(package);
      			});  // close() is async, call cb after close completes.
    		});

	return deferred.promise;
}

// Check the package source for an available update that is appropriate for the provided constraints
// This check is constrained to the current platform and OS.
// Returns a promise that resolves with the next available package to install (or rejects with an error)
//   product - The product for which updates are being checked.
function checkForAvailablePackage(product) {
	var updateSource = config.updater.get('packages_url');
	var OS = config.platform;
	var PLATFORM = config.updater.get('platform');
	var options = options || {};

	log.info("Checking online source for updates");
	return fetchPackagesList(updateSource)
		.then(function(registry) {
			var deferred = Q.defer();
			// Cut down the list of packages to only ones for the specified product
			updates = filterPackages(registry, {platform : PLATFORM, os : OS, 'product' : product});

			if('type' in registry && (registry.type === 'dev' || registry.type === 'rc')) {
				updates = updates
						.sort(function(a,b) {
							if(a === b) { return 0;}
							if(a < b) { return 1;}
							return -1;
						})
			}

			// If no updates are available for the product, end the process
			if(updates.length == 0) {
				return deferred.resolve();
			}

			var getVersion = function(err, callback) {
				callback(null, {number: 'v0.0.0'});
			};

			switch(product) {
				case 'FabMo-Engine':
					getVersion = engine.getVersion;
					break;
				case 'FabMo-Updater':
					getVersion = require('../updater').getVersion;
					break;
				default:
					break;
			}
			// Read the version manifest for the currently installed product
			getVersion(function(err, version) {
				if(err) {
					deferred.reject(err);
				}

				// Determine if the newest package listed in the package registry is newer than the installed version
				var newerPackageAvailable = false;
				try {
					// A 'dev' package registry works differently:  More aggressive about updates, and uses dates.
					if('type' in registry && (registry.type === 'dev' || registry.type === 'rc')) {
						if(version.type !== registry.type) {
							log.debug("Installation type doesn't match registry. (" + version.type + "!=" + registry.type + ") Taking newest package.")
							// If the registry type is dev, and the type of the current install is anything but dev,
							// take the newest package in the list
							newerPackageAvailable = true;
						} else if(!version.date) {
							log.debug('No date on our installation - Taking newest package')
							// If there's no date on the installed installation, take the newest package in the list
							newerPackageAvailable = true;
						}
						else {
							// If there's a date on our installed package, take the newest one in the list only if
							// it's newer than the one we have installed.
							newerPackageAvailable = updates[0].date > version.date;
							if(newerPackageAvailable) {
								log.debug('Newer package available.  ' + updates[0].date + ' > ' + version.date);
							} else {
								log.debug('No newer packages in the registry.');
							}
						}
					} else {
						var newerPackageAvailable = compareVersions(updates[0].version, version.number) > 0;
					}
				} catch(e) {
					log.warn(e);
					return deferred.resolve(updates[0]);
				}

				// If so, return it, or return nothing if not
				if(newerPackageAvailable) {
					log.info("A newer package update is available!");
					console.log(updates[0])
					return deferred.resolve(updates[0]);
				}
				return deferred.resolve();
			});
			return deferred.promise;
		});
}


exports.installPackage = installPackage;
exports.installUnpackedPackage = installUnpackedPackage;
exports.installPackageFromFile = installPackageFromFile
exports.checkForAvailablePackage = checkForAvailablePackage;
exports.downloadPackage = downloadPackage;
exports.parseVersion = parseVersion;
