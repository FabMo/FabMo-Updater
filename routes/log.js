/*
 * config/log.js
 *
 * Routes for dealing with the updater system log.
 */
var log = require('../log');

// Retrieve the log (plain text)
var getLog = function(req, res, next) {
  body = log.getLogBuffer();
  res.setHeader('content-type', 'text/plain');
  res.setHeader('content-disposition', 'attachment');
  res.send(body);
};

// Clear the log buffer
var clearLog = function(req, res, next) {
    var answer = {
        status:"success",
        data : null
    }
    log.clearLogBuffer();
    res.json(answer);
};

module.exports = function(server) {
  server.get('/log', getLog);
  server.del('/log', clearLog)
};
