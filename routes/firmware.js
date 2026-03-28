/*
 * routes/firmware.js
 *
 * Routes for firmware management — flash or reload G2 firmware.
 * Modeled after the FabMo Engine firmware.js module.
 */
var log = require('../log').logger('routes');
var hooks = require('../hooks');
var fs = require('fs');
var path = require('path');
var upload = require('./upload').upload;

var DEFAULT_FIRMWARE = '/fabmo/firmware/g2.bin';

// POST /firmware/reload — re-flash the existing firmware from /fabmo/firmware/g2.bin
var reloadFirmware = function(req, res, next) {
    var binPath = req.body && req.body.filepath ? req.body.filepath : DEFAULT_FIRMWARE;

    // Only allow .bin files from the firmware directory
    if (!binPath.match(/\.bin$/i) || path.dirname(path.resolve(binPath)) !== path.resolve('/fabmo/firmware')) {
        return res.json({ status: 'error', message: 'Firmware file must be a .bin in /fabmo/firmware/' });
    }
    if (!fs.existsSync(binPath)) {
        return res.json({ status: 'error', message: 'Firmware file not found: ' + binPath });
    }

    log.info('Reloading firmware from ' + binPath);
    hooks.updateFirmware(binPath, function(err, taskKey) {
        if (err) {
            return res.json({ status: 'error', message: err.message || String(err) });
        }
        res.json({
            status: 'success',
            data: { status: 'pending', task: taskKey, file: binPath }
        });
    });
};

// POST /firmware/update — flash an uploaded .bin file
var flashFirmware = function(req, res, next) {
    upload(req, res, next, function(err, upload_data) {
        log.info('Upload complete');
        log.info('Processing firmware update');

        var uploads = upload_data.files;
        if (uploads.length > 1) {
            log.warn('Got an upload of ' + uploads.length + ' files for firmware update when only one is allowed.');
        }
        var filePath = upload_data.files[0].file.path;
        var fileName = upload_data.files[0].file.name;
        log.info(filePath);
        log.info(fileName);

        try {
            if (!fileName.match(/.*\.bin/i)) {
                throw new Error('Unknown file type for ' + fileName);
            }
            hooks.updateFirmware(filePath, function(err, taskKey) {
                if (err) {
                    return res.json({ status: 'error', message: err.message || String(err) });
                }
                res.json({
                    status: 'success',
                    data: { status: 'pending', task: taskKey }
                });
            });
        } catch (err) {
            res.json({ status: 'error', message: err.message || String(err) });
        }
    });
};

module.exports = function(server) {
    server.post('/firmware/update', flashFirmware);
    server.post('/firmware/reload', reloadFirmware);
};
