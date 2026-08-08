/*
 * Patch 002: Restore and Protect NetworkManager Connection Profiles
 * 
 * This patch ensures that critical NetworkManager connection profiles and dnsmasq
 * configurations are present and protected from accidental deletion.
 * 
 * Restores:
 * - NetworkManager connection profiles (lan-connection, direct-connection, wlan0_ap)
 * - dnsmasq configurations (ap-only, direct-mode)
 * - NetworkManager dispatcher scripts
 * 
 * After restoration, sets immutable flags on connection files to prevent
 * accidental deletion through the NetworkManager UI.
 * 
 * Background: Users with access to the desktop environment can accidentally delete
 * network connections through the UI, which breaks the multi-mode networking system.
 * This patch both restores missing connections and protects them from future deletion.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-002');
var exec = require('child_process').execSync;
var crypto = require('crypto');
var path = require('path');

var PATCH_ID = '002-network-connections-restore';
var PATCH_DESCRIPTION = 'Restore and protect NetworkManager connection profiles';
var PATCH_VERSION = '2026-08-07';

// Source directory for network configuration files
var RESOURCE_DIR = '/fabmo_image_builder/resources';

// Target paths
var NETWORK_MANAGER_DIR = '/etc/NetworkManager';
var DNSMASQ_DIR = '/etc/dnsmasq.d';

// Critical connection files that must exist
var REQUIRED_CONNECTIONS = [
    'lan-connection',
    'direct-connection',
    'wlan0_ap.nmconnection'
];

// Required dnsmasq configs
var REQUIRED_DNSMASQ_CONFIGS = [
    'ap-only.conf',
    'direct-mode.conf'
];

/**
 * Calculate SHA256 hash of file content
 */
function getFileHash(filePath) {
    try {
        var content = fs.readFileSync(filePath, 'utf8');
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
        return null;
    }
}

/**
 * Check if a file has the immutable flag set
 */
function isImmutable(filePath) {
    try {
        var output = exec('lsattr "' + filePath + '" 2>/dev/null || true').toString();
        return output.includes('----i-');
    } catch (err) {
        return false;
    }
}

/**
 * Check if this patch needs to be applied
 * Returns true if any connection files are missing, corrupted, or not protected
 */
function check() {
    try {
        var needsApplying = false;
        
        // Check if resource directory exists (patch not applicable if missing)
        if (!fs.existsSync(RESOURCE_DIR)) {
            log.info('  Resource directory not found: ' + RESOURCE_DIR);
            log.info('  Patch not applicable (likely not on a development SD card)');
            return false;
        }
        
        // Check NetworkManager connection profiles
        var connectionsDir = path.join(NETWORK_MANAGER_DIR, 'system-connections');
        log.debug('  Checking NetworkManager connections in ' + connectionsDir);
        
        for (var i = 0; i < REQUIRED_CONNECTIONS.length; i++) {
            var connFile = path.join(connectionsDir, REQUIRED_CONNECTIONS[i]);
            var sourceFile = path.join(RESOURCE_DIR, 'NetworkManager/system-connections', REQUIRED_CONNECTIONS[i]);
            
            if (!fs.existsSync(connFile)) {
                log.info('  Missing connection file: ' + REQUIRED_CONNECTIONS[i]);
                needsApplying = true;
                continue;
            }
            
            // Check if content matches expected
            var currentHash = getFileHash(connFile);
            var expectedHash = getFileHash(sourceFile);
            
            if (currentHash !== expectedHash) {
                log.info('  Connection file differs from expected: ' + REQUIRED_CONNECTIONS[i]);
                log.debug('    Current:  ' + (currentHash ? currentHash.substring(0, 16) : 'null'));
                log.debug('    Expected: ' + (expectedHash ? expectedHash.substring(0, 16) : 'null'));
                needsApplying = true;
                continue;
            }
            
            // Check if static connections (not wlan0_ap) are protected with immutable flag
            // wlan0_ap should NOT be protected as it needs dynamic SSID updates
            var shouldBeProtected = (REQUIRED_CONNECTIONS[i] === 'lan-connection' || 
                                    REQUIRED_CONNECTIONS[i] === 'direct-connection');
            if (shouldBeProtected && !isImmutable(connFile)) {
                log.info('  Static connection file not protected: ' + REQUIRED_CONNECTIONS[i]);
                needsApplying = true;
            }
        }
        
        // Check dnsmasq configurations
        log.debug('  Checking dnsmasq configurations in ' + DNSMASQ_DIR);
        
        for (var j = 0; j < REQUIRED_DNSMASQ_CONFIGS.length; j++) {
            var dnsmasqFile = path.join(DNSMASQ_DIR, REQUIRED_DNSMASQ_CONFIGS[j]);
            var sourceFile = path.join(RESOURCE_DIR, 'dnsmasq', REQUIRED_DNSMASQ_CONFIGS[j]);
            
            if (!fs.existsSync(dnsmasqFile)) {
                log.info('  Missing dnsmasq config: ' + REQUIRED_DNSMASQ_CONFIGS[j]);
                needsApplying = true;
                continue;
            }
            
            var currentHash = getFileHash(dnsmasqFile);
            var expectedHash = getFileHash(sourceFile);
            
            if (currentHash !== expectedHash) {
                log.info('  dnsmasq config differs from expected: ' + REQUIRED_DNSMASQ_CONFIGS[j]);
                needsApplying = true;
            }
        }
        
        // Check if active-mode.conf symlink exists
        var activeModeLink = path.join(DNSMASQ_DIR, 'active-mode.conf');
        if (!fs.existsSync(activeModeLink)) {
            log.info('  Missing active-mode.conf symlink');
            needsApplying = true;
        }
        
        if (needsApplying) {
            log.info('  Network configuration restoration needed');
        } else {
            log.debug('  All network configurations present and protected');
        }
        
        return needsApplying;
        
    } catch (err) {
        log.warn('  Error checking patch status: ' + err.message);
        log.warn('  Stack: ' + err.stack);
        // If we can't determine status, it's safer to try applying
        return true;
    }
}

/**
 * Apply the patch by restoring network configurations and protecting them
 * Returns a promise that resolves with { requiresReboot: boolean }
 */
function apply() {
    return new Promise(function(resolve, reject) {
        try {
            var needsReboot = false;
            var backupDir = '/tmp/fabmo-network-backup-' + Date.now();
            
            log.info('  Applying network configuration restoration...');
            log.info('  Creating backup directory: ' + backupDir);
            fs.ensureDirSync(backupDir);
            
            // ===== Restore NetworkManager Configurations =====
            log.info('  Restoring NetworkManager configurations...');
            
            var connectionsDir = path.join(NETWORK_MANAGER_DIR, 'system-connections');
            fs.ensureDirSync(connectionsDir);
            
            // First, remove immutable flags if they exist (so we can update files)
            // Only need to do this for static connections that we protect
            log.debug('  Removing immutable flags temporarily from static connections...');
            var staticConnections = ['lan-connection', 'direct-connection'];
            for (var i = 0; i < staticConnections.length; i++) {
                var connFile = path.join(connectionsDir, staticConnections[i]);
                if (fs.existsSync(connFile)) {
                    try {
                        exec('chattr -i "' + connFile + '" 2>/dev/null || true');
                    } catch (err) {
                        log.debug('  Could not remove immutable flag from ' + staticConnections[i]);
                    }
                }
            }
            
            // Copy connection files
            for (var j = 0; j < REQUIRED_CONNECTIONS.length; j++) {
                var connName = REQUIRED_CONNECTIONS[j];
                var sourceFile = path.join(RESOURCE_DIR, 'NetworkManager/system-connections', connName);
                var targetFile = path.join(connectionsDir, connName);
                
                if (!fs.existsSync(sourceFile)) {
                    log.warn('  Source file not found: ' + sourceFile);
                    continue;
                }
                
                // Backup existing file
                if (fs.existsSync(targetFile)) {
                    log.debug('  Backing up existing: ' + connName);
                    fs.copySync(targetFile, path.join(backupDir, connName));
                }
                
                // Copy new file
                log.info('  Installing: ' + connName);
                fs.copySync(sourceFile, targetFile);
                fs.chmodSync(targetFile, '600');
            }
            
            // Set immutable flags on static connection files only
            // NOTE: wlan0_ap.nmconnection is NOT protected because its SSID is dynamically
            //       updated by ip-reporting.py to broadcast the current IP address
            log.info('  Protecting static connection files with immutable flags...');
            var protectedConnections = ['lan-connection', 'direct-connection'];
            for (var k = 0; k < protectedConnections.length; k++) {
                var connFile = path.join(connectionsDir, protectedConnections[k]);
                if (fs.existsSync(connFile)) {
                    try {
                        exec('chattr +i "' + connFile + '" 2>/dev/null');
                        log.info('    ✓ Protected: ' + protectedConnections[k]);
                    } catch (err) {
                        log.warn('    ✗ Could not protect: ' + protectedConnections[k] + ' (' + err.message + ')');
                    }
                }
            }
            log.info('    ℹ wlan0_ap remains writable for dynamic SSID updates');
            
            // Copy NetworkManager main config if it differs
            var nmConfSource = path.join(RESOURCE_DIR, 'NetworkManager/NetworkManager.conf');
            var nmConfTarget = path.join(NETWORK_MANAGER_DIR, 'NetworkManager.conf');
            if (fs.existsSync(nmConfSource)) {
                var sourceHash = getFileHash(nmConfSource);
                var targetHash = getFileHash(nmConfTarget);
                if (sourceHash !== targetHash) {
                    log.info('  Updating NetworkManager.conf');
                    if (fs.existsSync(nmConfTarget)) {
                        fs.copySync(nmConfTarget, path.join(backupDir, 'NetworkManager.conf'));
                    }
                    fs.copySync(nmConfSource, nmConfTarget);
                }
            }
            
            // Copy dispatcher scripts
            var dispatcherSource = path.join(RESOURCE_DIR, 'NetworkManager/dispatcher.d');
            var dispatcherTarget = path.join(NETWORK_MANAGER_DIR, 'dispatcher.d');
            if (fs.existsSync(dispatcherSource)) {
                log.info('  Installing NetworkManager dispatcher scripts...');
                fs.ensureDirSync(dispatcherTarget);
                fs.copySync(dispatcherSource, dispatcherTarget);
                // Make scripts executable
                try {
                    exec('chmod 755 "' + dispatcherTarget + '"/* 2>/dev/null || true');
                } catch (err) {
                    log.debug('  Note: Could not set executable on dispatcher scripts');
                }
            }
            
            // ===== Restore dnsmasq Configurations =====
            log.info('  Restoring dnsmasq configurations...');
            fs.ensureDirSync(DNSMASQ_DIR);
            
            for (var m = 0; m < REQUIRED_DNSMASQ_CONFIGS.length; m++) {
                var configName = REQUIRED_DNSMASQ_CONFIGS[m];
                var sourceFile = path.join(RESOURCE_DIR, 'dnsmasq', configName);
                var targetFile = path.join(DNSMASQ_DIR, configName);
                
                if (!fs.existsSync(sourceFile)) {
                    log.warn('  Source file not found: ' + sourceFile);
                    continue;
                }
                
                if (fs.existsSync(targetFile)) {
                    fs.copySync(targetFile, path.join(backupDir, configName));
                }
                
                log.info('  Installing: ' + configName);
                fs.copySync(sourceFile, targetFile);
                fs.chmodSync(targetFile, '644');
            }
            
            // Create or verify active-mode.conf symlink
            var activeModeLink = path.join(DNSMASQ_DIR, 'active-mode.conf');
            if (fs.existsSync(activeModeLink)) {
                fs.unlinkSync(activeModeLink);
            }
            log.info('  Creating active-mode.conf symlink (defaulting to ap-only)...');
            fs.symlinkSync(path.join(DNSMASQ_DIR, 'ap-only.conf'), activeModeLink);
            
            // ===== Reload Services =====
            log.info('  Reloading network services...');
            
            try {
                exec('systemctl reload NetworkManager 2>/dev/null || systemctl restart NetworkManager');
                log.info('    ✓ NetworkManager reloaded');
                needsReboot = true; // Connection changes often require reboot for full effect
            } catch (err) {
                log.warn('    ✗ Could not reload NetworkManager: ' + err.message);
                needsReboot = true;
            }
            
            try {
                exec('systemctl restart dnsmasq 2>/dev/null');
                log.info('    ✓ dnsmasq restarted');
            } catch (err) {
                log.warn('    ✗ Could not restart dnsmasq: ' + err.message);
            }
            
            // Check if hostapd should be disabled
            try {
                var hostapdEnabled = exec('systemctl is-enabled hostapd 2>/dev/null || echo disabled').toString().trim();
                if (hostapdEnabled === 'enabled') {
                    log.info('  Disabling standalone hostapd (NetworkManager manages AP)...');
                    exec('systemctl disable hostapd 2>/dev/null');
                    exec('systemctl stop hostapd 2>/dev/null || true');
                }
            } catch (err) {
                log.debug('  Note: Could not check/disable hostapd: ' + err.message);
            }
            
            log.info('  ✓ Network configuration restoration complete');
            log.info('  Backup saved to: ' + backupDir);
            log.info('  Static connections protected: lan-connection, direct-connection');
            log.info('  Dynamic connection (wlan0_ap) remains writable for SSID updates');
            
            if (needsReboot) {
                log.warn('  ⚠️  System reboot recommended for network changes to fully take effect');
            }
            
            resolve({ requiresReboot: needsReboot });
            
        } catch (err) {
            log.error('  ✗ Error applying patch: ' + err.message);
            log.error('  Stack: ' + err.stack);
            reject(err);
        }
    });
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    version: PATCH_VERSION,
    check: check,
    apply: apply
};
