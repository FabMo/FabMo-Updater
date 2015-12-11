var glob = require('glob');
var config = require('./config');
var log = require('./log').logger('hooks');
var exec = require('child_process').exec;
var byline = require('byline');
var OS = config.platform;
var PLATFORM = config.updater.get('platform');

var execute = function(name, args, callback) {

	callback = callback || function() {};

	// JS Function for post processing the hook
	var hook_func = null;
	try {
		hook_func = require('./hooks/' + OS + '/' + PLATFORM)[name];
	} catch(e) {
		log.warn(e);
	}
 	hook_func = hook_func || function(err, stdout, stderr, callback) {
		callback(err, stdout);
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
			setImmediate(callback, new Error("No hook defined for " + name + " on " + PLATFORM + " platform"));
			break;

		case 1:
			var match = matches[0];
			log.info("Running hook " + match);
			return exec(match + ' ' + (args || ''), function(err, stdout, stderr) {
				hook_func(err, stdout, stderr, callback);
			});
		break;

		default:
			setImmediate(callback, new Error("More than one hook defined for " + name + " on " + PLATFORM + "???"));
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
	execute('engine_state', 'start', callback);
}

exports.stopEngine = function(callback) {
	execute('engine_state', 'stop', callback);
}

exports.restartEngine = function(callback) {
	execute('engine_state', 'restart', callback);
}

exports.updateEngine = function(version, callback) {
	var cp = execute('update_engine', version, callback);
	var stdout = byline(cp.stdout);
	var stderr = byline(cp.stderr);

	stdout.on('data', function(chunk) {
		log.debug(chunk);
	});

	stderr.on('data', function(chunk) {
		log.error(chunk);
	});

}

