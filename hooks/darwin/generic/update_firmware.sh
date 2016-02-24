#!/bin/sh
set -e

echo "Flashing/verifying $1..."
bossac -w -v $1
echo "Setting the boot flag and rbooting G2..."
bossac -b 
bossac -R 
