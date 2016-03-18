#!/bin/sh

echo "Setting time to $1"
timedatectl set-ntp false
timedatectl set-time $1
timedatectl set-ntp true