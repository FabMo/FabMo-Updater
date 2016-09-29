#!/bin/sh
cd src
tar -cvjf ../engine.tar.bz engine.*
cd ..
tar -cvzf example.fmp engine.tar.bz manifest.json
