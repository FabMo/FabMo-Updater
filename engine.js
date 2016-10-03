var fs = require('fs');
var config = require('./config');
var path = require('path');
var log = require('./log').logger('engine');

exports.getVersion = function(callback) {
    fs.readFile(path.join(config.updater.get('engine_dir'), 'version.json'), 'utf8', function(err, data) {
        var version = {};
        if(err) {
            version.type = 'dev';
            version.number = null;
            return callback(null, version);
        }
        try {
            data = JSON.parse(data);
            if(data.number) {
                version.number = data.number;
                version.type = data.type || 'release';
            }

        } catch(e) {
            version.type = 'dev';
            version.number = null;
        } finally {
            callback(null, version);
        }
    });
}
