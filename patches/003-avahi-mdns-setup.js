/*
 * Patch 003: Setup Avahi mDNS for fabmo.local Access
 * 
 * This patch installs and configures Avahi daemon to provide mDNS (multicast DNS)
 * service discovery. This allows users to access FabMo via http://fabmo.local
 * instead of requiring the IP address.
 * 
 * Benefits:
 * - Works with PCs that have static IP configurations (common in enterprise/education)
 * - Provides consistent hostname regardless of network mode (LAN/Direct/AP)
 * - User-friendly - no need to remember IP addresses
 * - Automatic discovery for compatible clients
 * 
 * Installs:
 * - avahi-daemon package (if not present)
 * - Custom avahi-daemon.conf (optimized for FabMo)
 * - FabMo service file (advertises HTTP service)
 * 
 * This patch is idempotent and safe to run multiple times.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-003');
var exec = require('child_process').execSync;
var crypto = require('crypto');
var path = require('path');

var PATCH_ID = '003-avahi-mdns-setup';
var PATCH_DESCRIPTION = 'Setup Avahi mDNS for fabmo.local hostname resolution';
var PATCH_VERSION = '2026-08-11';

// Source directory for Avahi configuration files
var RESOURCE_DIR = '/fabmo_image_builder/resources/avahi';

// Target paths
var AVAHI_CONF_DIR = '/etc/avahi';
var AVAHI_SERVICES_DIR = '/etc/avahi/services';

// Configuration files with expected SHA256 hashes
var CONFIG_FILES = {
    'avahi-daemon.conf': {
        source: path.join(RESOURCE_DIR, 'avahi-daemon.conf'),
        target: path.join(AVAHI_CONF_DIR, 'avahi-daemon.conf'),
        hash: null // Will be calculated from source
    },
    'fabmo.service': {
        source: path.join(RESOURCE_DIR, 'fabmo.service'),
        target: path.join(AVAHI_SERVICES_DIR, 'fabmo.service'),
        hash: null
    }
};

/**
 * Calculate SHA256 hash of a file
 */
function calculateFileHash(filePath) {
    try {
        var content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
        return null;
    }
}

/**
 * Check if avahi-daemon package is installed
 */
function isAvahiInstalled() {
    try {
        exec('which avahi-daemon', {stdio: 'pipe'});
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Install avahi-daemon package
 */
function installAvahi() {
    log.info('Installing avahi-daemon package...');
    try {
        // Update package list first
        log.info('Updating package lists...');
        exec('apt-get update', {stdio: 'inherit'});
        
        // Install avahi-daemon
        log.info('Installing avahi-daemon...');
        exec('apt-get install -y avahi-daemon avahi-utils', {stdio: 'inherit'});
        
        log.info('Avahi packages installed successfully');
        return true;
    } catch (err) {
        log.error('Failed to install avahi-daemon: ' + err.message);
        return false;
    }
}

/**
 * Check if Avahi configuration is correct
 */
function check() {
    log.info('Checking Avahi mDNS configuration...');
    
    // Check if resource directory exists
    if (!fs.existsSync(RESOURCE_DIR)) {
        log.info('Resource directory not found: ' + RESOURCE_DIR);
        log.info('Skipping Avahi setup (image builder resources not present)');
        return true; // Not an error - just skip
    }
    
    // Check if avahi-daemon is installed
    if (!isAvahiInstalled()) {
        log.warn('avahi-daemon is not installed');
        return false;
    }
    
    // Calculate expected hashes from source files
    for (var name in CONFIG_FILES) {
        var config = CONFIG_FILES[name];
        if (fs.existsSync(config.source)) {
            config.hash = calculateFileHash(config.source);
        } else {
            log.warn('Source file missing: ' + config.source);
            return false;
        }
    }
    
    // Check if all target files exist with correct content
    var allCorrect = true;
    for (var name in CONFIG_FILES) {
        var config = CONFIG_FILES[name];
        
        if (!fs.existsSync(config.target)) {
            log.warn('Missing Avahi config: ' + config.target);
            allCorrect = false;
            continue;
        }
        
        var targetHash = calculateFileHash(config.target);
        if (targetHash !== config.hash) {
            log.warn('Avahi config hash mismatch: ' + name);
            log.debug('Expected: ' + config.hash);
            log.debug('Found: ' + targetHash);
            allCorrect = false;
        }
    }
    
    if (allCorrect) {
        log.info('Avahi configuration is correct');
        
        // Check if service is running
        try {
            exec('systemctl is-active avahi-daemon', {stdio: 'pipe'});
            log.info('avahi-daemon service is running');
        } catch (err) {
            log.warn('avahi-daemon service is not running');
            return false;
        }
    }
    
    return allCorrect;
}

/**
 * Apply the Avahi mDNS patch
 */
function apply() {
    log.info('Applying Avahi mDNS patch...');
    
    // Check if resource directory exists
    if (!fs.existsSync(RESOURCE_DIR)) {
        log.info('Resource directory not found - skipping Avahi setup');
        return true; // Not an error
    }
    
    // Install avahi-daemon if not present
    if (!isAvahiInstalled()) {
        log.info('Avahi not installed, installing now...');
        if (!installAvahi()) {
            log.error('Failed to install Avahi');
            return false;
        }
    }
    
    // Ensure target directories exist
    try {
        fs.ensureDirSync(AVAHI_CONF_DIR);
        fs.ensureDirSync(AVAHI_SERVICES_DIR);
    } catch (err) {
        log.error('Failed to create Avahi directories: ' + err.message);
        return false;
    }
    
    // Copy configuration files
    log.info('Installing Avahi configuration files...');
    try {
        for (var name in CONFIG_FILES) {
            var config = CONFIG_FILES[name];
            
            if (!fs.existsSync(config.source)) {
                log.error('Source file not found: ' + config.source);
                return false;
            }
            
            // Backup existing file if present
            if (fs.existsSync(config.target)) {
                var backupPath = config.target + '.backup-' + Date.now();
                log.info('Backing up existing ' + name + ' to ' + backupPath);
                fs.copyFileSync(config.target, backupPath);
            }
            
            // Copy new file
            log.info('Installing ' + name + ' to ' + config.target);
            fs.copyFileSync(config.source, config.target);
            
            // Set proper permissions
            fs.chmodSync(config.target, 0o644);
        }
    } catch (err) {
        log.error('Failed to install Avahi configuration: ' + err.message);
        return false;
    }
    
    // Enable and restart avahi-daemon service
    log.info('Enabling and restarting avahi-daemon service...');
    try {
        exec('systemctl enable avahi-daemon', {stdio: 'inherit'});
        exec('systemctl restart avahi-daemon', {stdio: 'inherit'});
        log.info('avahi-daemon service restarted');
    } catch (err) {
        log.error('Failed to restart avahi-daemon: ' + err.message);
        return false;
    }
    
    // Wait a moment for service to start
    try {
        var maxRetries = 5;
        var retries = 0;
        while (retries < maxRetries) {
            try {
                exec('systemctl is-active avahi-daemon', {stdio: 'pipe'});
                break;
            } catch (e) {
                retries++;
                if (retries >= maxRetries) {
                    throw new Error('Service did not start after ' + maxRetries + ' retries');
                }
                // Wait 1 second before retry
                exec('sleep 1', {stdio: 'pipe'});
            }
        }
    } catch (err) {
        log.error('avahi-daemon service failed to start: ' + err.message);
        return false;
    }
    
    // Test if fabmo.local resolves
    log.info('Testing mDNS resolution...');
    try {
        // Give it a few seconds to register
        exec('sleep 3', {stdio: 'pipe'});
        
        var result = exec('avahi-resolve -n fabmo.local', {stdio: 'pipe'}).toString();
        log.info('fabmo.local resolves successfully');
        log.info('Resolution: ' + result.trim());
    } catch (err) {
        log.warn('fabmo.local resolution test failed (may work after reboot)');
        log.debug(err.message);
    }
    
    log.info('Avahi mDNS patch applied successfully');
    log.info('FabMo should now be accessible at: http://fabmo.local');
    return true;
}

/**
 * Revert the patch (remove Avahi configuration)
 * Note: Does not uninstall the package, just removes custom configs
 */
function revert() {
    log.info('Reverting Avahi mDNS patch...');
    
    try {
        // Stop service
        exec('systemctl stop avahi-daemon', {stdio: 'inherit'});
        
        // Remove custom configuration files
        for (var name in CONFIG_FILES) {
            var config = CONFIG_FILES[name];
            if (fs.existsSync(config.target)) {
                log.info('Removing ' + config.target);
                fs.unlinkSync(config.target);
            }
        }
        
        // Restore defaults (avahi-daemon will use defaults if no config present)
        log.info('Avahi mDNS configuration removed');
        log.info('Note: avahi-daemon package still installed but disabled');
        
        return true;
    } catch (err) {
        log.error('Failed to revert Avahi patch: ' + err.message);
        return false;
    }
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    version: PATCH_VERSION,
    check: check,
    apply: apply,
    revert: revert
};
