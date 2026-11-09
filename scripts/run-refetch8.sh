#!/bin/sh
# Re-baja los 8 slugs que fallaron (504) en la pasada Openverse completa
MSYS_NO_PATHCONV=1 docker run --rm -v /d/gym:/app -w /app node:20-slim node scripts/fetch-images7.mjs \
  cable-cross face-pull bulgarian-split-squat lateral-raise \
  cable-curl tricep-machine cable-crunch russian-twist 2>&1 | tail -40
