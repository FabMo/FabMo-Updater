var glob = require('glob');
var config = require('./config');
var log = require('./log').logger('hooks');
var cp = require('child_process');
var byline = require('byline');
//var updater = require('./updater');

var keys = {};

var execute = function(name, args, callback) {
	callback = callback || function() {};
	hook = getHook(name);
 	var hook_func = hook.func || function(err, stdout, stderr, callback) {
		callback(err, stdout);
	}
	return cp.exec(hook.file + ' ' + (args || ''), function(err, stdout, stderr) {
				log.shell(stdout);	
				hook_func(err, stdout, stderr, callback);
			});
}

var spawn = function(name) {
	hook = getHook(name);
	return cp.spawn(hook.file, [], {detached:true});
}

var getHook = function(name) {
	var OS = config.platform;
	var PLATFORM = config.updater.get('platform');


	// JS Function for post processing the hook
	var hook_func = null;
	try {
		hook_func = require('./hooks/' + OS + '/' + PLATFORM)[name];
	} catch(e) {
		log.warn(e);
	}

	var hook_exec_pattern = './hooks/' + OS + '/'  + PLATFORM + '/' + name + '.*';
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
			throw new Error("More than one hook defined for " + name + " on " + PLATFORM + "???");
			break;
	}
}

// Exported hooks

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
	callback();
}
