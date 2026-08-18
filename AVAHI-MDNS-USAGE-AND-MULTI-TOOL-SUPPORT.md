# Avahi mDNS Usage Guide and Multiple-Tool Support

## Date: 2026-08-18
## Status: ✅ IMPLEMENTED

This document describes the Avahi mDNS implementation with **unique hostnames** for FabMo tools.

## Current Avahi Configuration

### Dynamic Unique Hostnames ✅
The implementation uses **dynamic hostname generation** based on machine ID:

```
Hostname format: fabmo-<6chars>
Example: fabmo-a1b2c3.local
```

Each FabMo tool gets a **unique hostname** matching its AP naming convention:
- AP name: `FabMo-A1B2C3`
- mDNS hostname: `fabmo-a1b2c3.local`

**Configuration**: Generated at runtime in `/etc/avahi/avahi-daemon.conf`

---

## When Does fabmo.local Work?

### ✅ **Scenarios Where fabmo.local Works**

#### 1. **Direct Ethernet (Link-Local)**
- **Setup**: Tool connected directly to PC via ethernet cable
- **Network**: Both devices on 169.254.x.x (APIPA/link-local)
- **Why it works**: mDNS operates on link-local multicast (224.0.0.251)
- **Typical IP**: 192.168.44.1 or 169.254.x.x

#### 2. **Same LAN/WiFi Network**
- **Setup**: Both tool and client on same local network
- **Network**: Same subnet (e.g., 192.168.1.x)
- **Why it works**: mDNS multicast traffic stays within broadcast domain
- **Typical IP**: Assigned by DHCP (e.g., 192.168.1.50)

#### 3. **Tool as WiFi Access Point (Limited)**
- **Setup**: Client connects to tool's AP (e.g., "FabMo-A1B2C3D4")
- **Network**: Tool is 192.168.42.1, client gets 192.168.42.x
- **Why it works**: Tool runs Avahi on wlan0 interface
- **Typical IP**: 192.168.42.1
- **Note**: Since the tool IS the network, mDNS broadcasting is somewhat redundant here

---

### ❌ **Scenarios Where fabmo.local Does NOT Work**

#### 1. **Across Routers/Subnets**
- **Why**: mDNS is link-local only (TTL=1), doesn't route
- **Example**: Tool on 192.168.1.x, client on 10.0.0.x
- **Workaround**: Use direct IP address

#### 2. **VPN/Remote Networks**
- **Why**: mDNS traffic doesn't traverse VPN tunnels by default
- **Workaround**: Use direct IP or set up mDNS reflector

#### 3. **Corporate Networks with mDNS Filtering**
- **Why**: Many enterprise networks block multicast traffic
- **Workaround**: Use direct IP address

---

## Conflict with Regular IP?

### No Conflict - They Coexist

**fabmo.local** and **direct IP** (like 192.168.42.1) are **complementary**, not conflicting:

- **fabmo.local** → DNS lookup → resolves to current IP address
- **192.168.42.1** → Direct IP access

Both access methods work simultaneously:
```bash
# These both work and access the same server:
http://fabmo.local       # mDNS resolution
http://192.168.42.1      # Direct IP
```

**User Experience:**
- Users who know the IP → Use direct IP (faster, no DNS lookup)
- Users who don't know IP → Use fabmo.local (convenience)
- Network configuration tools → Show both options

**Broadcasting in SSID:**
The current system broadcasts IP in the AP SSID name (e.g., "FabMo-A1B2C3D4-192-168-42-1"), which is **still useful** because:
1. Works even if client doesn't support mDNS (Windows < 10, some Linux)
2. Provides instant visual feedback without any DNS query
3. Serves as backup when mDNS fails

---

## Multiple FabMo Tools on Same Network

### ✅ **IMPLEMENTED: Unique Hostnames Prevent Collision**

With unique hostname generation (first 6 characters of machine ID), **each tool announces itself with its own hostname**.

**Network with multiple tools:**
```
Network:
├── Tool #1 (ID: A1B2C3...) → fabmo-a1b2c3.local → 192.168.1.50
├── Tool #2 (ID: E5F6G7...) → fabmo-e5f6g7.local → 192.168.1.51
└── Tool #3 (ID: I9J0K1...) → fabmo-i9j0k1.local → 192.168.1.52
```

**Client can resolve each tool reliably:**
- ✅ `http://fabmo-a1b2c3.local` → Reaches Tool #1
- ✅ `http://fabmo-e5f6g7.local` → Reaches Tool #2  
- ✅ `http://fabmo-i9j0k1.local` → Reaches Tool #3

**No hostname collision** - each tool has its unique address matching its AP name.

---

## Implementation: COMPLETED ✅

**Status**: Implemented in patch 003 on 2026-08-18

**Files modified:**
- `/fabmo-updater/patches/003-avahi-mdns-setup.js` - Dynamic hostname generation
- `/fabmo-updater/patches/003-avahi-mdns-setup.README.md` - Documentation
- `/fabmo-updater/IMAGE-BUILDER-AVAHI-INTEGRATION.md` - Image builder guide

**Key features:**
- Calls `hooks.getUniqueID()` to get hardware ID
- Extracts first 6 characters (matching AP convention)
- Generates hostname: `fabmo-<6chars>`
- Dynamically writes `/etc/avahi/avahi-daemon.conf`
- Tests mDNS resolution after applying

---

## Solution: Unique Hostnames Using Machine ID

### The Infrastructure Already Exists!

FabMo already has a **unique machine ID system**:

**Hook System** (`/fabmo-updater/hooks/index.js`):
```javascript
exports.getUniqueID = function(callback) {
    execute('get_unique_id', null, callback);
}
```

**Platform-Specific IDs:**
- **Raspberry Pi**: CPU serial number (`/proc/cpuinfo`)
  ```bash
  $ cat /proc/cpuinfo | grep Serial
  Serial          : 00000000a1b2c3d4
  ```
- **BeagleBone**: EEPROM serial
- **Edison**: Factory serial from `/factory/serial_number`
- **Generic Linux**: D-Bus machine-id

**Current Usage:**
- ✅ Already stored in `config.updater.id`
- ✅ Already used for AP name: `"FabMo-" + id`
- ❌ **NOT** used for Avahi hostname (hardcoded "fabmo")

---

## Proposed Enhancement: Dynamic Avahi Hostnames

### Implementation Strategy

**Modify** `/fabmo-updater/patches/003-avahi-mdns-setup.js` to:

1. **Get unique machine ID** during patch application
2. **Generate hostname** like `fabmo-<short-id>`
3. **Write dynamic config** instead of static file

### Example Hostnames

With CPU serial `00000000a1b2c3d4`:
```
host-name=fabmo-a1b2c3d4
```

Resulting mDNS names:
- `fabmo-a1b2c3d4.local` (unique per tool)
- Still readable and predictable
- Matches the existing AP naming convention

### Network with Multiple Tools

```
Network:
├── Tool #1 → fabmo-a1b2c3d4.local → 192.168.1.50
├── Tool #2 → fabmo-e5f6g7h8.local → 192.168.1.51
└── Tool #3 → fabmo-i9j0k1l2.local → 192.168.1.52

User can reliably reach specific tool:
http://fabmo-a1b2c3d4.local  ✅
http://fabmo-e5f6g7h8.local  ✅
http://fabmo-i9j0k1l2.local  ✅
```

### User-Friendly Alias (Optional)

For convenience in single-tool environments, keep a **fabmo.local** alias by adding a CNAME record to the Avahi service file:

**`/etc/avahi/services/fabmo.service`:**
```xml
<service-group>
  <name replace-wildcards="yes">FabMo on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
    <!-- Advertise both unique and generic names -->
    <host-name>fabmo-a1b2c3d4</host-name>
  </service>
</service-group>
```

**Result:**
- Primary: `fabmo-a1b2c3d4.local` (always works)
- Alias: `fabmo.local` (works in single-tool networks, undefined in multi-tool)

---

## Implementation Code Changes

### Modified Patch: 003-avahi-mdns-setup.js

**Key changes needed:**

```javascript
// In the apply() function:

function apply() {
    log.info('Applying Avahi mDNS patch...');
    
    return Q.Promise(function(resolve, reject) {
        // Step 1: Get unique machine ID
        var hooks = require('../hooks');
        var updater = require('../updater');
        
        hooks.getUniqueID(function(err, machineId) {
            if (err || !machineId) {
                log.warn('Could not get unique machine ID, using default hostname');
                machineId = 'generic';
            }
            
            // Clean up ID (remove dashes, lowercase, take last 8 chars)
            var cleanId = machineId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-8);
            var hostname = 'fabmo-' + cleanId;
            
            log.info('Using hostname: ' + hostname);
            
            // Step 2: Check if avahi-daemon is installed
            if (!isAvahiInstalled()) {
                if (!installAvahi()) {
                    return reject(new Error('Failed to install Avahi'));
                }
            }
            
            // Step 3: Generate dynamic avahi-daemon.conf
            var config = generateAvahiConfig(hostname);
            fs.writeFileSync(
                path.join(AVAHI_CONF_DIR, 'avahi-daemon.conf'),
                config,
                'utf8'
            );
            
            // Step 4: Copy service file
            fs.copySync(
                CONFIG_FILES['fabmo.service'].source,
                CONFIG_FILES['fabmo.service'].target
            );
            
            // Step 5: Restart Avahi daemon
            try {
                exec('systemctl restart avahi-daemon.service', {stdio: 'inherit'});
                log.info('Avahi daemon restarted with hostname: ' + hostname);
                log.info('Tool accessible at: http://' + hostname + '.local');
            } catch (err) {
                log.error('Failed to restart avahi-daemon: ' + err.message);
            }
            
            resolve({ requiresReboot: false });
        });
    });
}

function generateAvahiConfig(hostname) {
    return `# Avahi daemon configuration for FabMo
# Dynamically generated with unique hostname

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
```

### Image Builder Changes

**`/fabmo_image_builder/build-fabmo-image.sh`:**

The current static config copy would need to become dynamic:

```bash
# OLD (static file copy):
install_file "$RESOURCE_DIR/avahi/avahi-daemon.conf" "/etc/avahi/avahi-daemon.conf"

# NEW (generate during image build):
# Get unique ID during image build and generate config
# OR: Leave static in image, let patch customize on first boot
```

**Recommendation:** Keep the image builder simple (static "fabmo" hostname), let the **patch** customize on first boot when the actual hardware ID is available.

---

## User Communication Strategy

### Dashboard Display

Update `/fabmo-updater/static/index.html` to show the mDNS hostname:

```html
<tr>
  <td class="info-key">mDNS Address:</td>
  <td class="cell-value">
    <span class="info-value">
      <a href="http://fabmo-a1b2c3d4.local" target="_blank">
        fabmo-a1b2c3d4.local
      </a>
    </span>
  </td>
</tr>
```

### Documentation Updates

Update user documentation to explain:
- **Single tool**: Use `fabmo-<id>.local` or just `fabmo.local`
- **Multiple tools**: Must use specific `fabmo-<id>.local` for each tool
- **Finding your ID**: Check AP name, dashboard, or sticker on device

---

## Testing Strategy

### Test Case 1: Single Tool on LAN
```bash
# Should resolve to tool's IP
avahi-resolve -n fabmo-a1b2c3d4.local
ping fabmo-a1b2c3d4.local
curl http://fabmo-a1b2c3d4.local
```

### Test Case 2: Two Tools on Same LAN
```bash
# Both should resolve to different IPs
avahi-resolve -n fabmo-a1b2c3d4.local  # → 192.168.1.50
avahi-resolve -n fabmo-e5f6g7h8.local  # → 192.168.1.51

# Both should be accessible
curl http://fabmo-a1b2c3d4.local  # → Tool 1 dashboard
curl http://fabmo-e5f6g7h8.local  # → Tool 2 dashboard
```

### Test Case 3: Direct Ethernet
```bash
# Should work on link-local
ping fabmo-a1b2c3d4.local  # → 192.168.44.1 or 169.254.x.x
```

### Test Case 4: Tool as AP
```bash
# Client connects to FabMo-A1B2C3D4 WiFi
ping fabmo-a1b2c3d4.local  # → 192.168.42.1
```

---

## Backward Compatibility

### For Existing Users

**Old bookmarks** like `http://fabmo.local` will:
- ❌ Stop working after patch applies (hostname changed)
- ✅ Dashboard still accessible via direct IP
- ✅ AP SSID still shows IP address

**Migration path:**
1. User updates via FMP package
2. Patch applies and sets unique hostname
3. Dashboard shows new mDNS address prominently
4. User updates bookmarks to new address

### Gradual Rollout

**Phase 1**: Keep hardcoded "fabmo" (current state)
- ✅ Works for single-tool setups
- ❌ Breaks for multi-tool setups

**Phase 2**: Add unique hostname (proposed enhancement)
- ✅ Works for single-tool setups
- ✅ Works for multi-tool setups
- ⚠️ Requires bookmark updates

**Phase 3**: Add user-customizable hostname (future)
- ✅ Users can set friendly names: "shopbot-table-saw.local"
- Stored in config, applied by patch

---

## Summary: Answering Your Questions

### Q1: In what connection arrangements would we expect to be able to use fabmo.local?

**Answer:**
- ✅ **Direct ethernet** (link-local or static)
- ✅ **Same LAN/WiFi** (same subnet)
- ✅ **Tool as AP** (client connected to tool's hotspot)
- ❌ **Across routers** (different subnets)
- ❌ **VPN/remote** (unless mDNS reflector configured)
- ❌ **Corporate networks** (often block mDNS)

### Q2: Will fabmo.local conflict with regular IP availability?

**Answer:**
- ✅ **No conflict** - they coexist peacefully
- Both `fabmo.local` and `192.168.42.1` work simultaneously
- mDNS provides convenience; direct IP provides reliability
- SSID IP broadcasting still useful as backup

### Q3: Do we have a method for using fabmo.local when there are multiple FabMo servers?

**Answer:**
- ❌ **Not currently** - all tools broadcast as "fabmo.local" (collision)
- ✅ **Proposed solution** - Use unique hostnames: `fabmo-<machine-id>.local`
- ✅ **Infrastructure exists** - getUniqueID() already implemented
- 🔧 **Implementation needed** - Modify patch 003 to use dynamic hostnames

---

## Next Steps

1. **Decide on approach**: Unique hostnames vs. keeping "fabmo" for single-tool legacy
2. **Implement dynamic hostname** in patch 003
3. **Update dashboard** to display mDNS hostname
4. **Test with multiple tools** on same network
5. **Update user documentation** with multi-tool guidance
6. **Consider Phase 3** user-customizable hostnames for future enhancement
