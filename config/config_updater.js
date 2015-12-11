var util = require('util');

// The EngineConfig object keeps track of engine-specific settings
UpdaterConfig = function() {
	Config.call(this, 'updater');
};
util.inherits(UpdaterConfig, Config);

UpdaterConfig.prototype.update = function(data, callback) {
	try {
		for(var key in data) {
			this._cache[key] = data[key];
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