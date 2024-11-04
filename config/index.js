/*
 * config/index.js
 * 
 * This is the configuration package, which manages the updater's settings.
 * A more complex but same-in-principle system can be found in the FabMo engine in the same directory.
 */
var Config = require('./config').Config;
var async = require('async');

var fs = require('fs');
var path = require('path');

var log = require('../log').logger('config');

var UpdaterConfig = require('./config_updater').UpdaterConfig;
var UserConfig = require('./user_config').UserConfig;

// Initialize the updater configuration.  Call once at startup.
//   callback - Called when initalization is complete or if error
function configureUpdater(callback) {
	exports.updater = new UpdaterConfig();
//	exports.updater.init(callback);
    exports.updater.init(function() {
        callback();
    });
}

// Initialize the user configuration.  Call once at startup.
//   callback - Called when initalization is complete or if error
function configureUser(callback){
	exports.user = new UserConfig();
	var userFile = exports.user.getConfigFile();
	log.debug('Loading user configuration from ' + userFile);

	// The very first time we load the user config, if we don't find it, we should create it.  The engine will do the same.
	exports.user.load(userFile, function(err, data) {
		if(err) {
			if(err.code === "ENOENT") {
				log.warn('Configuration file ' + userFile + ' not found. Setting up first user');
				exports.user.setUpFile(function(err){
					if(err) {
						console.log(err);
					} else {
						configureUser(callback);
					}
				});
			} else {
				log.warn('Problem loading the user configuration file "' + userFile + '": ' + err.message);
			}
		} else {
			exports.user.initUsers(data, function(msg){
                log.info("Export Init Users -2- .... -->message: " + msg);
			 	callback();
			});	
		}
	});
}

exports.configureUser = configureUser;
exports.configureUpdater = configureUpdater;

exports.createDataDirectories = Config.createDataDirectories;
exports.getDataDir = Config.getDataDir;

// TODO - Silly?
exports.platform = require('process').platform;
