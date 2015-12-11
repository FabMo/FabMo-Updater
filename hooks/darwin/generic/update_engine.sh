#!/bin/bash -x

cd /Users/ryansturmer/projects/fering/shopbot/FabMo-Engine
git fetch origin
echo "UPDATING TO VERSION: $1"
git checkout $1
npm install
rm -rf /opt/fabmo/approot
