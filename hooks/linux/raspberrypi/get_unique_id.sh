#!/bin/bash

NEW_UUID=$(cat /dev/urandom | LC_CTYPE=C tr -dc 'a-f0-9' | dd count=8 bs=1 2>/dev/null)
FACTORY_ID=$(cat /factory/serial_number 2>/dev/null)

if [[ $FACTORY_ID != *[!\ ]* ]]; then
  FACTORY_ID=$NEW_UUID
fi

echo $FACTORY_ID