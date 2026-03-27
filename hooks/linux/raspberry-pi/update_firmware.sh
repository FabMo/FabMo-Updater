#!/usr/bin/env bash
set -u

# Firmware update script for Raspberry Pi
# Aligned with FabMo Engine firmware loading approach.
# Tries multiple ports to handle VFD or other devices claiming ttyACM0.
#
# Usage: update_firmware.sh <path-to-firmware.bin>

BIN="$1"
PORTS=(/dev/fabmo_g2_motion /dev/ttyACM0 /dev/ttyACM1 /dev/ttyACM2)
PER_PORT_SECONDS="${PER_PORT_SECONDS:-5}"
POLL_INTERVAL="${POLL_INTERVAL:-0.5}"

# Step 1: Stop engine if running
if systemctl status fabmo 2>/dev/null | grep -q "Active: active"; then
    echo "Stopping the engine..."
    systemctl stop fabmo
    ENGINE_RUNNING=true
else
    echo "Engine is already stopped."
    ENGINE_RUNNING=false
fi

# Step 2: Trigger bootloader entry via 1200-baud touch
if [[ -e /dev/fabmo_g2_motion ]]; then
    echo "Device found at /dev/fabmo_g2_motion — triggering bootloader ..."
    stty -F /dev/fabmo_g2_motion 1200 2>/dev/null || true
elif [[ -e /dev/ttyACM0 ]]; then
    echo "Triggering bootloader via /dev/ttyACM0 ..."
    stty -F /dev/ttyACM0 1200 2>/dev/null || true
else
    echo "Warning: No G2 device found for bootloader trigger, proceeding anyway..."
fi

# Wait for USB re-enumeration into SAM-BA mode
echo "Waiting for bootloader mode..."
sleep 3

# Kill any stale bossac processes
killall bossac 2>/dev/null || true

# Step 3: Try each port in sequence until bossac succeeds
for port in "${PORTS[@]}"; do
    echo "Trying $port"
    deadline=$((SECONDS + PER_PORT_SECONDS))

    while (( SECONDS < deadline )); do
        if [[ -e "$port" ]]; then
            if bossac -e -w -v --port="$port" "$BIN"; then
                echo "Success on $port"
                sleep 2
                bossac -b --port="$port"
                sleep 2
                bossac -R --port="$port"
                echo "Firmware loaded."

                if [[ "$ENGINE_RUNNING" = true ]]; then
                    echo "Restarting FabMo..."
                    systemctl start fabmo
                fi
                exit 0
            fi
        fi
        sleep "$POLL_INTERVAL"
    done
done

echo "ERROR: bossac could not find a usable device at fabmo_g2_motion or on ttyACM0..2" >&2

if [[ "$ENGINE_RUNNING" = true ]]; then
    echo "Restarting FabMo ..."
    systemctl start fabmo
fi
exit 1
