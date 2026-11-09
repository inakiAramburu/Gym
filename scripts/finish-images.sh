#!/bin/sh
# Aplica las selecciones, reconstruye el contenedor y hace spot-check de imágenes
cd /d/gym || exit 1
echo "== Aplicando selecciones =="
sh scripts/apply-selections.sh
echo "== Rebuild docker =="
docker compose up -d --build
echo "== Spot check (esperando arranque) =="
sleep 6
for s in bench-press dips squat lateral-raise cable-cross bulgarian-split-squat cable-curl russian-twist face-pull cable-crunch tricep-machine hanging-leg-raise pec-deck plank; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/images/$s.jpg")
  echo "$s.jpg -> $code"
done
echo "Fin"
