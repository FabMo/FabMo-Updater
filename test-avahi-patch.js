#!/usr/bin/env node
/*
 * test-avahi-patch.js
 * 
 * Manual test script for the Avahi mDNS patch
 * Run with: sudo node test-avahi-patch.js
 */

var patch = require('./patches/003-avahi-mdns-setup.js');
var log = require('./log').logger('test-avahi');

console.log('========================================');
console.log('Testing Avahi mDNS Patch');
console.log('========================================');
console.log('Patch ID:', patch.id);
console.log('Description:', patch.description);
console.log('Version:', patch.version);
console.log('');

console.log('Step 1: Running check()...');
try {
    var needsApplying = patch.check();
    console.log('Result:', needsApplying);
    
    if (!needsApplying) {
        console.log('✓ Patch reports it does not need to be applied');
        console.log('  This means either:');
        console.log('  - Resources directory not found (/fabmo_image_builder/resources/avahi)');
        console.log('  - Avahi already correctly configured');
        console.log('  - Avahi not installed but check() is skipping gracefully');
        process.exit(0);
    }
    
    console.log('');
    console.log('Step 2: Patch needs to be applied. Run apply()? (y/n)');
    console.log('WARNING: This will modify system files!');
    console.log('Press Ctrl+C to abort, or wait 5 seconds to continue...');
    
    setTimeout(function() {
        console.log('');
        console.log('Step 3: Running apply()...');
        try {
            var result = patch.apply();
            console.log('Result:', result);
            
            if (result === true) {
                console.log('✓ Patch applied successfully');
                console.log('');
                console.log('Verification:');
                console.log('  Check: /etc/avahi/avahi-daemon.conf');
                console.log('  Check: /etc/avahi/services/fabmo.service');
                console.log('  Test: avahi-resolve -n fabmo.local');
            } else {
                console.log('✗ Patch apply() returned false - check logs above for errors');
            }
        } catch (err) {
            console.error('✗ Error during apply():', err.message);
            console.error(err.stack);
        }
    }, 5000);
    
} catch (err) {
    console.error('✗ Error during check():', err.message);
    console.error(err.stack);
    process.exit(1);
}
