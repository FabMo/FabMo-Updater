var Q = require('q');
var fs = require('fs-extra');
var fmpOperations = require('./fmp_operations');
var child_process = require('child_process');
var os = require('os');
var async = require('async');

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

			// Resolve promise, deliver manifest
			deferred.resolve(manifest);

		} catch(e) {
			deferred.reject(e);
		}
	});
	return deferred.promise;
}

function unpackUpdate(filename) {
	var deferred = Q.defer();
	try {		
		var updateDir = path.join(TEMP_DIRECTORY, 'fmp-update');
		// Trash the update directory if it already exists
		fs.remove(updateDir, function(err) {
			// Create a new empty one
			fs.mkdir(updateDir, function(err) {
				if(err) { return deferred.reject(); }
				// Unpack the actual file into the newly created directory
				child_process.exec('tar -xvjf ' + filename, {cwd : updateDir}, function(err, stdout, stderr) {
					if(err) { return deferred.reject(); }
					deferred.resolve();
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
			throw new Error('Operation "' + operation + '" found in the manifest is unknown.');
		}		
		// Execute the operation (return the operations promise to complete)
		return fmpOperations[operation.op](operation);
	} catch(e) {
		deferred.reject(e);
	}
	return deferred.promise
}

function executeUpdate(manifest) {
	deferred = Q.defer();
	async.eachSeries(
		manifest.operations, 
		function(operation, callback) {
			executeOperation(operation)
				.then(function() {callback();})
				.catch(callback)
		},
		function(err) {
			if(err) { return Q.reject(err); }
			return Q.resolve();
		}
	);
}

exports.loadManifest = loadManifest;
exports.executeUpdate = executeUpdate;