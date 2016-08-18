#!/bin/sh
set -e

echo "Putting G2 in firmware-reloadable state..."
stty -f /dev/cu.usbmodem1421 1200
sleep 1

echo "Flashing/verifying $1..."
bossac -w -v $1
echo "Setting the boot flag and rbooting G2..."
bossac -b 
bossac -R 
