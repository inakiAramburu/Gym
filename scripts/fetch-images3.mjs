// Tercera pasada: términos concretos + palabra obligatoria en el nombre del fichero.
import fs from 'node:fs';
import path from 'node:path';

// [slug, [términos a probar en orden], palabra que DEBE aparecer en el nombre]
const LIST = [
  ['pullover', ['chest pullover dumbbell', 'pullover exercise', 'pullover'], 'pullover'],
  ['arnold-press', ['arnold press dumbbell', 'overhead dumbbell press'], 'press'],
  ['tricep-pushdown', ['tricep pushdown cable', 'triceps pushdown rope', 'rope pushdown'], 'pushdown'],
  ['overhead-dumbbell-extension', ['overhead triceps extension', 'triceps extension overhead'], 'triceps'],
  ['cable-crunch', ['cable crunch', 'crunch machine cable'], 'crunch'],
  ['russian-twist', ['russian twist exercise', 'russian twist ab core'], 'russian'],
  ['hanging-leg-raise', ['hanging leg raise pull up bar', 'hanging knee raise', 'leg raise pull up'], 'raise'],
  ['one-arm-dumbbell-row', ['bent over dumbbell row', 'dumbbell bent over row barbell'], 'dumbbell'],
  ['side-plank', ['side plank exercise', 'side bridge plank'], 'side'],
  ['bulgarian-split-squat', ['bulgarian split squat', 'split squat step'], 'squat'],
];

const BLACKLIST = ['bowl', 'journal', 'uniform', 'park', 'vessel', 'commando', 'gymnast', 'dance'];

const UA = 'GymLogApp/1.0 (personal fitness app; https://localhost) node-fetch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function searchFiles(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent('filetype:bitmap ' + term)}`;
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
for (const [slug, terms, required] of LIST) {
  const out = path.join(OUT_DIR, slug + '.jpg');
  if (fs.existsSync(out)) fs.rmSync(out); // fuerza reintentar
  let done = false;
  for (const term of terms) {
    if (done) break;
    try {
      const titles = await searchFiles(term);
      for (const t of titles) {
        const low = t.toLowerCase();
        if (t.includes('/svg')) continue;
        if (low.includes(required.toLowerCase()) && !BLACKLIST.some((b) => low.includes(b))) {
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
      }
    } catch (e) {
      console.log('ERR ', slug, term, e.message);
    }
    await sleep(300);
  }
  if (!done) { console.log('FAIL', slug); fail++; } else ok++;
}
console.log(`\nPasada 3: ${ok} OK, ${fail} sin imagen`);
