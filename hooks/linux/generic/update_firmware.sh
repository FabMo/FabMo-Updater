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

#echo "Putting G2 in firmware-reloadable state..."
#stty -F /dev/ttyACM0 1200
#sleep 1
echo "Flashing/verifying $1..."
bossac -w -v $1
echo "Setting the boot flag and rbooting G2..."
bossac -b
bossac -R

if [ $ENGINE_RUNNING ]
then
	echo "Restarting the engine..."
	systemctl start fabmo
fi
