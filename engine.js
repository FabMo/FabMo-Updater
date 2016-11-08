var fs = require('fs');
var config = require('./config');
var path = require('path');
var log = require('./log').logger('engine');


exports.getVersion = function(callback) {
    return require('./util').doshell_promise("git describe --dirty=! --match='v*.*.*'", {cwd : config.updater.get('engine_dir'), silent : true})
        .then(function(data) {
            parts = data.split('-');
            var versionString = parts[0] + '-' + parts[2];
            var version = require('./fmp').parseVersion(versionString);
            callback(version);
        }).catch(function(err) {
            fs.readFile(path.join(config.updater.get('engine_dir'), 'version.json'), 'utf8', function(err, data) {
                var version = {number : null};
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
