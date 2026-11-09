#!/bin/sh
# Copia la candidata elegida a <slug>.jpg y borra todos los __a/__b/__c
cd /d/gym/public/images || exit 1
copy() {
  if [ -f "$1" ]; then cp "$1" "$2" && echo "OK $2 <- $1"; else echo "FALTA $1"; fi
}
copy bench-press__b.jpg                    bench-press.jpg
copy bench-press-incline-dumbbell__b.jpg   bench-press-incline-dumbbell.jpg
copy pec-deck__a.jpg                       pec-deck.jpg
copy dips__b.jpg                           dips.jpg
copy squat__a.jpg                          squat.jpg
copy plank__b.jpg                          plank.jpg
copy hanging-leg-raise__a.jpg              hanging-leg-raise.jpg
copy lateral-raise__b.jpg                  lateral-raise.jpg
copy cable-cross__a.jpg                    cable-cross.jpg
copy bulgarian-split-squat__b.jpg          bulgarian-split-squat.jpg
copy cable-curl__a.jpg                     cable-curl.jpg
copy russian-twist__a.jpg                  russian-twist.jpg
copy face-pull__a.jpg                      face-pull.jpg
copy cable-crunch__a.jpg                   cable-crunch.jpg
# tricep-machine: se conserva la foto actual (persona real en máquina)
rm -f *__a.jpg *__b.jpg *__c.jpg
echo "Limpiados los candidatos"
