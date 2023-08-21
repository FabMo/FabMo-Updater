#!/bin/sh
set -e
echo "Re-Starting FabMo using hijacked factory reset on RPI platform."
echo "Trying a Restart! ... >"
systemctl restart fabmo
#sleep 10
#echo "Trying an Updater Restart ...>"
#systemctl restart fabmo-updater

exit 1
