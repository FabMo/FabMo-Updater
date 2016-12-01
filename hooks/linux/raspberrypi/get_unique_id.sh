#!/bin/bash

cat /proc/cpuinfo | grep Serial | awk ' {print $3}'
