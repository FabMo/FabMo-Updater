/* 
 * hooks/index.js
 *
 * This module defines the system hooks.
 *
 * Hooks are platform specific functions that are used by the updater for various functions.
 * Hooks are implemented by running external shell commands and processing their outputs.
 * The hierarchy of files in the /hooks directory is as follows:

 * /hooks           - Top Level Directory  
 *   /os            - linux, darwin, etc
 *     /platform    - edison, westinghouse, beaglebone, etc.
 *
 * Hooks for each platform are defined in in their respective directories as shell scripts
 * and then linked up with the methods contained in this file at runtime, providing a 
 * seamless interface to each function, regardless of platform
 */

var glob = require('glob');
var config = require('../config');
var log = require('../log').logger('hooks');
var cp = require('child_process');
var byline = require('byline');
var fs = require('fs');
var Q = require('q');
var updater = require('../updater');

// Task keys
var keys = {};

// Run the hook with the provided name
// This is done by using the os and platform to look up the appropriate script
// in the /hooks directory
//       name - The name of the hook (eg: install_engine, update_firmware, etc.)
//       args - List of arguments for the hook script
//   callback - Called when the hook is complete with (err, standard_output)
var execute = function(name, args, callback) {
	var deferred = Q.defer();
	callback = callback || function() {};
	try {
		hook = getHook(name);
	} catch(e) {
		deferred.reject(e);
		return deferred.promise;
	}
 	var hook_func = hook.func || function(err, stdout, stderr, cb) {
		cb = cb || function() {}
		cb(err, stdout);

		if(err) {
			return deferred.reject(err);
		}
		return deferred.resolve(stdout);
	}
	cp.exec(hook.file + ' ' + (args || ''), function(err, stdout, stderr) {
		if(stdout.trim() !== '') {
			log.shell(stdout);
		}
		hook_func(err, stdout, stderr, function(err, data) {
			if(err) {
				callback(err);
				return deferred.reject(err);
			}
			return deferred.resolve(callback(null, data));
		});
	});
	return deferred.promise;
}

// Spawn a detached process and return it
var spawn = function(name) {
	var hook = getHook(name);
	var out = fs.openSync('/tmp/factory_reset.log', 'a');
	var err = fs.openSync('/tmp/factory_reset.log', 'a');

	var child = cp.spawn(hook.file, [], {
		detached:true,
		stdio: ['ignore', out, err]
	});
	child.unref();
	return child;
}

// Return a path to the hook script for the specified hook name
//   name - The name of the hook to retrieve
var getHook = function(name) {
	var OS = config.platform;
	var PLATFORM = config.updater.get('platform');

	// JS Function for post processing the hook
	var hook_func = null;
	try {
		hook_func = require(__dirname + '/' + OS + '/' + PLATFORM)[name];
	} catch(e) {
		log.warn(e);
	}

	var hook_exec_pattern = __dirname + '/' + OS + '/'  + PLATFORM + '/' + name + '.*([a-zA-Z0-9])';
	var matches = [];

	try {
		matches = glob.sync(hook_exec_pattern);
	} catch(e) {
		log.error(e);
	}

	switch(matches.length) {
		case 0:
			throw new Error("No hook defined for " + name + " on " + PLATFORM + " platform");
			break;

		case 1:
			return {
				file : matches[0],
				func : hook_func
			}
		break;

		default:
			throw new Error("More than one hook defined for " + name + " on " + OS + '/' + PLATFORM + "??? ( " + matches + ' )');
			break;
	}
}

// Exported hooks

// Lock disks in read-only partitions
exports.lock = function(callback) {
	return execute('lock', null, callback);
}

// Unlock read-only partitions so writing can occur
exports.unlock = function(callback) {
	return execute('unlock', null, callback);
}

// Start/stop named services
//   service - Name of service to start/stop
exports.startService = function(service, callback) {
	return execute('start_service', service, callback);
}
exports.stopService = function(service, callback) {
	return execute('stop_service', service, callback);
}

// TODO Obsolete?
exports.reboot = function(callback) {
	execute('reboot', null, callback);
}

// TODO Obsolete?
exports.shutdown = function(callback) {
	execute('shutdown', null, callback);
}

// TODO Obsolete?
exports.getVersions = function(callback) {
	execute('get_versions', config.updater.get('engine_git_repos'), callback);
}

// Start/stop/restart the FabMo engine instance
exports.startEngine = function(callback) {
	execute('set_engine_state', 'start', callback);
}
exports.stopEngine = function(callback) {
	execute('set_engine_state', 'stop', callback);
}
exports.restartEngine = function(callback) {
	execute('set_engine_state', 'restart', callback);
}

exports.getEngineState = function(callback) {
	execute('get_engine_state', null, callback);
}

// TODO Obsolete?
exports.installEngine = function(version, callback) {
	var updater = require('./updater');

	callback = callback || function() {};
	var key = updater.startTask();
	updater.setState('updating');
	callback(null, key);
	var cp = execute('install_engine', config.updater.get('engine_git_repos') + ' ' + version, function(err,stdout) {
		if(err) {
			updater.failTask(key);
			log.error("Did not update to " + version + " successfully.");
		} else {
			updater.passTask(key);
			log.info("Updated to " + version + " successfully.");
		}
		updater.setState('idle');
	});

	var stdout = byline(cp.stdout);
	var stderr = byline(cp.stderr);

	stdout.on('data', function(line) {
		log.shell(line);
	});

	stderr.on('data', function(line) {
		log.shell(line);
	});
}

// TODO Obsolete?
exports.updateEngine = function(version, callback) {

	callback = callback || function() {};
	var key = updater.startTask();
	updater.setState('updating');
	callback(null, key);
	var cp = execute('update_engine', version, function(err,stdout) {
		if(err) {
			updater.failTask(key);
			log.error("Did not update to " + version + " successfully.");
		} else {
			updater.passTask(key);
			log.info("Updated to " + version + " successfully.");
		}

		updater.setState('idle');

	});

	var stdout = byline(cp.stdout);
	var stderr = byline(cp.stderr);

	stdout.on('data', function(line) {
		log.shell(line);
	});

	stderr.on('data', function(line) {
		log.shell(line);
	});

}

// TODO Obsolete?
exports.installFirmware = function(filename, callback) {
	return execute('update_firmware', filename, callback);
}

// Execute the FMU specified
//   filename - Full path to FMU file
exports.doFMU = function(filename, callback) {
	var updater = require('../updater');
	var callback = callback || function() {};
	var key = updater.startTask();
	updater.setState('updating');

	var deferred = Q.defer();
	execute('do_fmu', filename, function(err,stdout) {
		if(err) {
			updater.failTask(key);
			log.error("Did not execute FMU successfully.");
			deferred.reject(err);
		} else {
			updater.passTask(key);
			log.info("Executed FMU successfully.");
			deferred.resolve(key);
		}
		updater.setState('idle');
	});
	callback(null, key);
	return deferred.promise;
}

// Update the G2 firmware specified by filename
//   filename - Full path to firmware file to apply
exports.updateFirmware = function(filename, callback) {
	var updater = require('./updater');
	callback = callback || function() {};
	var key = updater.startTask();
	updater.setState('updating');
	callback(null, key);
	var cp = execute('update_firmware', filename, function(err, stdout) {
		if(err) {
			updater.failTask(key);
			log.error("Did not update firmware successfully.");
		} else {
			updater.passTask(key);
			log.info("Updated firmware successfully.");
		}
		updater.setState('idle');
	});

	var stdout = byline(cp.stdout);
	var stderr = byline(cp.stderr);

	stdout.on('data', function(line) {
		log.shell(line);
	});

	stderr.on('data', function(line) {
		log.shell(line);
	});
}

// Initiate a factory reset
exports.factoryReset = function(callback) {
	var updater = require('../updater');
	updater.setState('updating');
	spawn('factory_reset');
}

// Initiate an updater self-update
exports.updateUpdater = function(callback) {
	var updater = require('./updater');
	updater.setState('updating');
	spawn('update_updater');
}

// Set the system time to the provided string
//   time_string - Time string with this format: 'YYYY-MM-DD HH:mm:ss'
exports.setTime = function(time_string, callback) {
	execute('set_time', time_string, callback);
}

// Get the machine unique ID
exports.getUniqueID = function(callback) {
	execute('get_unique_id', null, function(err, data) {
		if(err) { return callback(err); }
		var id = data.trim();
		callback(null, id);
	});
}

// Get the current operating system version
exports.getOSVersion = function(callback) {
	execute('get_os_version', null, function(err, data) {
		if(err) { return callback(err); }
		// For now, this will work on Mac OS and Linux, @todo move cleanup to the script
		var v = data.replace(/ProductName:|ProductVersion:|BuildVersion:/gi, '').replace(/\t/gi,'').replace(/\n/gi,' ').trim();
		callback(null, v);
	});
}
