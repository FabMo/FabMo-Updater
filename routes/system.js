/*
 * routes/system.js
 *
 * Routes for system level things like rebooting/shutting down this host.
 *
 * TODO: These functions are no longer used (but useful) - remove them?
 */
var log = require('../log').logger('routes');
var hooks = require('../hooks');
var patches = require('../patches');

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

var getPatchStatus = function(req, res, next) {
  try {
    var status = patches.getPatchStatus();
    
    // Check if any applied patches require a reboot
    var rebootRequired = status.some(function(patch) {
      return patch.applied && patch.requiresReboot;
    });
    
    var answer = {
      status: "success",
      data: {
        patches: status,
        rebootRequired: rebootRequired
      }
    };
    res.json(answer);
  } catch(err) {
    log.error('Error getting patch status: ' + err.message);
    res.json({
      status: "error",
      message: err.message
    });
  }
};

module.exports = function(server) {
  server.post('/system/reboot', reboot);
  server.post('/system/shutdown', shutdown);
  server.get('/system/patches', getPatchStatus);
};
