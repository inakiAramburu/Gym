// Descarga una imagen por ejercicio desde Wikimedia Commons (480px).
// Uso: node scripts/fetch-images.mjs   (crea public/images/<slug>.jpg)
import fs from 'node:fs';
import path from 'node:path';

// [slug, término de búsqueda en Commons]
const LIST = [
  // Pecho
  ['bench-press', 'bench press barbell exercise'],
  ['bench-press-incline-barbell', 'incline bench press barbell'],
  ['bench-press-incline-dumbbell', 'incline dumbbell press'],
  ['dumbbell-fly', 'dumbbell fly chest'],
  ['cable-cross', 'cable fly chest cross'],
  ['pec-deck', 'pec deck machine fly'],
  ['dips', 'dips parallel bars bodyweight'],
  // Espalda
  ['pull-ups', 'pull ups bar exercise'],
  ['lat-pulldown', 'lat pulldown machine'],
  ['lat-pulldown-closed', 'lat pulldown close grip'],
  ['barbell-row', 'barbell row bent over'],
  ['seated-cable-row', 'seated cable row machine'],
  ['one-arm-dumbbell-row', 'dumbbell row one arm bent over'],
  ['face-pull', 'face pull cable'],
  ['pullover', 'chest pullover dumbbell'],
  ['back-extension', 'back extension hyperextension'],
  // Piernas
  ['squat', 'barbell squat exercise'],
  ['front-squat', 'front squat barbell'],
  ['bulgarian-split-squat', 'bulgarian split squat dumbbell'],
  ['leg-press', 'leg press machine'],
  ['deadlift', 'deadlift barbell'],
  ['rdl', 'romanian deadlift dumbbell'],
  ['lunges', 'lunge dumbbell exercise'],
  ['leg-extension', 'leg extension machine quadriceps'],
  ['leg-curl', 'seated leg curl machine'],
  ['standing-calf-raise', 'standing calf raise machine'],
  ['seated-calf-raise', 'seated calf raise'],
  // Hombros
  ['military-press', 'overhead press barbell military'],
  ['arnold-press', 'arnold press dumbbell'],
  ['shoulder-machine', 'shoulder press machine'],
  ['lateral-raise', 'dumbbell lateral raise side raise'],
  ['front-raise', 'dumbbell front raise'],
  // Bíceps
  ['barbell-curl', 'barbell curl biceps'],
  ['dumbbell-curl', 'dumbbell curl biceps'],
  ['hammer-curl', 'hammer curl dumbbell'],
  ['cable-curl', 'cable curl biceps'],
  ['concentration-curl', 'concentration curl biceps'],
  // Tríceps
  ['tricep-pushdown', 'tricep pushdown cable rope'],
  ['french-press', 'french press barbell lying'],
  ['overhead-dumbbell-extension', 'overhead dumbbell triceps extension'],
  ['tricep-machine', 'tricep extension machine'],
  // Core
  ['plank', 'plank pose exercise'],
  ['side-plank', 'side plank exercise'],
  ['cable-crunch', 'cable crunch abs'],
  ['hanging-leg-raise', 'hanging leg raise abs'],
  ['russian-twist', 'russian twist abs'],
];

const UA = 'GymLogApp/1.0 (personal fitness app; https://localhost) node-fetch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function searchFiles(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=search&srnamespace=6&srlimit=8&srsearch=${encodeURIComponent('filetype:bitmap ' + term)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  return (j.query && j.query.search ? j.query.search : []).map((s) => s.title);
}

async function fileInfo(fileTitle) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&prop=imageinfo&iiprop=url|mime&iiurlwidth=480&titles=${encodeURIComponent(fileTitle)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  const pages = Object.values((j.query && j.query.pages) || {});
  return (pages[0] && pages[0].imageinfo && pages[0].imageinfo[0]) || null;
}

let ok = 0, fail = 0;
for (const [slug, term] of LIST) {
  const out = path.join(OUT_DIR, slug + '.jpg');
  if (fs.existsSync(out) && fs.statSync(out).size > 2000) {
    console.log('skip', slug);
    ok++;
    continue;
  }
  let done = false;
  try {
    const titles = await searchFiles(term);
    for (const t of titles) {
      if (t.toLowerCase().includes('/svg')) continue;
      const ii = await fileInfo(t);
      if (ii && ii.thumburl && (ii.mime || '').startsWith('image/')) {
        const buf = Buffer.from(await (await fetch(ii.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer());
        if (buf.length > 2000) {
          fs.writeFileSync(out, buf);
          console.log('OK  ', slug, '<-', t, `(${Math.round(buf.length / 1024)} KB)`);
          done = true;
          break;
        }
      }
    }
  } catch (e) {
    console.log('ERR ', slug, e.message);
  }
  if (!done) {
    console.log('FAIL', slug, term);
    fail++;
  } else ok++;
  await sleep(400);
}
console.log(`\nHecho: ${ok} imágenes descargadas, ${fail} sin imagen`);
