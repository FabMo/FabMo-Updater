/*
 * patches/index.js
 * 
 * System patch manager for applying OS-level fixes and configuration updates
 * that would otherwise require a new SD card image.
 * 
 * This module runs during updater startup and applies any patches that haven't
 * been applied yet. Patches are idempotent and tracked in a JSON file.
 */

var log = require('../log').logger('patches');
var fs = require('fs-extra');
var path = require('path');
var Q = require('q');

// Location where we track which patches have been applied
// Note: Using /opt/patches/ instead of /opt/fabmo/ because /opt/fabmo/ is deleted during updates
var PATCHES_TRACKING_FILE = '/opt/patches/patches-applied.json';

// Persistent flag file to indicate reboot is required (survives updater restarts)
var REBOOT_REQUIRED_FLAG = '/opt/patches/reboot-required.flag';

// Directory containing patch modules
var PATCHES_DIR = path.join(__dirname);

/**
 * Load the patches tracking file
 * Returns an object with patch IDs as keys and application timestamps as values
 */
function loadTrackingFile() {
    try {
        if (fs.existsSync(PATCHES_TRACKING_FILE)) {
            var data = fs.readFileSync(PATCHES_TRACKING_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        log.warn('Error loading patches tracking file: ' + err.message);
    }
    return {};
}

/**
 * Save the patches tracking file
 */
function saveTrackingFile(appliedPatches) {
    try {
        // Ensure the directory exists
        fs.ensureDirSync(path.dirname(PATCHES_TRACKING_FILE));
        fs.writeFileSync(PATCHES_TRACKING_FILE, JSON.stringify(appliedPatches, null, 2));
    } catch (err) {
        log.error('Error saving patches tracking file: ' + err.message);
        throw err;
    }
}

/**
 * Load all patch modules from the patches directory
 * Returns an array of patch objects
 */
function loadPatchModules() {
    var patches = [];
    
    try {
        var files = fs.readdirSync(PATCHES_DIR);
        
        // Filter for .js files, excluding index.js, EXAMPLE*, TEMPLATE*, and any test files
        var patchFiles = files.filter(function(file) {
            return file.endsWith('.js') && 
                   file !== 'index.js' &&
                   !file.toUpperCase().startsWith('EXAMPLE') &&
                   !file.toUpperCase().startsWith('TEMPLATE') &&
                   !file.includes('.test.') &&
                   !file.includes('.spec.');
        }).sort(); // Sort to ensure consistent order
        
        patchFiles.forEach(function(file) {
            try {
                var patchPath = path.join(PATCHES_DIR, file);
                var patch = require(patchPath);
                
                // Validate patch structure
                if (!patch.id || !patch.description || !patch.check || !patch.apply) {
                    log.warn('Patch ' + file + ' is missing required properties (id, description, check, apply)');
                    return;
                }
                
                if (typeof patch.check !== 'function' || typeof patch.apply !== 'function') {
                    log.warn('Patch ' + file + ' check and apply must be functions');
                    return;
                }
                
                patches.push(patch);
                log.debug('Loaded patch: ' + patch.id);
            } catch (err) {
                log.error('Error loading patch ' + file + ': ' + err.message);
            }
        });
        
    } catch (err) {
        log.error('Error reading patches directory: ' + err.message);
    }
    
    return patches;
}

/**
 * Apply a single patch
 * Returns a promise that resolves with an object: { wasApplied: boolean, requiresReboot: boolean }
 */
function applyPatch(patch) {
    return Q.fcall(function() {
        log.info('→ Checking: ' + patch.id);
        log.info('  Description: ' + patch.description);
        return patch.check();
    }).then(function(needsApplying) {
        if (!needsApplying) {
            log.info('  ✓ Already applied or not needed');
            return { wasApplied: false, requiresReboot: false };
        }
        
        log.info('  ⟳ Applying patch...');
        return Q(patch.apply()).then(function(applyResult) {
            log.info('  ✓ Successfully applied');
            
            // Check if apply() returned an object with requiresReboot flag
            var requiresReboot = false;
            if (applyResult && typeof applyResult === 'object' && 'requiresReboot' in applyResult) {
                // Dynamic reboot requirement from apply()
                requiresReboot = applyResult.requiresReboot === true;
            } else {
                // Fall back to static requiresReboot property
                requiresReboot = patch.requiresReboot === true;
            }
            
            if (requiresReboot) {
                log.warn('  ⚠️  Requires system reboot');
            }
            return { wasApplied: true, requiresReboot: requiresReboot };
        });
    });
}

/**
 * Run all patches
 * This is the main entry point called during updater startup
 * Returns a promise that resolves when all patches have been processed
 */
function runPatches(callback) {
    log.info('========================================');
    log.info('SYSTEM PATCHES: Starting patch check...');
    log.info('========================================');
    
    var appliedPatches = loadTrackingFile();
    var patches = loadPatchModules();
    var rebootRequired = false;
    var patchesApplied = 0;
    var patchesSkipped = 0;
    
    // Check for existing reboot flag (will auto-clear if system rebooted)
    var existingRebootFlag = checkRebootRequiredFlag();
    if (existingRebootFlag) {
        log.info('Note: Reboot flag from previous patch run still active (' + existingRebootFlag.timestamp + ')');
    }
    
    if (patches.length === 0) {
        log.info('No patches available');
        log.info('========================================');
        return callback ? callback() : Q();
    }
    
    log.info('Found ' + patches.length + ' patch(es) to check');
    
    // Process patches sequentially
    var result = patches.reduce(function(prev, patch) {
        return prev.then(function() {
            // Check if this patch has been applied before
            if (appliedPatches[patch.id]) {
                log.debug('Patch ' + patch.id + ' was previously applied on ' + appliedPatches[patch.id]);
                // Still run check() in case the patch needs to be reapplied
                // (e.g., if someone manually reverted it)
            }
            
            return applyPatch(patch).then(function(result) {
                if (result.wasApplied) {
                    patchesApplied++;
                    appliedPatches[patch.id] = new Date().toISOString();
                    saveTrackingFile(appliedPatches);
                    if (result.requiresReboot) {
                        rebootRequired = true;
                    }
                } else {
                    patchesSkipped++;
                }
            });
        }).catch(function(err) {
            log.error('Error applying patch ' + patch.id + ': ' + err.message);
            log.error(err.stack || err);
            // Continue with other patches even if one fails
        });
    }, Q());
    
    return result.then(function() {
        log.info('========================================');
        log.info('SYSTEM PATCHES: Check complete');
        log.info('Patches applied: ' + patchesApplied);
        log.info('Patches skipped (already applied): ' + patchesSkipped);
        
        // Manage the persistent reboot flag
        if (rebootRequired) {
            // New patches applied that need reboot - set the flag
            setRebootRequiredFlag();
            log.warn('----------------------------------------');
            log.warn('⚠️  REBOOT REQUIRED');
            log.warn('One or more patches require a system');
            log.warn('restart to fully apply changes.');
            log.warn('Please reboot at your convenience.');
            log.warn('----------------------------------------');
        } else if (patchesApplied > 0) {
            // Patches were applied successfully without needing reboot - clear any stale flag
            clearRebootRequiredFlag();
            log.info('All patches applied successfully without requiring reboot');
        }
        // If no patches were applied (patchesApplied === 0), leave existing flag as-is
        // This preserves reboot notifications from previous runs
        
        log.info('========================================');
        if (callback) { callback(null, { rebootRequired: rebootRequired }); }
    }).catch(function(err) {
        log.error('Error during patch process: ' + err.message);
        if (callback) { callback(err); }
    });
}

/**
 * Set the persistent reboot required flag
 * This flag survives updater restarts so the notification can be shown later
 */
function setRebootRequiredFlag() {
    try {
        fs.ensureDirSync(path.dirname(REBOOT_REQUIRED_FLAG));
        var flagData = {
            timestamp: new Date().toISOString(),
            message: 'System patches require a reboot to fully apply changes'
        };
        fs.writeFileSync(REBOOT_REQUIRED_FLAG, JSON.stringify(flagData, null, 2));
        log.debug('Reboot required flag set');
    } catch (err) {
        log.error('Error setting reboot flag: ' + err.message);
    }
}

/**
 * Check if the reboot required flag is set
 * Returns the flag data object or null
 * Automatically clears stale flags if system has been rebooted since flag was set
 */
function checkRebootRequiredFlag() {
    try {
        if (fs.existsSync(REBOOT_REQUIRED_FLAG)) {
            var data = fs.readFileSync(REBOOT_REQUIRED_FLAG, 'utf8');
            var flagData = JSON.parse(data);
            
            // Check if system has been rebooted since flag was set
            try {
                var exec = require('child_process').execSync;
                // Get system uptime in seconds
                var uptimeOutput = exec('cat /proc/uptime').toString();
                var uptimeSeconds = parseFloat(uptimeOutput.split(' ')[0]);
                var uptimeMs = uptimeSeconds * 1000;
                var systemBootTime = Date.now() - uptimeMs;
                var flagTime = new Date(flagData.timestamp).getTime();
                
                if (systemBootTime > flagTime) {
                    // System rebooted after flag was set - clear the stale flag
                    log.info('System has been rebooted since patches were applied, clearing reboot flag');
                    clearRebootRequiredFlag();
                    return null;
                }
            } catch (uptimeErr) {
                log.debug('Could not check system uptime: ' + uptimeErr.message);
                // If we can't check uptime, return the flag data anyway
            }
            
            return flagData;
        }
    } catch (err) {
        log.warn('Error reading reboot flag: ' + err.message);
    }
    return null;
}

/**
 * Clear the reboot required flag
 * Called when user acknowledges the message or after reboot
 */
function clearRebootRequiredFlag() {
    try {
        if (fs.existsSync(REBOOT_REQUIRED_FLAG)) {
            fs.unlinkSync(REBOOT_REQUIRED_FLAG);
            log.debug('Reboot required flag cleared');
        }
    } catch (err) {
        log.error('Error clearing reboot flag: ' + err.message);
    }
}

/**
 * Display reboot notification if the flag is set
 * This should be called early in updater startup, after patches run
 */
function displayRebootNotificationIfNeeded() {
    var flagData = checkRebootRequiredFlag();
    if (flagData) {
        log.warn('========================================');
        log.warn('⚠️  SYSTEM REBOOT RECOMMENDED');
        log.warn('');
        log.warn(flagData.message);
        log.warn('');
        log.warn('Patches were applied on: ' + flagData.timestamp);
        log.warn('Please reboot the system at your convenience');
        log.warn('to ensure all changes take effect.');
        log.warn('========================================');
        return true;
    }
    return false;
}

/**
 * Get the status of all patches (for diagnostics/API)
 */
function getPatchStatus() {
    var appliedPatches = loadTrackingFile();
    var patches = loadPatchModules();
    var rebootFlag = checkRebootRequiredFlag();
    
    return {
        patches: patches.map(function(patch) {
            return {
                id: patch.id,
                description: patch.description,
                version: patch.version || 'unknown',
                applied: appliedPatches[patch.id] || null,
                requiresReboot: patch.requiresReboot === true
            };
        }),
        rebootRequired: rebootFlag !== null,
        rebootMessage: rebootFlag ? rebootFlag.message : null,
        rebootTimestamp: rebootFlag ? rebootFlag.timestamp : null
    };
}

module.exports = {
    runPatches: runPatches,
    getPatchStatus: getPatchStatus,
    displayRebootNotificationIfNeeded: displayRebootNotificationIfNeeded,
    clearRebootRequiredFlag: clearRebootRequiredFlag,
    checkRebootRequiredFlag: checkRebootRequiredFlag
};
