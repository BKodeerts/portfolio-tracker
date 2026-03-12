#!/bin/sh
mkdir -p /data/cache
export DATA_DIR=/data
export CACHE_DIR=/data/cache
exec node /app/server.js
