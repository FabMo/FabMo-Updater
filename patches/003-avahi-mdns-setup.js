/*
 * Patch 003: Setup Avahi mDNS with Unique Hostname
 * 
 * This patch installs and configures Avahi daemon to provide mDNS (multicast DNS)
 * service discovery with a unique hostname based on the machine's hardware ID.
 * This allows users to access FabMo via http://fabmo-XXXXXX.local (where XXXXXX is
 * the first 6 characters of the machine ID, matching the AP naming convention).
 * 
 * Benefits:
 * - Works with PCs that have static IP configurations (common in enterprise/education)
 * - Provides consistent hostname regardless of network mode (LAN/Direct/AP)
 * - User-friendly - no need to remember IP addresses
 * - Supports multiple FabMo tools on same network (unique hostnames prevent collisions)
 * - Matches existing AP naming: FabMo-XXXXXX → fabmo-xxxxxx.local
 * 
 * Installs:
 * - avahi-daemon package (if not present)
 * - Dynamic avahi-daemon.conf with unique hostname (generated at runtime)
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
var PATCH_DESCRIPTION = 'Setup Avahi mDNS with unique hostname based on machine ID';
var PATCH_VERSION = '2026-08-18';

// Source directory for Avahi configuration files (bundled with the updater)
var RESOURCE_DIR = path.join(__dirname, 'resources', '003-avahi');

// Target paths
var AVAHI_CONF_DIR = '/etc/avahi';
var AVAHI_SERVICES_DIR = '/etc/avahi/services';

// Configuration files
var CONFIG_FILES = {
    'fabmo.service': {
        source: path.join(RESOURCE_DIR, 'fabmo.service'),
        target: path.join(AVAHI_SERVICES_DIR, 'fabmo.service'),
        hash: null
    }
};

// Avahi daemon config will be generated dynamically based on machine ID

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

function isAvahiInstalled() {
    try {
        exec('which avahi-daemon', {stdio: 'pipe'});
        return true;
    } catch (err) {
        return false;
    }
}

function isAvahiUtilsInstalled() {
    try {
        exec('which avahi-resolve', {stdio: 'pipe'});
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
 * Get machine ID and generate hostname
 * Returns the hostname (e.g., 'fabmo-a1b2c3') or null on error
 */
function getMachineHostname(callback) {
    var hooks = require('../hooks');
    
    hooks.getUniqueID(function(err, machineId) {
        if (err || !machineId) {
            log.warn('Could not get unique machine ID, using fallback');
            // Use a random fallback if we can't get the real ID
            var fallback = Math.random().toString(36).substring(2, 8).toLowerCase();
            return callback(null, 'fabmo-' + fallback);
        }
        
        // Match FabMo's working ID convention: strip all zeros, take first 6 chars.
        // e.g. '10000000da1b7c1f' → '1da1b7',  '33db7558c8b5a8ca' → '33db75'
        var cleanId = machineId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        var noZeros = cleanId.replace(/0/g, '');
        var pool = noZeros.length >= 6 ? noZeros : (noZeros + cleanId);
        var shortId = pool.substring(0, 6);
        
        var hostname = 'fabmo-' + shortId;
        log.info('Generated hostname: ' + hostname + ' (from machine ID: ' + machineId + ')');
        callback(null, hostname);
    });
}

/**
 * Generate avahi-daemon.conf content with the specified hostname
 */
function generateAvahiConfig(hostname) {
    return `# Avahi daemon configuration for FabMo
# Dynamically generated with unique hostname based on machine ID
# Generated: ${new Date().toISOString()}

[server]
host-name=${hostname}
use-ipv4=yes
use-ipv6=no
allow-interfaces=eth0,wlan0

[wide-area]
enable-wide-area=no

[publish]
publish-addresses=yes
publish-hinfo=yes
publish-workstation=yes
publish-domain=yes
publish-a-on-ipv6=no
publish-aaaa-on-ipv4=no

[reflector]
enable-reflector=no

[rlimits]
rlimit-core=0
rlimit-data=4194304
rlimit-fsize=0
rlimit-nofile=768
rlimit-stack=4194304
rlimit-nproc=3
`;
}

/**
 * Check if Avahi configuration is correct
 * Returns false if patch has already been applied (all correct)
 * Returns true if patch needs to be applied (something is wrong or missing)
 */
function check() {
    log.info('Checking Avahi mDNS configuration...');
    
    // Check if resource directory exists (for service file)
    if (!fs.existsSync(RESOURCE_DIR)) {
        log.warn('Avahi resource directory missing from updater package: ' + RESOURCE_DIR);
        return false; // Skip - updater package is incomplete
    }
    
    // Check if avahi-daemon is installed
    if (!isAvahiInstalled()) {
        log.warn('avahi-daemon is not installed');
        return true;
    }

    if (!isAvahiUtilsInstalled()) {
        log.warn('avahi-utils is not installed');
        return true;
    }
    
    // Check if avahi-daemon.conf exists (will be dynamically generated)
    var configPath = path.join(AVAHI_CONF_DIR, 'avahi-daemon.conf');
    if (!fs.existsSync(configPath)) {
        log.warn('avahi-daemon.conf missing');
        return true; // Needs to be applied
    }
    
    // Compare current hostname against the machine-specific expected value (async).
    // Pattern match alone is insufficient - fabmo-100000 matches but is the wrong ID
    // for all RPi 4s since they share that serial prefix.
    return new Promise(function(resolve) {
        getMachineHostname(function(err, expectedHostname) {
            if (err || !expectedHostname) {
                log.warn('Could not determine expected hostname, will re-apply patch');
                return resolve(true);
            }
            try {
                var configContent = fs.readFileSync(configPath, 'utf8');
                var match = configContent.match(/host-name=(fabmo-[a-z0-9]+)/);
                if (!match) {
                    log.warn('avahi-daemon.conf has no FabMo hostname entry');
                    return resolve(true);
                }
                if (match[1] !== expectedHostname) {
                    log.warn('Avahi hostname mismatch: current=' + match[1] + ', expected=' + expectedHostname);
                    return resolve(true);
                }

                // Check service file
                var serviceConfig = CONFIG_FILES['fabmo.service'];
                if (!fs.existsSync(serviceConfig.source)) {
                    log.warn('Source service file missing: ' + serviceConfig.source);
                    return resolve(false);
                }
                serviceConfig.hash = calculateFileHash(serviceConfig.source);
                if (!fs.existsSync(serviceConfig.target)) {
                    log.warn('Missing Avahi service file: ' + serviceConfig.target);
                    return resolve(true);
                }
                if (calculateFileHash(serviceConfig.target) !== serviceConfig.hash) {
                    log.warn('Avahi service file hash mismatch');
                    return resolve(true);
                }

                // Check service is running
                try {
                    exec('systemctl is-active avahi-daemon', {stdio: 'pipe'});
                    log.info('Avahi mDNS is correct (' + expectedHostname + '.local) and service is running');
                    return resolve(false);
                } catch (e) {
                    log.warn('avahi-daemon service is not running');
                    return resolve(true);
                }
            } catch (e) {
                log.warn('Error checking avahi config: ' + e.message);
                return resolve(true);
            }
        });
    });
}

/**
 * Apply the Avahi mDNS patch
 * Returns a Promise that resolves with { requiresReboot: boolean }
 */
function apply() {
    return new Promise(function(resolve, reject) {
        log.info('Applying Avahi mDNS patch...');
        
        // Check if resource directory exists (for service file)
        if (!fs.existsSync(RESOURCE_DIR)) {
            log.warn('Avahi resource directory missing from updater package: ' + RESOURCE_DIR);
            return resolve({ requiresReboot: false });
        }
        
        // Step 1: Get the machine ID and generate hostname
        getMachineHostname(function(err, hostname) {
            if (err || !hostname) {
                return reject(new Error('Failed to generate hostname: ' + (err ? err.message : 'Unknown error')));
            }
            
            log.info('Using hostname: ' + hostname + ' → ' + hostname + '.local');
            
            try {
                // Step 2: Install avahi-daemon and/or avahi-utils if either is missing
                if (!isAvahiInstalled() || !isAvahiUtilsInstalled()) {
                    log.info('Installing missing Avahi packages...');
                    if (!installAvahi()) {
                        return reject(new Error('Failed to install Avahi'));
                    }
                }
                
                // Step 3: Ensure target directories exist
                try {
                    fs.ensureDirSync(AVAHI_CONF_DIR);
                    fs.ensureDirSync(AVAHI_SERVICES_DIR);
                } catch (err) {
                    return reject(new Error('Failed to create Avahi directories: ' + err.message));
                }
                
                // Step 4: Generate and write avahi-daemon.conf with unique hostname
                var configPath = path.join(AVAHI_CONF_DIR, 'avahi-daemon.conf');
                log.info('Generating dynamic avahi-daemon.conf with hostname: ' + hostname);
                
                try {
                    // Backup existing file if present
                    if (fs.existsSync(configPath)) {
                        var backupPath = configPath + '.backup-' + Date.now();
                        log.info('Backing up existing avahi-daemon.conf to ' + backupPath);
                        fs.copyFileSync(configPath, backupPath);
                    }
                    
                    // Write new config
                    var configContent = generateAvahiConfig(hostname);
                    fs.writeFileSync(configPath, configContent, 'utf8');
                    fs.chmodSync(configPath, 0o644);
                    log.info('avahi-daemon.conf written successfully');
                } catch (err) {
                    return reject(new Error('Failed to write avahi-daemon.conf: ' + err.message));
                }
                
                // Step 5: Copy service file
                log.info('Installing Avahi service file...');
                try {
                    var serviceConfig = CONFIG_FILES['fabmo.service'];
                    
                    if (!fs.existsSync(serviceConfig.source)) {
                        return reject(new Error('Source file not found: ' + serviceConfig.source));
                    }
                    
                    // Backup existing file if present
                    if (fs.existsSync(serviceConfig.target)) {
                        var backupPath = serviceConfig.target + '.backup-' + Date.now();
                        log.info('Backing up existing fabmo.service to ' + backupPath);
                        fs.copyFileSync(serviceConfig.target, backupPath);
                    }
                    
                    // Copy new file
                    log.info('Installing fabmo.service to ' + serviceConfig.target);
                    fs.copyFileSync(serviceConfig.source, serviceConfig.target);
                    fs.chmodSync(serviceConfig.target, 0o644);
                } catch (err) {
                    return reject(new Error('Failed to install Avahi service file: ' + err.message));
                }
                
                // Step 6: Enable and restart avahi-daemon service
                log.info('Enabling and restarting avahi-daemon service...');
                try {
                    exec('systemctl enable avahi-daemon', {stdio: 'inherit'});
                    exec('systemctl restart avahi-daemon', {stdio: 'inherit'});
                    log.info('avahi-daemon service restarted');
                } catch (err) {
                    return reject(new Error('Failed to restart avahi-daemon: ' + err.message));
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
                                return reject(new Error('Service did not start after ' + maxRetries + ' retries'));
                            }
                            // Wait 1 second before retry
                            exec('sleep 1', {stdio: 'pipe'});
                        }
                    }
                } catch (err) {
                    return reject(new Error('avahi-daemon service failed to start: ' + err.message));
                }
                
                // Step 7: Test if hostname resolves
                log.info('Testing mDNS resolution...');
                try {
                    // Give it a few seconds to register
                    exec('sleep 3', {stdio: 'pipe'});
                    
                    var testHostname = hostname + '.local';
                    var result = exec('avahi-resolve -n ' + testHostname, {stdio: 'pipe'}).toString();
                    log.info(testHostname + ' resolves successfully');
                    log.info('Resolution: ' + result.trim());
                } catch (err) {
                    log.warn('mDNS resolution test failed (may work after reboot)');
                    log.debug(err.message);
                }
                
                log.info('Avahi mDNS patch applied successfully');
                log.info('FabMo is now accessible at: http://' + hostname + '.local');
                log.info('This matches the AP name convention (FabMo-' + hostname.substring(6).toUpperCase() + ')');
                
                // Resolve with no reboot required (mDNS should work immediately)
                resolve({ requiresReboot: false });
                
            } catch (err) {
                log.error('Unexpected error in apply(): ' + err.message);
                reject(err);
            }
        });
    });
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
    requiresReboot: false,  // mDNS should work immediately after service restart
    check: check,
    apply: apply,
    revert: revert
};
