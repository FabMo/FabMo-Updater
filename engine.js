/*
 * engine.js
 * 
 * Functions for getting information about the engine instance installed on this host
 */
var fs = require('fs');
var config = require('./config');
var path = require('path');
var log = require('./log').logger('engine');

// This function gets the software version of the engine installed on this host
// In the case that the installed engine is a git repository, it retrieves the version number from the git tags.
// If not, it looks for the version number 
exports.getVersion = function(callback) {
    // This is the version string that will be returned if we absolutely can't find any version info for the engine
    var version = {number : 'v0.0.0', type : 'unknown'};

    // First check - look in the git tags
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
            // If the git tags check fails (which will happen pretty much 100% of the time in production) - we look in version.json
            // The reason to check github first is in the case that it is present, it is a much more accurate source of version information
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
                    version.type = data.type;
                } catch(e) {
                } finally {
                    callback(null, version);
                }
            });
        });
}
