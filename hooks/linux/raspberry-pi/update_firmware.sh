#!/bin/sh
set -e
if systemctl status fabmo | grep -q "Active: active"
then
	echo "Stopping the engine..."
	systemctl stop fabmo
	ENGINE_RUNNING=true
else
	echo "Engine is already stopped."
	ENGINE_RUNNING=false
fi

echo "Putting G2 in firmware-reloadable state..."
stty -F /dev/ttyACM0 1200

# Wait for the device to disconnect and reconnect in bootloader mode
echo "Waiting for bootloader mode..."
BOOTLOADER_TIMEOUT=30
BOOTLOADER_FOUND=false

for i in $(seq 1 $BOOTLOADER_TIMEOUT); do
    # Check if the device has disconnected (normal operation port gone)
    if ! ls /dev/ttyACM0 >/dev/null 2>&1; then
        echo "Device disconnected, waiting for bootloader..."
        # Wait a bit more for bootloader to appear
        sleep 2
        
        # Look for bootloader device (usually appears as different device)
        # SAM3X8E bootloader typically appears as a different USB device
        if ls /dev/ttyACM* >/dev/null 2>&1 || lsusb | grep -q "03eb:"; then
            echo "Bootloader detected after ${i} seconds"
            BOOTLOADER_FOUND=true
            break
        fi
    fi
    sleep 1
done

if [ "$BOOTLOADER_FOUND" = false ]; then
    echo "Warning: Bootloader detection timeout, proceeding anyway..."
fi

# Additional safety: ensure any previous bossac processes are terminated
killall bossac 2>/dev/null || true

echo "Flashing/verifying $1..."
# Use more reliable bossac options with retries
FLASH_ATTEMPTS=3
FLASH_SUCCESS=false

for attempt in $(seq 1 $FLASH_ATTEMPTS); do
    echo "Flash attempt $attempt of $FLASH_ATTEMPTS..."
    if bossac -p ttyACM0 -e -w -v -b $1; then
        FLASH_SUCCESS=true
        break
    else
        echo "Flash attempt $attempt failed, retrying..."
        sleep 2
    fi
done

if [ "$FLASH_SUCCESS" = false ]; then
    echo "ERROR: All flash attempts failed!"
    exit 1
fi

echo "Setting the boot flag and rbooting G2..."
bossac -b
bossac -R

if [ $ENGINE_RUNNING ]
then
	echo "Restarting the engine..."
	systemctl start fabmo
fi
