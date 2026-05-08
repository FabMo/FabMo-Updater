/*
 * routes/config.js
 *
 * Routes related to system configuration and status
 */

var log = require('../log').logger('routes');
var config = require('../config')
var fs = require('fs');

function readFirstLine(filePath) {
  try {
    var data = fs.readFileSync(filePath, 'utf8');
    var firstLine = (data || '').split(/\r?\n/)[0].trim();
    return firstLine || null;
  } catch (e) {
    return null;
  }
}

function getRpiModelText() {
  return readFirstLine('/proc/device-tree/model') || readFirstLine('/sys/firmware/devicetree/base/model');
}

function getRpiType(modelText) {
  if (!modelText) { return null; }
  var match = /raspberry pi\s+([0-9]+)/i.exec(modelText);
  if (match && match[1]) {
    return 'RPi ' + match[1];
  }
  return modelText;
}

function getRpiTempC() {
  var raw = readFirstLine('/sys/class/thermal/thermal_zone0/temp');
  if (!raw) { return null; }
  var tempMc = parseInt(raw, 10);
  if (isNaN(tempMc)) { return null; }
  return (tempMc / 1000).toFixed(1);
}

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

  var modelText = getRpiModelText();
  cfg.config.sd_card_version = readFirstLine('/boot/fabmo-release.txt') || 'unavailable';
  cfg.config.rpi_type = getRpiType(modelText) || 'unavailable';
  cfg.config.rpi_temp_c = getRpiTempC() || 'unavailable';

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
