/*
 * routes/config.js
 *
 * Routes related to system configuration and status
 */

var log = require('../log').logger('routes');
var config = require('../config')

// return the current updater status
var getStatus = function(req, res, next) {
  var updater = require('../updater');
  var answer = {
      status : "success",
      data : {'status':updater.status}
    };
    res.json(answer);
};

// Return the full configuration tree
// TODO - no user information reported here
var getConfig = function(req, res, next) {
  var cfg = {'config':config.updater.getData()}
  try {
	  delete cfg.config.password
  } catch(e) {}

  res.json({
  	status : 'success',
  	data : cfg
  })
};

// Update the configuration with posted JSON (JSON posted in request body)
var postConfig = function(req, res, next) {
  config.updater.update(req.params);
  res.json({
    status : 'success',
    data : null
  });
};

module.exports = function(server) {
  server.get('/status', getStatus);
  server.get('/config', getConfig);
  server.post('/config', postConfig);
};
