#!/usr/bin/env bash

set -xe

cd /opt/app/machinery
new_hash=$(curl https://billwurtz.com/questions/questions.html | sha256sum)
if [ ! -f lasthash ] || [ "$new_hash" != "$(cat lasthash)" ]; then

  echo "page need update"
  echo -n "$new_hash" > lasthash
  node script.js
else
  echo "don't need update"
fi

