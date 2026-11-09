// Séptima pasada: Openverse (fotos CC de Flickr etc.) — fotos reales de gimnasio.
// 2 candidatos por ejercicio (slug__a / slug__b) para elegir a mano.
// Uso:  node fetch-images7.mjs [slug slug ...]   (sin args = todos)
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });
const UA = 'GymLogApp/2.0 (personal fitness app; contact: local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [slug, [categorías Commons (se omiten aquí)], [términos Openverse a probar en orden]]
const LIST = [
  ['bench-press', ['barbell bench press flat', 'bench press exercise']],
  ['bench-press-incline-barbell', ['incline barbell bench press', 'incline bench press exercise']],
  ['bench-press-incline-dumbbell', ['incline dumbbell press', 'dumbbell incline bench press']],
  ['dumbbell-fly', ['dumbbell fly chest', 'dumbbell flyes exercise']],
  ['cable-cross', ['cable crossover chest', 'cable crossover machine']],
  ['pec-deck', ['pec deck machine', 'pec deck chest exercise']],
  ['dips', ['dip bars parallel', 'dips exercise parallel bars']],
  ['pull-ups', ['pull up bar exercise', 'pull ups bodyweight']],
  ['lat-pulldown', ['lat pulldown machine', 'lat pulldown wide grip']],
  ['lat-pulldown-closed', ['closed grip lat pulldown', 'lat pulldown machine']],
  ['barbell-row', ['bent over barbell row', 'barbell row back exercise']],
  ['seated-cable-row', ['seated cable row machine', 'cable row machine back']],
  ['one-arm-dumbbell-row', ['one arm dumbbell row', 'dumbbell row bent over']],
  ['face-pull', ['face pull rope', 'face pull cable exercise']],
  ['pullover', ['dumbbell pullover bench', 'chest pullover exercise']],
  ['back-extension', ['back extension hyperextension', 'back extension bench exercise']],
  ['squat', ['barbell back squat', 'squat barbell exercise']],
  ['front-squat', ['front squat barbell', 'front squat exercise']],
  ['bulgarian-split-squat', ['bulgarian split squat', 'split squat dumbbell step']],
  ['leg-press', ['leg press machine', 'leg press gym']],
  ['deadlift', ['barbell deadlift', 'deadlift exercise']],
  ['rdl', ['romanian deadlift', 'rdl barbell hamstrings']],
  ['lunges', ['lunge exercise dumbbell', 'walking lunge gym']],
  ['leg-extension', ['leg extension machine', 'leg extension quadriceps']],
  ['leg-curl', ['leg curl machine', 'seated leg curl hamstring']],
  ['standing-calf-raise', ['standing calf raise machine', 'calf raise machine gym']],
  ['seated-calf-raise', ['seated calf raise machine', 'calf raise machine']],
  ['military-press', ['overhead press barbell standing', 'military press barbell']],
  ['arnold-press', ['arnold press dumbbell', 'dumbbell shoulder press exercise']],
  ['shoulder-machine', ['shoulder press machine', 'military press machine gym']],
  ['lateral-raise', ['dumbbell lateral raise', 'lateral raise standing']],
  ['front-raise', ['dumbbell front raise', 'front raise shoulder exercise']],
  ['barbell-curl', ['barbell biceps curl', 'barbell curl standing']],
  ['dumbbell-curl', ['dumbbell biceps curl', 'dumbbell curl exercise']],
  ['hammer-curl', ['hammer curl dumbbell', 'hammer curl neutral grip']],
  ['cable-curl', ['cable biceps curl', 'cable curl low pulley']],
  ['concentration-curl', ['concentration curl dumbbell', 'concentration curl seated']],
  ['tricep-pushdown', ['triceps pushdown rope', 'triceps pushdown cable machine']],
  ['french-press', ['skull crusher barbell', 'french press barbell triceps']],
  ['overhead-dumbbell-extension', ['overhead dumbbell triceps extension', 'triceps extension overhead dumbbell']],
  ['tricep-machine', ['triceps push machine', 'tricep machine gym']],
  ['plank', ['plank pose exercise', 'front plank fitness']],
  ['side-plank', ['side plank exercise', 'side bridge plank']],
  ['cable-crunch', ['cable crunch abs', 'cable crunch machine kneeling']],
  ['hanging-leg-raise', ['hanging leg raise pull up bar', 'hanging knee raise abs']],
  ['russian-twist', ['russian twist abs', 'russian twist exercise seated']],
];

const ONLY = process.argv.slice(2);
let ok = 0, fail = 0;
for (const [slug, terms] of LIST) {
  if (ONLY.length && !ONLY.includes(slug)) continue;
  let cands = [];
  for (const t of terms) {
    try {
      const res = await fetch(
        'https://api.openverse.org/v1/images/?page_size=8&' + new URLSearchParams({ q: t }),
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      for (const r of j.results || []) {
        if ((r.width || 0) >= 350 && (r.height || 0) >= 250 && r.url) cands.push(r);
        if (cands.length >= 6) break;
      }
      if (cands.length >= 2) break;
    } catch (e) {
      console.log('ERR', slug, t, e.message);
      break; // 429 u otro fallo: no seguir machacando el término
    }
    await sleep(2000);
  }
  cands = cands.slice(0, 2);
  let n = 0;
  for (const [k, c] of cands.entries()) {
    try {
      // Thumbnails si la original es enorme (el tamaño objetivo es ~500-1200 px)
      const src = ((c.width || 0) > 1800 && c.thumbnail) ? c.thumbnail : c.url;
      const buf = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
      if (buf.length > 1500) {
        fs.writeFileSync(path.join(OUT_DIR, `${slug}__${'ab'[k]}.jpg`), buf);
        console.log('CAND', slug, 'ab'[k], '<-', (c.creator || '?'), `${Math.round(buf.length / 1024)}KB`);
        n++;
      }
    } catch (e) { console.log('ERR dl', slug, e.message); }
  }
  if (n) ok++; else { fail++; console.log('FAIL', slug); }
  await sleep(6000);
}
console.log(`\nHecho: ${ok} con candidato(s), ${fail} sin candidato`);
