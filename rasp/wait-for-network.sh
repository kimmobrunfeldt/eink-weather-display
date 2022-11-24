#!/bin/bash

# How many times to check for connection
MAX_CHECKS=10

for i in $(seq 1 $MAX_CHECKS)
do
  # Check for network. If connection succeeds, exit the loop
  nc -z -w 5 1.1.1.1 53 && exit 0
  echo "No connection on attempt $i"

  if [ "$i" -ne "$MAX_CHECKS" ]; then
    # Sleep only between attempts
    sleep 3
  fi
done

exit 1
