#!/bin/bash -x

systemctl stop fabmo
mount /dev/mmcblk0p1 /mnt
cd /mnt/fabmo/engine
git fetch origin
git checkout $1
npm install
rm -rf /opt/fabmo/approot
cd /
umount /mnt
systemctl start fabmo
