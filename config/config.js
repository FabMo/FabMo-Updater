/*
 * config.js
 * 
 * This module defines functions and objects that make up the 
 * configuration system in the FabMo updater.
 */

var async = require('async');
var fs = require('fs');
var path = require('path');
var PLATFORM = require('process').platform;
var log = require('../log').logger('config');
var util = require('util');
var events = require('events');
var EventEmitter = require('events').EventEmitter;

// Config is the superclass from which all configuration objects descend
//   config_name - All configuration objects have a name, which among other things,
//                 determines the filename for the stored configuration.
Config = function(config_name) {
	this._cache = {};
	this.config_name = config_name;
	this.default_config_file = __dirname + '/default/' + config_name + '.json';
	this.config_file = Config.getDataDir('config') + '/' + config_name + '.json';
	this._loaded = false;
	this.userConfigLoaded = false;
	EventEmitter.call(this);
};
util.inherits(Config, events.EventEmitter);

// Get the value for the provided key
Config.prototype.get = function(k) {
	return this._cache[k];
};

// Get the values for the provided array of keys.
// Returns an object mapping keys to values.
Config.prototype.getMany = function(arr) {
	retval = {};
	for(var i in arr) {
		key = arr[i];
		retval[key] = this._cache[key];
	}
	return retval;
};

// Set the configuration value for the provided key.
// This causes the configuration to be saved to disk
// This function calls `update()` internally, which is provided by subclasses
//          k - The key value
//          v - The new values
//   callback - Called once the config is updated (which might take some time)
Config.prototype.set = function(k,v, callback) {
	var u = {}
	u[k] = v;
	return this.update(u, callback);
};

// Return the internal data structure that contains all configuration values
// CAREFUL - this returns the actual cache, not a copy.
Config.prototype.getData = function() {
	return this._cache;
};

// Read a configuration from disk into this configuration object
//   filename - Full path to file to load
Config.prototype.load = function(filename, callback) {
	this._filename = filename;
	fs.readFile(filename, 'utf8', function (err, data) {
		if (err) { return callback(err); }
		try {
			data = JSON.parse(data);
		} catch (e) {
			log.error(e);
			return callback(e);
		}
		this.update(data, function(err, d) {
			callback(err, data);
		}, true);
	}.bind(this));
};

// Save this configuration object to disk
//   callback - Called with null once the configuration is saved (or with error if error)
Config.prototype.save = function(callback) {
	if(this._loaded && this.config_file) {
		fs.open(this.config_file, 'w', function(err, fd) {
			if(err) {
				log.error(err);
				callback(err);
			} else {
//				var cfg = new Buffer(JSON.stringify(this._cache, null, 4));
                var cfg = new Buffer.from(JSON.stringify(this._cache, null, 4));
				fs.write(fd, cfg, 0, cfg.length, 0, function(err, written, string) {
					if(err) {
						log.error(err);
						callback(err);
					} else {
						fs.fsync(fd, function(err) {
							if(err) {
								log.error(err);
							}
							fs.closeSync(fd);
							// err might be null - this is the success case
							callback(err);
						}.bind(this));
					}
				}.bind(this));
			}
		}.bind(this));
		/*
		fs.writeFile(this.config_file, JSON.stringify(this._cache, null, 4), function(err, data) {
			log.debug("Config file saved.");
			callback(err, data);
		});
		*/
	} else {
		setImmediate(callback);
	}
};

// Perform an initial load() from the configuration's settings files.
// For this to work, the Config object has to have a default_config_file and config_file member
Config.prototype.init = function(callback) {
		var default_count;
        var user_count;
        async.series(
		[
			function loadDefault(callback) { this.load(this.default_config_file, callback); }.bind(this),
			function saveDefaultCount(callback) {
				default_count = Object.keys(this._cache).length;
				callback();
			}.bind(this),
			function loadUserConfig(callback) { 
				this.load(this.config_file, function(err, data) {
					if(err) {
						if(err.code === "ENOENT") {
							log.warn('Configuration file ' + this.config_file + ' not found.');
                            this._loaded = true;
							this.save(callback, true);
						} else {
							log.warn('Problem loading the user configuration file "' + this.config_file + '": ' + err.message);
							this._loaded = true;
							this.userConfigLoaded = true;
							this.save(callback);
						}
					} else {
						this._loaded = true;
						this.userConfigLoaded = true;
						user_count = Object.keys(data).length;
						callback(null, this);
					}
				}.bind(this)); 
			}.bind(this),
			function saveIfNeeded(callback) {
				if(default_count != user_count) {
					this.save(callback);
				} else {
					callback();
				}
			}.bind(this)
		],
		function(err, results) {
			if(err) { callback(err); }
			else { callback(null, this); }
		}.bind(this)
	);
};

// Return a path to the config file for this configuration object
Config.prototype.getConfigFile = function() {
	return Config.getDataDir('config') + '/' + this.config_name + '.json';
}

// "Static Methods" below here

// Get the data directory (the root of all volatile FabMo data)
//   name - Optional additional pathname to join to root data dir
Config.getDataDir = function(name) {
	switch(PLATFORM) {
		case 'win32':
		case 'win64':
			base = 'c:\\fabmo';
			break;
		default:
			base = '/opt/fabmo';
	}
	if(name) {
		dir = base + path.sep + name;
	} else {
		dir = base;
	}
	return dir;
};

// Creates the data directory structure if it does not already exist
//   callback - Called with null if success or with error if error
Config.createDataDirectories = function(callback) {
	var create_directory = function(dir, callback) {
		dir = Config.getDataDir(dir);
		isDirectory(dir, function(isdir) {
			if(!isdir) {
				log.warn('Directory "' + dir + '" does not exist.  Creating a new one.');
				fs.mkdir(dir, function(err) {
					if(!err) {
						log.info('Successfully created directory "' + dir + '"');
					}
					callback(err);
				});
			} else {
				callback(null);
			}
		});
	}.bind(this);
	dirs = [null, 'config', 'fmus'];
	async.eachSeries(dirs, create_directory, callback);
};

// callback true/false if the provided path is a directory (or undefined if it doesn't exist)
// TODO - is this silly?
function isDirectory(path, callback){
	fs.stat(path,function(err,stats){
		if(err) callback(undefined);
		else callback(stats.isDirectory());
	});
}

exports.Config = Config;
