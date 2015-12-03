//var lockfile = require('lockfile'); // deactivate the second instance lock.
var log = require('./log').logger('server');

var updater = require('./updater');

updater.start(function(err, data) {
});

exports.updater = updater;
