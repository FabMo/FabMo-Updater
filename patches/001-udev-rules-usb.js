/*
 * Patch 001: Update udev rules for USB device management
 * 
 * Replaces /etc/udev/rules.d/99-fabmo-usb.rules with updated rules that handle:
 * - ShopBot/FabMo Controller v304
 * - Waveshare USB to RS485
 * - Sparkfun USB to RS485
 * - Delta IFD6500 USB to RS485 (with custom Silicon Labs VID/PID)
 * 
 * This patch updates the udev rules to properly support multiple USB devices
 * including VFD controllers with custom hardware IDs.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-001');
var crypto = require('crypto');

var PATCH_ID = '001-udev-rules-usb';
var TARGET_FILE = '/etc/udev/rules.d/99-fabmo-usb.rules';

// The new udev rules content
var NEW_UDEV_RULES = `# These are initial rules for managing multiple USB plugins for Control Card and VFD
#  - They may need to eventually be built into a more elaborate system for multiple models and versions

# SHOPBOT/FABMO Controller v304 (will not recognize DUE now)
SUBSYSTEM=="tty", ATTRS{idVendor}=="1d50", ATTRS{idProduct}=="606d", SYMLINK+="fabmo_g2_motion"

# Waveshare USB to RS485
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="55d3", SYMLINK+="vfdACM_controller1"
# Sparkfun USB to RS485 
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", SYMLINK+="vfdUSB_controller1"

# Delta IFD6500 USB to RS485 Std ShopBot — custom Silicon Labs VID/PID (10c4:83c4).
# Standard cp210x driver doesn't claim this PID by default, so on USB add we
# (1) ensure cp210x is loaded and (2) register this VID/PID with it so a tty appears.
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="83c4", \\
  RUN+="/bin/sh -c '/sbin/modprobe cp210x; echo 10c4 83c4 > /sys/bus/usb-serial/drivers/cp210x/new_id'"
# Then symlink the resulting tty to the same name FabMo's spindle config expects.
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="83c4", SYMLINK+="vfdACM_controller1"
`;

/**
 * Calculate SHA256 hash of content
 */
function getHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if this patch needs to be applied
 * Returns true if the file doesn't exist or has different content
 */
function check() {
    try {
        // If the file doesn't exist, we definitely need to apply
        if (!fs.existsSync(TARGET_FILE)) {
            log.info('  Target file ' + TARGET_FILE + ' does not exist');
            return true;
        }
        
        // Read existing content
        var existingContent = fs.readFileSync(TARGET_FILE, 'utf8');
        
        // Compare content by hash to determine if update is needed
        var existingHash = getHash(existingContent);
        var newHash = getHash(NEW_UDEV_RULES);
        
        if (existingHash !== newHash) {
            log.info('  Target file exists but has different content');
            log.info('  Current hash: ' + existingHash.substring(0, 16) + '...');
            log.info('  Expected hash: ' + newHash.substring(0, 16) + '...');
            return true;
        }
        
        log.debug('  Target file already has correct content (hash: ' + existingHash.substring(0, 16) + '...)');
        return false;
        
    } catch (err) {
        log.warn('  Error checking patch status: ' + err.message);
        // If we can't read the file, assume we need to apply
        return true;
    }
}

/**
 * Apply the patch by writing the new udev rules file
 * Returns a promise that resolves with { requiresReboot: boolean }
 */
function apply() {
    try {
        var needsReboot = false;
        
        // Backup existing file if it exists
        if (fs.existsSync(TARGET_FILE)) {
            var backupFile = TARGET_FILE + '.backup-' + Date.now();
            log.info('  Creating backup: ' + backupFile);
            fs.copySync(TARGET_FILE, backupFile);
        }
        
        // Write new content
        log.info('  Writing new udev rules to ' + TARGET_FILE);
        fs.writeFileSync(TARGET_FILE, NEW_UDEV_RULES);
        
        // Try to reload udev rules and rescan USB devices
        log.info('  Attempting to reload udev rules and rescan USB devices...');
        var exec = require('child_process').execSync;
        try {
            // Reload the udev rules
            exec('udevadm control --reload-rules');
            log.info('  ✓ udev rules reloaded');
            
            // Trigger udev to reprocess devices
            exec('udevadm trigger --action=add --subsystem-match=usb --subsystem-match=tty');
            log.info('  ✓ USB devices triggered for re-enumeration');
            
            // Try to reload the cp210x driver for the Delta VFD
            try {
                exec('modprobe -r cp210x 2>/dev/null || true');
                exec('modprobe cp210x');
                log.info('  ✓ cp210x driver reloaded');
            } catch (driverErr) {
                log.debug('  Could not reload cp210x driver (may not be loaded): ' + driverErr.message);
            }
            
            log.info('  ✓ Rules activated successfully');
            log.info('  Note: For devices currently connected, unplug and replug them to apply new rules');
            log.info('  Or reboot the system to ensure all devices are properly re-enumerated');
            
            // Set needsReboot based on whether devices are currently connected
            // Check if any of the target USB devices are currently present
            try {
                var lsusbOutput = exec('lsusb').toString();
                var hasTargetDevices = lsusbOutput.includes('1d50:606d') || // G2
                                       lsusbOutput.includes('1a86:55d3') || // Waveshare
                                       lsusbOutput.includes('0403:6001') || // Sparkfun
                                       lsusbOutput.includes('10c4:83c4');   // Delta
                
                if (hasTargetDevices) {
                    needsReboot = true;
                    log.warn('  ⚠️  Target USB devices are currently connected');
                    log.warn('  ⚠️  Reboot recommended, or unplug/replug devices');
                } else {
                    log.info('  No target devices currently connected - rules will apply when devices are plugged in');
                }
            } catch (lsusbErr) {
                log.debug('  Could not check for connected devices: ' + lsusbErr.message);
                // If we can't check, be conservative and suggest reboot
                needsReboot = true;
            }
            
        } catch (err) {
            log.warn('  Could not reload udev rules: ' + err.message);
            log.warn('  A system reboot will be required for rules to take effect');
            needsReboot = true;
        }
        
        log.info('  Patch applied successfully');
        
        // Return whether a reboot is needed
        return Promise.resolve({ requiresReboot: needsReboot });
        
    } catch (err) {
        log.error('  Error applying patch: ' + err.message);
        return Promise.reject(err);
    }
}

module.exports = {
    id: PATCH_ID,
    description: 'Update udev rules for USB device management (Control Card, VFD controllers)',
    version: '2026-05-27',
    requiresReboot: false,  // Dynamic - determined during apply() based on device state
    check: check,
    apply: apply
};
