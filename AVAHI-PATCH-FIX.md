# Avahi mDNS Patch - Bug Fix Summary

## Date: 2026-08-15

## Problem
The Avahi mDNS patch (003-avahi-mdns-setup.js) was not being applied, resulting in `fabmo.local` not resolving. The system had the Avahi daemon installed (default config) but was missing:
- FabMo-customized `/etc/avahi/avahi-daemon.conf` 
- Service advertisement file `/etc/avahi/services/fabmo.service`

## Root Cause
**Critical bugs in patch code** prevented it from ever running correctly:

### Bug #1: Inverted check() logic (Lines 107, 113, 123, 168)
The `check()` function had inverted return values:
- Returned `true` when resources were missing (should skip → return `false`)
- Returned `false` when Avahi was not installed (should apply → return `true`)
- Returned `false` when source files were missing (should skip → return `false`)
- Returned `false` when service was not running (should apply → return `true`)

**Patch Convention:**
- `return true` = patch NEEDS to be applied
- `return false` = patch does NOT need to be applied (skip)

### Bug #2: apply() not returning Promise
The `apply()` function returned boolean values instead of Promises:
- Returned `true`/`false` directly
- Should return `Promise.resolve()` / `Promise.reject()`
- This works with Q() wrapper but is not best practice
- Error handling was inadequate (just returned false on errors)

### Bug #3: Missing requiresReboot property
The module.exports was missing the `requiresReboot: false` property.

## Fixes Applied

### 1. Fixed check() function logic
```javascript
// BEFORE (wrong):
if (!fs.existsSync(RESOURCE_DIR)) {
    return true; // Comment said "skip" but true means "apply"!
}
if (!isAvahiInstalled()) {
    return false; // Should be true - needs to apply!
}

// AFTER (correct):
if (!fs.existsSync(RESOURCE_DIR)) {
    return false; // Skip - not applicable without resources
}
if (!isAvahiInstalled()) {
    return true; // Needs to be applied - will install avahi
}
```

### 2. Converted apply() to return Promise
```javascript
// BEFORE:
function apply() {
    // ... code ...
    return true; // or false
}

// AFTER:
function apply() {
    return new Promise(function(resolve, reject) {
        try {
            // ... code ...
            resolve({ requiresReboot: false });
        } catch (err) {
            reject(err);
        }
    });
}
```

### 3. Added requiresReboot property
```javascript
module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    version: PATCH_VERSION,
    requiresReboot: false,  // NEW: mDNS works immediately
    check: check,
    apply: apply,
    revert: revert
};
```

## Testing & Deployment

### Step 1: Run Diagnostics (Optional)
```bash
cd /fabmo-updater
sudo bash diagnose-avahi.sh
```
This will show current state of Avahi installation.

### Step 2: Test Patch Manually
```bash
cd /fabmo-updater
sudo node test-avahi-patch.js
```
This will:
- Run check() to see if patch needs to be applied
- Optionally run apply() after 5 second countdown
- Show results and verify files

### Step 3: Restart Updater (Automatic Application)
The patch will automatically run on next updater startup:
```bash
sudo systemctl restart fabmo-updater
```

Then monitor logs:
```bash
sudo journalctl -u fabmo-updater -f
```

Look for:
```
========================================
SYSTEM PATCHES: Starting patch check...
========================================
→ Checking: 003-avahi-mdns-setup
  Description: Setup Avahi mDNS for fabmo.local hostname resolution
  ⟳ Applying patch...
  ✓ Successfully applied
```

### Step 4: Verify mDNS Works
After patch applies:
```bash
# On the Raspberry Pi:
avahi-resolve -n fabmo.local
# Should output: fabmo.local    192.168.44.1

# From any device on the network:
ping fabmo.local

# In browser:
http://fabmo.local
```

## Expected Behavior After Fix

1. **First startup after fix**: Patch will detect Avahi not properly configured, apply the patch
2. **Subsequent startups**: Patch will check configs, find them correct, skip
3. **fabmo.local** will resolve on:
   - macOS/iOS (native Bonjour)
   - Linux (Avahi client)
   - Windows 10+ (native mDNS)
   - Android (network service discovery)

## Files Changed
- `/fabmo-updater/patches/003-avahi-mdns-setup.js` - Fixed check() and apply() logic
- `/fabmo-updater/test-avahi-patch.js` - NEW: Manual test script
- `/fabmo-updater/diagnose-avahi.sh` - NEW: Diagnostic script

## Tracking
After successful application, the patch will be recorded in:
- `/opt/patches/patches-applied.json`

Entry will look like:
```json
{
  "003-avahi-mdns-setup": "2026-08-15T12:34:56.789Z"
}
```

## Rollback (if needed)
If something goes wrong:
```bash
# Restore backup configs
sudo cp /etc/avahi/avahi-daemon.conf.backup-* /etc/avahi/avahi-daemon.conf
sudo rm /etc/avahi/services/fabmo.service
sudo systemctl restart avahi-daemon

# Remove from tracking (forces re-check on next startup)
sudo rm /opt/patches/patches-applied.json
```

## Related Resources
- Patch documentation: `/fabmo-updater/patches/003-avahi-mdns-setup.README.md`
- Avahi resources: `/fabmo_image_builder/resources/avahi/`
- System logs: `/var/log/fabmo.log`
- Updater logs: `sudo journalctl -u fabmo-updater`

## Next Steps
1. Test the fixes on your development Pi
2. If successful, commit changes to git
3. Deploy to production systems via updater self-update
4. Update image builder to include Avahi setup by default (future SD images)
