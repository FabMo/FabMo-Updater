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

function getRpiThrottleStatus() {
  try {
    var exec = require('child_process').execSync;
    var output = exec('vcgencmd get_throttled', { encoding: 'utf8', timeout: 1000 });
    var match = /throttled=(0x[0-9A-Fa-f]+)/.exec(output);
    if (!match) { return null; }
    
    var throttled = parseInt(match[1], 16);
    if (throttled === 0) { return null; }
    
    var flags = [];
    // Bit meanings (see https://www.raspberrypi.com/documentation/computers/os.html#get_throttled)
    if (throttled & 0x1) flags.push('UNDERVOLTED-NOW');
    if (throttled & 0x2) flags.push('ARM-FREQ-CAPPED-NOW');
    if (throttled & 0x4) flags.push('THROTTLED-NOW');
    if (throttled & 0x8) flags.push('SOFT-TEMP-LIMIT-NOW');
    if (throttled & 0x10000) flags.push('UNDERVOLTED-PAST');
    if (throttled & 0x20000) flags.push('ARM-FREQ-CAPPED-PAST');
    if (throttled & 0x40000) flags.push('THROTTLED-PAST');
    if (throttled & 0x80000) flags.push('SOFT-TEMP-LIMIT-PAST');
    
    return flags.length > 0 ? flags.join(', ') : null;
  } catch (e) {
    return null;
  }
}

function checkInternetConnection() {
  try {
    var exec = require('child_process').execSync;
    // Try to ping a reliable DNS server with a 2 second timeout
    exec('ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1', { timeout: 3000 });
    return true;
  } catch (e) {
    return false;
  }
}

function getEngineProfile() {
  try {
    var data = fs.readFileSync('/opt/fabmo/config/engine.json', 'utf8');
    var engineConfig = JSON.parse(data);
    return engineConfig.profile || null;
  } catch (e) {
    return null;
  }
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
  cfg.config.rpi_throttle_status = getRpiThrottleStatus();
  cfg.config.internet_connected = checkInternetConnection();
  cfg.config.engine_profile = getEngineProfile() || 'unavailable';

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
