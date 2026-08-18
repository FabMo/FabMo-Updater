# Avahi Configuration Resources

## Purpose
This directory contains resources for Avahi mDNS patch (003).

## Files

### fabmo.service
**Status**: ✅ ACTIVE - Used by patch

This file is copied to `/etc/avahi/services/fabmo.service` and advertises the FabMo HTTP service on the network.

### avahi-daemon.conf (DEPRECATED)
**Status**: ⚠️ DEPRECATED - No longer used

**Old behavior**: Static config file copied to `/etc/avahi/avahi-daemon.conf`
- Used hardcoded hostname: `fabmo`
- Caused collisions with multiple tools on same network

**New behavior**: Config is **dynamically generated** at runtime
- Uses unique hostname: `fabmo-<6chars>` (first 6 chars of machine ID)
- Matches AP naming: `FabMo-A1B2C3` → `fabmo-a1b2c3.local`
- Prevents hostname collisions

**Implementation**: See `generateAvahiConfig()` function in `003-avahi-mdns-setup.js`

## Migration Notes

If updating from an old version with static hostname:
- Patch will backup old config: `/etc/avahi/avahi-daemon.conf.backup-<timestamp>`
- New dynamic config will be generated with unique hostname
- Service will restart with new hostname
- Old bookmarks to `fabmo.local` will need to be updated to `fabmo-<id>.local`
