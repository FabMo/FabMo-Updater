#!/bin/sh
set -e
#setserial /dev/ttyACM0 baud_base 115200
#setserial /dev/ttyACM0 divisor 12
#touch /dev/ttyACM0
stty -F /dev/ttyACM0 1200
sleep 1
bossac -w -v $1
bossac -b
bossac -R
sleep 1
