var util = require('util');

// The EngineConfig object keeps track of engine-specific settings
UpdaterConfig = function() {
	Config.call(this, 'updater');
	this.name_changed = false;
	this.password_changed = false;
};
util.inherits(UpdaterConfig, Config);

UpdaterConfig.prototype.update = function(data, callback) {
	try {
		for(var key in data) {
			switch(key) {
				case 'os':
				break;

				default:
					this._cache[key] = data[key];
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