var fs = require('fs');
var config = require('./config');
var path = require('path');
var log = require('./log').logger('engine');


exports.getVersion = function(callback) {
    return require('./util').doshell_promise("git describe --dirty=! --match='v*.*.*'", {cwd : config.updater.get('engine_dir'), silent : true})
        .then(function(data) {
            parts = data.split('-');
            var versionString = parts[0] + '-' + parts[2];
            var version = {};
            version.hash = (data || '').trim();
            version.number = versionString;
            version.type = 'dev'
            fs.readFile(path.join(config.updater.get('engine_dir'), 'version.json'), 'utf8', function(err, data) {
                if(err) {
                    return callback(null, version);
                }
                try {
                    data = JSON.parse(data);
                    if(data.number) {
                        version.number = data.number;
                        version.type = 'release';
                        version.date = data.date;
                    }
                } catch(e) {
                    version.type = 'dev';
                    version.number = null;
                } finally {
                    callback(null, version);
                }
            });
        }).catch(function(err) {
            callback(err);
        });
}
