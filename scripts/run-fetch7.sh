#!/bin/sh
# Lanza el descargador Openverse dentro del contenedor node (misma red que la app)
cd /app || exit 1
node scripts/fetch-images7.mjs "$@" 2>&1 | tail -70
