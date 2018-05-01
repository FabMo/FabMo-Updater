var Config = require('./config').Config;
var async = require('async');

var fs = require('fs');
var path = require('path');

var log = require('../log').logger('config');

var UpdaterConfig = require('./config_updater').UpdaterConfig;
var UserConfig = require('./user_config').UserConfig;

function configureUpdater(callback) {
	exports.updater = new UpdaterConfig();
	exports.updater.init(callback);
}

function configureUser(callback){
	exports.user = new UserConfig();
	console.log('gonna get config');
	var userFile = exports.user.getConfigFile();
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
				log.info(msg);
				callback();
			});	
		}
	});
}

exports.configureUser = configureUser;
exports.configureUpdater = configureUpdater;

exports.createDataDirectories = Config.createDataDirectories;
exports.getDataDir = Config.getDataDir;

exports.platform = require('process').platform;
