/*
 * routes/system.js
 *
 * Routes for system level things like rebooting/shutting down this host.
 *
 * TODO: These functions are no longer used (but useful) - remove them?
 */
var log = require('../log').logger('routes');
var hooks = require('../hooks');

var reboot = function(req, res, next) {
  var answer = {
      status : "success",
      data : {}
    };
    res.json(answer);
    hooks.reboot(function(err, data) {
      if(err) {
        log.error(err);
      } else {
        log.info("Reboot hook was run successfully.")
      }
    });
};

var shutdown = function(req, res, next) {
  var answer = {
      status : "success",
      data : {}
    };
    res.json(answer);
    hooks.shutdown(function(err, data) {
      if(err) {
        log.error(err);
      } else {
        log.info("Shutdown hook was run successfully.")
      }
    });
};

module.exports = function(server) {
  server.post('/system/reboot', reboot);
  server.post('/system/shutdown', shutdown);
};
