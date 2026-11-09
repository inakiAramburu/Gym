// Sexta pasada: categorías de Commons (mucho más fiables que la búsqueda)
// + respaldo por búsqueda. Descarga 2 candidatos por ejercicio (slug__a / slug__b)
// y luego se elige a mano cuál es correcto.
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });
const UA = 'GymLogApp/2.0 (personal fitness app) node-fetch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [slug, [categorías a probar en orden], [términos de búsqueda de respaldo]]
const LIST = [
  ['bench-press', ['Bench press'], ['barbell bench press flat exercise']],
  ['bench-press-incline-barbell', ['Incline bench press'], ['incline barbell bench press']],
  ['bench-press-incline-dumbbell', ['Incline dumbbell press', 'Incline bench press'], ['incline dumbbell press chest']],
  ['dumbbell-fly', ['Flyes (exercise)'], ['dumbbell fly chest exercise']],
  ['cable-cross', ['Cable crossover'], ['cable crossover machine chest']],
  ['pec-deck', ['Peck deck'], ['pec deck machine chest press']],
  ['dips', ['Dips (exercise)'], ['parallel bars dips bodyweight']],
  ['pull-ups', ['Pull-ups'], ['pull up bar bodyweight exercise']],
  ['lat-pulldown', ['Lat pulldown'], ['lat pulldown machine wide grip']],
  ['lat-pulldown-closed', ['Lat pulldown'], ['closed grip lat pulldown machine']],
  ['barbell-row', ['Barbell row'], ['bent over barbell row back']],
  ['seated-cable-row', ['Seated row'], ['seated cable row machine back']],
  ['one-arm-dumbbell-row', ['Dumbbell row'], ['bent over dumbbell row back']],
  ['face-pull', ['Face pull'], ['face pull rope cable rear delt']],
  ['pullover', ['Pullover (exercise)'], ['chest pullover dumbbell bench']],
  ['back-extension', ['Back extension'], ['hyperextension back exercise bench']],
  ['squat', ['Squats', 'Squat (exercise)'], ['barbell back squat exercise']],
  ['front-squat', ['Front squat'], ['front squat barbell shoulders']],
  ['bulgarian-split-squat', ['Bulgarian split squat', 'Split squat'], ['bulgarian squat dumbbell step']],
  ['leg-press', ['Leg press'], ['leg press machine gym']],
  ['deadlift', ['Deadlift'], ['barbell deadlift powerlifting']],
  ['rdl', ['Romanian deadlift'], ['romanian deadlift barbell hamstrings']],
  ['lunges', ['Lunge (exercise)', 'Lunges'], ['dumbbell lunge exercise']],
  ['leg-extension', ['Leg extension'], ['leg extension machine quadriceps']],
  ['leg-curl', ['Leg curl'], ['seated leg curl machine hamstring']],
  ['standing-calf-raise', ['Calf raise'], ['standing calf raise machine']],
  ['seated-calf-raise', ['Calf raise'], ['seated calf raise machine']],
  ['military-press', ['Overhead press'], ['barbell overhead press standing']],
  ['arnold-press', ['Arnold press', 'Overhead press'], ['arnold press dumbbell shoulder']],
  ['shoulder-machine', ['Shoulder press machine', 'Overhead press machine'], ['shoulder press machine gym']],
  ['lateral-raise', ['Lateral raise'], ['dumbbell lateral raise standing']],
  ['front-raise', ['Front raise'], ['dumbbell front raise shoulder']],
  ['barbell-curl', ['Barbell curl'], ['barbell biceps curl standing']],
  ['dumbbell-curl', ['Bicep curl'], ['dumbbell biceps curl standing']],
  ['hammer-curl', ['Hammer curl'], ['hammer curl dumbbell neutral grip']],
  ['cable-curl', ['Bicep curl'], ['cable biceps curl low pulley']],
  ['concentration-curl', ['Bicep curl'], ['concentration curl seated dumbbell']],
  ['tricep-pushdown', ['Triceps pushdown', 'Pushdown (exercise)'], ['triceps pushdown rope cable']],
  ['french-press', ['French press (exercise)'], ['french press barbell skull crusher']],
  ['overhead-dumbbell-extension', ['Triceps extension'], ['overhead dumbbell triceps extension bench']],
  ['tricep-machine', ['Triceps extension machine'], ['tricep push machine cable']],
  ['plank', ['Plank (exercise)'], ['front plank core exercise']],
  ['side-plank', ['Plank (exercise)'], ['side plank side bridge exercise']],
  ['cable-crunch', ['Crunch (exercise)'], ['cable crunch machine abs kneeling']],
  ['hanging-leg-raise', ['Hanging leg raise', 'Leg raise'], ['hanging knee raise pull up bar abs']],
  ['russian-twist', ['Russian twist'], ['russian twist abs exercise seated']],
];

const BAD = [
  'svg', 'logo', 'chart', 'diagram', 'icon', 'flag', 'map ', 'painting',
  'anatom', 'skeleton', 'vintage', '18th', '19th', 'historical', 'museum',
  'uniform', 'bowl', 'vessel', 'palindrom', 'automaton', 'portrait',
  'machine gun', 'figure', 'fig.', 'photo of', 'poster', 'card',
];

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function catFiles(catName) {
  const j = await get(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=categorymembers&cmtype=bitmap&cmlimit=40&cmtitle=${encodeURIComponent('Category:' + catName)}`);
  return ((j.query || {}).categorymembers || []).map((m) => m.title);
}

async function searchFiles(term) {
  const j = await get(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent('filetype:bitmap ' + term)}`);
  return ((j.query || {}).search || []).map((s) => s.title);
}

async function fileInfos(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 12) {
    const chunk = titles.slice(i, i + 12);
    const j = await get(
      'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=480&titles=${encodeURIComponent(chunk.join('|'))}`);
    for (const p of Object.values((j.query || {}).pages || {})) {
      const ii = (p.imageinfo || [])[0];
      if (ii && ii.thumburl && (ii.mime || '').startsWith('image/') && (ii.width || 0) >= 400)
        out.push({ title: p.title, ii });
    }
  }
  return out;
}

const ONLY = process.argv.slice(2);
let ok = 0, fail = 0;
for (const [slug, cats, terms] of LIST) {
  if (ONLY.length && !ONLY.includes(slug)) continue;
  let cands = [];
  for (const c of cats) {
    try {
      const titles = (await catFiles(c))
        .filter((t) => /\.(jpe?g|png)$/i.test(t) && !BAD.some((b) => t.toLowerCase().includes(b)))
        .slice(0, 10);
      if (titles.length) {
        cands = await fileInfos(titles);
        if (cands.length) break;
      }
    } catch (e) { console.log('ERR cat', slug, c, e.message); }
    await sleep(250);
  }
  if (cands.length < 2) {
    for (const t of terms) {
      try {
        const titles = (await searchFiles(t))
          .filter((x) => !BAD.some((b) => x.toLowerCase().includes(b)))
          .slice(0, 10);
        const more = await fileInfos(titles);
        cands = [...cands, ...more];
        if (cands.length >= 2) break;
      } catch (e) { console.log('ERR search', slug, t, e.message); }
      await sleep(250);
    }
  }
  cands = cands.slice(0, 2);
  let n = 0;
  for (const [k, c] of cands.entries()) {
    try {
      const buf = Buffer.from(await (await fetch(c.ii.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer());
      if (buf.length > 1500) {
        fs.writeFileSync(path.join(OUT_DIR, `${slug}__${'ab'[k]}.jpg`), buf);
        console.log('CAND', slug, 'ab'[k], '<-', c.title, `${Math.round(buf.length / 1024)}KB`);
        n++;
      }
    } catch (e) { console.log('ERR dl', slug, e.message); }
  }
  if (n) ok++; else { fail++; console.log('FAIL', slug); }
  await sleep(1200);
}
console.log(`\nHecho: ${ok} con candidato(s), ${fail} sin candidato`);
