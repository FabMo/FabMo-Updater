/*
 * Example Patch: Dynamic Reboot Requirements
 * 
 * This example demonstrates how to create a patch that intelligently
 * determines whether a reboot is needed based on runtime conditions.
 * 
 * Use case: Updating system configuration that only requires a reboot
 * if the affected service/resource is currently active.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-example');
var exec = require('child_process').execSync;

var PATCH_ID = 'example-dynamic-reboot';
var TARGET_FILE = '/etc/example/config.conf';
var NEW_CONTENT = '# Updated configuration\nsome_setting=new_value\n';

function check() {
    try {
        if (!fs.existsSync(TARGET_FILE)) {
            log.info('  Target file does not exist');
            return true;
        }
        
        var current = fs.readFileSync(TARGET_FILE, 'utf8');
        if (current !== NEW_CONTENT) {
            log.info('  Configuration needs updating');
            return true;
        }
        
        log.debug('  Configuration is already up to date');
        return false;
        
    } catch (err) {
        log.warn('  Error checking: ' + err.message);
        return true;
    }
}

function apply() {
    try {
        var needsReboot = false;
        
        // Backup existing file
        if (fs.existsSync(TARGET_FILE)) {
            var backup = TARGET_FILE + '.backup-' + Date.now();
            log.info('  Creating backup: ' + backup);
            fs.copySync(TARGET_FILE, backup);
        }
        
        // Write new configuration
        log.info('  Writing new configuration');
        fs.ensureDirSync('/etc/example');
        fs.writeFileSync(TARGET_FILE, NEW_CONTENT);
        
        // Try to activate the changes without rebooting
        log.info('  Attempting to reload service...');
        try {
            // Try to reload the service that uses this config
            exec('systemctl reload example-service');
            log.info('  ✓ Service reloaded successfully');
            log.info('  Configuration active without reboot');
            needsReboot = false;
            
        } catch (reloadErr) {
            // Service reload failed - check if it's because service isn't running
            try {
                var status = exec('systemctl is-active example-service').toString().trim();
                if (status === 'inactive' || status === 'unknown') {
                    // Service isn't running, so configuration will be picked up when it starts
                    log.info('  Service is not active');
                    log.info('  Configuration will apply when service starts');
                    needsReboot = false;
                } else {
                    // Service is running but reload failed
                    log.warn('  Could not reload service: ' + reloadErr.message);
                    log.warn('  Reboot required to apply changes');
                    needsReboot = true;
                }
            } catch (statusErr) {
                // Can't determine service state, be conservative
                log.warn('  Could not determine service state');
                log.warn('  Reboot recommended');
                needsReboot = true;
            }
        }
        
        // Alternative pattern: Check if resources are in use
        // try {
        //     var lsofOutput = exec('lsof ' + TARGET_FILE + ' 2>/dev/null || true').toString();
        //     if (lsofOutput.trim()) {
        //         log.warn('  File is currently in use by running processes');
        //         needsReboot = true;
        //     } else {
        //         log.info('  File is not in use, no reboot needed');
        //         needsReboot = false;
        //     }
        // } catch (err) {
        //     needsReboot = true;
        // }
        
        log.info('  Patch applied successfully');
        
        // Return dynamic reboot requirement
        return Promise.resolve({ requiresReboot: needsReboot });
        
    } catch (err) {
        log.error('  Error applying patch: ' + err.message);
        return Promise.reject(err);
    }
}

module.exports = {
    id: PATCH_ID,
    description: 'Example: Update configuration with dynamic reboot detection',
    version: '2026-05-28',
    requiresReboot: false,  // Default false, but apply() may override
    check: check,
    apply: apply
};
