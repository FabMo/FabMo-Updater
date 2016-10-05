var glob = require('glob');
var config = require('../config');
var log = require('../log').logger('hooks');
var cp = require('child_process');
var byline = require('byline');
var fs = require('fs');
var Q = require('q');

// Task keys
var keys = {};

var execute = function(name, args, callback) {
	var deferred = Q.defer();
	callback = callback || function() {};
	try {
		hook = getHook(name);
	} catch(e) {
		deferred.reject(e);
		return deferred.promise;
	}
	log.debug('Executing hook: ' + hook.file);
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

exports.lock = function(callback) {
	return execute('lock', null, callback);
}

exports.unlock = function(callback) {
	return execute('unlock', null, callback);
}

exports.startService = function(service, callback) {
	return execute('start_service', service, callback);
}

exports.stopService = function(service, callback) {
	return execute('stop_service', service, callback);
}

exports.reboot = function(callback) {
	execute('reboot', null, callback);
}

exports.shutdown = function(callback) {
	execute('shutdown', null, callback);
}

exports.getVersions = function(callback) {
	execute('get_versions', config.updater.get('engine_git_repos'), callback);
}

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

exports.updateEngine = function(version, callback) {
	var updater = require('./updater');

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

exports.doFMU = function(filename, callback) {
	var updater = require('./updater');
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

exports.installFirmware = function(filename, callback) {
	log.info('Install FIRMWARE')
	return execute('update_firmware', filename, callback);
}

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

exports.factoryReset = function(callback) {
	var updater = require('./updater');
	updater.setState('updating');
	spawn('factory_reset');
}

exports.updateUpdater = function(callback) {
	var updater = require('./updater');
	updater.setState('updating');
	spawn('update_updater');
}

exports.setTime = function(time_string, callback) {
	execute('set_time', time_string, callback);
}

exports.getUniqueID = function(callback) {
	execute('get_unique_id', null, function(err, data) {
		if(err) { return callback(err); }
		var id = data.trim();
		callback(null, id);
	});
}

exports.getOSVersion = function(callback) {
	execute('get_os_version', null, function(err, data) {
		if(err) { return callback(err); }
		// For now, this will work on Mac OS and Linux, @todo move cleanup to the script
		var v = data.replace(/ProductName:|ProductVersion:|BuildVersion:/gi, '').replace(/\t/gi,'').replace(/\n/gi,' ').trim();
		callback(null, v);
	});
}
