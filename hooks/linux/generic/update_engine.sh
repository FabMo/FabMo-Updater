#!/bin/bash

systemctl stop fabmo
cd /fabmo/engine
git fetch origin --tags
git checkout master
git pull
git checkout $1
npm install --production
rm -rf /opt/fabmo/approot
systemctl start fabmo
