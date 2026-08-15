# Update Checker UX Fix - Eliminates Confusing "No Update" Flash

## Date: 2026-08-15

## Problem Description

Users reported a confusing UI behavior when the updater checked for updates:

**Previous Behavior:**
1. Updater loads → Shows "Checking for updates..." (good)
2. Message quickly disappears → Shows "**No updates available**" (premature!)
3. A moment later → Shows green "**Update available**" (confusing!)

This back-and-forth was disconcerting because the system prematurely declared "no updates" before the check actually completed.

## Root Cause

**Timing Issue in Update Check Flow:**

1. `checkForUpdates()` sends HTTP POST to `/update/check`
2. Server accepts request and starts checking (returns immediately)
3. **Callback fired when HTTP completes** → Showed "no updates" ❌
4. **Status event arrives later via WebSocket** → Shows actual results ✓

The callback executed when the server *accepted* the check request, not when the check *completed*. This caused the premature "no updates available" message.

## Solution Implemented

Added a **2-second delay** after the HTTP request completes before declaring "no updates available". This gives the WebSocket status event time to arrive with actual update information.

### Code Changes

**File:** `/fabmo-updater/static/js/main.js`

**Changed locations:**
1. **Page load auto-check** (around line 962)
2. **Manual "Check for Updates" button** (around line 1183)

**New logic:**
```javascript
updater.checkForUpdates(function() {
  // HTTP request completed - check was initiated
  // Wait 2 seconds for status event to arrive before declaring "no updates"
  setTimeout(function() {
    if (checkInProgress) {
      // Status event hasn't shown updates - safe to show "no updates"
      checkInProgress = false;
      $('#message-noupdates').html('There are no new software updates available...').removeClass('hide');
      // Reset UI elements...
    }
  }, 2000); // 2 second grace period
});
```

**How it works:**
- ✅ If updates found → Status event arrives quickly, sets `checkInProgress = false`, shows green message
- ✅ If no updates → Timeout fires after 2 seconds, shows "no updates" message
- ✅ Eliminates premature "no updates" flash

## User Experience Improvements

### Before Fix
```
[Updater loads]
↓
"Checking for updates..." (0.5s)
↓
"No updates available" ❌ (1s)
↓
"Update to v2.5.0 available!" ✓
   ^ Confusing!
```

### After Fix
```
[Updater loads]
↓
"Checking for updates..." (2-3s)
↓
EITHER:
  → "Update to v2.5.0 available!" ✓ (if found)
  OR
  → "No updates available" ✓ (if none)
   ^ Clear and accurate!
```

## Testing

**Test Case 1: Updates Available**
1. Start updater
2. "Checking for updates..." appears with spinner
3. Green "Update available" message appears within 2-3 seconds
4. ✅ No "no updates" flash

**Test Case 2: No Updates Available**
1. Start updater  
2. "Checking for updates..." appears with spinner
3. After 2 seconds, "No updates available" appears
4. ✅ Message persists (no flip-flopping)

**Test Case 3: Manual Check Button**
1. Click "Check for Updates" button
2. Same behavior as page load
3. ✅ Consistent UX

## Why 2 Seconds?

The delay balances:
- **Too short (< 1s)**: May still show "no updates" before status event arrives
- **Too long (> 3s)**: Users wait unnecessarily when no updates exist
- **2 seconds**: Enough time for status event (typically arrives in 500ms-1s) while still feeling responsive

## Technical Details

**Status Event Flow:**
- Updater server emits status events periodically via WebSocket
- Events include `status.updates` array with available updates
- `checkInProgress` flag coordinates between callback and status event
- Status event is **authoritative source** for update availability

**checkInProgress Flag:**
- Set to `true` when check starts
- Set to `false` when updates found (status event) OR timeout expires (callback)
- Prevents status events from showing "no updates" while check is active
- Prevents callback from showing "no updates" if status event already handled it

## Backward Compatibility

✅ **Fully compatible** - no breaking changes:
- Same HTTP endpoints
- Same WebSocket events
- Same server-side logic
- Only UI timing adjusted

## Related Files

- **Main logic**: `/fabmo-updater/static/js/main.js`
- **API client**: `/fabmo-updater/static/js/libs/updaterapi.js`
- **Backend route**: `/fabmo-updater/routes/update.js`
- **UI template**: `/fabmo-updater/static/index.html`

## Future Enhancements (Optional)

If 2 seconds still feels too long, consider:
1. **Shorter delay (1.5s)** if status events consistently arrive faster
2. **Progress indication** - show "Still checking..." if no result after 2s
3. **Server-side optimization** - make `runAllPackageChecks()` faster

For now, the 2-second delay provides a good balance between accuracy and responsiveness.
