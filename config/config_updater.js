/*
 * config_updater.js
 *
 * This module provides the updater-specific configuration object.
 */
var util = require('util');

// The UpdaterConfig object keeps track of updater-specific settings
// At the time of this writing, it doesn't really do anything special, other than being an event emitter that notifies changes to the config.
UpdaterConfig = function() {
	Config.call(this, 'updater');
	this.name_changed = false;
	this.password_changed = false;
};
util.inherits(UpdaterConfig, Config);

// Typical update function
UpdaterConfig.prototype.update = function(data, callback) {
    try {
		for(var key in data) {
			switch(key) {

				// The os "config" actually comes from the 
				case 'os':
				break;

				// Notify listeners that a config value changed
				default:
					this._cache[key] = data[key];
					var o = {}
					o[key] = data[key];
					this.emit('change', o);
				break;
			}
		}
	} catch (e) {
		if(callback) {
			return setImmediate(callback, e);
		}
	}
	this.save(function(err, result) {
		if(err) {
			typeof callback === 'function' && callback(e);
		} else {
			typeof callback === 'function' && callback(null, data);
		}
	});
};

// getData for the updater configuration returns a copy, because
// the `os` key in the configuration (and perhaps others in the future)
// is a "phantom" key (it's not really in the config file - it is only
// in the configuration so it appears in the config for the client)
UpdaterConfig.prototype.getData = function() {
	var cfg_copy = {}
	for(var key in this._cache) {
		cfg_copy[key] = this._cache[key];
	}
	cfg_copy.os = require('./index').platform;
	return cfg_copy
}

UpdaterConfig.prototype.apply = function(callback) {
	try {
		// Apply settings here, if needed
		callback(null, this);
	}
	catch (e) {
		callback(e);
	}
};

exports.UpdaterConfig = UpdaterConfig
