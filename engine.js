var fs = require('fs');
var config = require('./config');
var path = require('path');
var log = require('./log').logger('engine');


exports.getVersion = function(callback) {
    var version = {number : 'v0.0.0', type : 'unknown'};
    return require('./util').doshell_promise("git describe --dirty=! --match='v*.*.*'", {cwd : config.updater.get('engine_dir'), silent : true})
        .then(function(data) {
            parts = data.split('-');
	    if(parts.length === 1) {
		var versionString = parts[0].trim();
	    } else {
            	var versionString = parts[0].trim() + '-' + parts[2].trim();
	    }
            var version = require('./fmp').parseVersion(versionString);
            callback(null, version);
        }).catch(function(err) {
            fs.readFile(path.join(config.updater.get('engine_dir'), 'version.json'), 'utf8', function(err, data) {
                if(err) {
                    return callback(null, version);
                }
                try {
                    data = JSON.parse(data);
                    if(data.number) {
                        version.number = data.number;
                        version.date = data.date;
                    }
                } catch(e) {
                } finally {
                    callback(null, version);
                }
            });
        });
}
