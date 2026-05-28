/*
 * Patch Template
 * 
 * Copy this file and rename it with the pattern: ###-description.js
 * Example: 002-network-config.js
 * 
 * Replace all TODO comments with your implementation.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-XXX'); // TODO: Update logger name
var exec = require('child_process').execSync;

// TODO: Update these values
var PATCH_ID = 'XXX-description';  // Should match filename without .js
var PATCH_DESCRIPTION = 'Description of what this patch does';
var PATCH_VERSION = '2026-XX-XX';  // Date when patch was created
var REQUIRES_REBOOT = false;  // Set to true if this patch requires a system reboot

/**
 * Check if this patch needs to be applied
 * 
 * This function should:
 * - Be fast and non-destructive
 * - Return true if the patch needs to be applied
 * - Return false if the patch has already been applied or is not applicable
 * - Handle missing files/directories gracefully
 * 
 * @returns {boolean} true if patch should be applied
 */
function check() {
    try {
        // TODO: Implement your check logic here
        
        // Example 1: Check if a file exists
        // if (!fs.existsSync('/path/to/file')) {
        //     log.info('Target file does not exist');
        //     return true;
        // }
        
        // Example 2: Check file content
        // var content = fs.readFileSync('/path/to/file', 'utf8');
        // if (!content.includes('expected-string')) {
        //     log.info('File needs updating');
        //     return true;
        // }
        
        // Example 3: Check command output
        // try {
        //     var output = exec('some-command --check').toString();
        //     if (!output.includes('expected-value')) {
        //         return true;
        //     }
        // } catch(e) {
        //     return true; // Command failed, probably needs update
        // }
        
        // Example 4: Platform-specific check
        // var config = require('../config');
        // if (config.updater.get('platform') !== 'raspberry-pi') {
        //     log.info('Patch not applicable to this platform');
        //     return false;
        // }
        
        log.debug('Patch already applied or not needed');
        return false;
        
    } catch (err) {
        log.warn('Error checking patch status: ' + err.message);
        // If we can't determine status, it's safer to try applying
        return true;
    }
}

/**
 * Apply the patch
 * 
 * This function should:
 * - Be idempotent (safe to run multiple times)
 * - Create backups before modifying existing files
 * - Use detailed logging
 * - Return a Promise that resolves on success, rejects on error
 * 
 * @returns {Promise} Resolves when patch is applied successfully
 */
function apply() {
    try {
        // TODO: Implement your patch logic here
        
        log.info('Applying patch...');
        
        // Example 1: Replace a file
        // var targetFile = '/path/to/file';
        // var newContent = '...';
        // 
        // if (fs.existsSync(targetFile)) {
        //     var backupFile = targetFile + '.backup-' + Date.now();
        //     log.info('Backing up existing file to ' + backupFile);
        //     fs.copySync(targetFile, backupFile);
        // }
        // 
        // log.info('Writing new content to ' + targetFile);
        // fs.writeFileSync(targetFile, newContent);
        
        // Example 2: Run system commands
        // log.info('Running system command...');
        // exec('systemctl reload some-service');
        
        // Example 3: Create directories
        // fs.ensureDirSync('/path/to/directory');
        
        // Example 4: Modify JSON config
        // var configFile = '/path/to/config.json';
        // var config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        // config.newSetting = 'value';
        // fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        
        log.info('Patch applied successfully');
        return Promise.resolve();
        
    } catch (err) {
        log.error('Error applying patch: ' + err.message);
        return Promise.reject(err);
    }
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    version: PATCH_VERSION,
    requiresReboot: REQUIRES_REBOOT,
    check: check,
    apply: apply
};
