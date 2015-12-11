var Config = require('./config').Config;
var async = require('async');

var fs = require('fs');
var path = require('path');

var log = require('../log').logger('config');

var UpdaterConfig = require('./config_updater').UpdaterConfig;

function configureUpdater(callback) {
	exports.updater = new UpdaterConfig();
	exports.updater.init(callback);
}
exports.configureUpdater = configureUpdater;

exports.createDataDirectories = Config.createDataDirectories;
exports.getDataDir = Config.getDataDir;

exports.platform = require('process').platform;