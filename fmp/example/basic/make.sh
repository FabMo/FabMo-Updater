#!/bin/sh
echo "Creating FMP Archive..."
tar -cvzf example.fmp engine.tar.gz manifest.json
echo "Copying FMP to static for testing..."
cp example.fmp ../../static
