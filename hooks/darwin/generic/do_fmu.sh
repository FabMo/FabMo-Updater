#!/bin/sh

cd /tmp

echo "Creating fmu directory..."
rm -rf ./fmu
mkdir ./fmu

echo "Entering fmu directory..."
cd ./fmu

echo "Unpacking FMU: $1"
gunzip < $1 | tar -xvf -

echo "Applying update..."
/bin/sh ./install