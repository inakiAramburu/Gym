// Segunda pasada: mejoría de términos para las imágenes fallidas o dudosas.
import fs from 'node:fs';
import path from 'node:path';

const LIST = [
  ['bench-press-incline-barbell', 'incline barbell press bench'],
  ['cable-cross', 'cable crossover chest'],
  ['pullover', 'pullover dumbbell bench'],
  ['bulgarian-split-squat', 'bulgarian split squat'],
  ['leg-extension', 'leg extension machine'],
  ['arnold-press', 'arnold press dumbbell overhead'],
  ['tricep-pushdown', 'tricep pushdown rope cable'],
  ['overhead-dumbbell-extension', 'overhead triceps extension dumbbell'],
  ['cable-crunch', 'cable crunch abs'],
  ['russian-twist', 'russian twist ab'],
  ['leg-curl', 'hamstring curl machine'],
  ['hanging-leg-raise', 'hanging leg raise bar'],
  ['one-arm-dumbbell-row', 'dumbbell row bent over one arm'],
  ['side-plank', 'side plank pose bridge'],
  ['rdl', 'romanian deadlift'],
  ['barbell-row', 'bent over row barbell'],
  ['dips', 'parallel bars dips bodyweight'],
];

const UA = 'GymLogApp/1.0 (personal fitness app; https://localhost) node-fetch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function searchFiles(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=search&srnamespace=6&srlimit=15&srsearch=${encodeURIComponent('filetype:bitmap ' + term)}`;
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

// Palabras clave del término (>=4 letras) para puntuar el nombre del fichero
function keywords(term) {
  return term.split(/\s+/).filter((w) => w.length >= 4 && !['filetype', 'bitmap'].includes(w));
}

let ok = 0, fail = 0;
for (const [slug, term] of LIST) {
  const out = path.join(OUT_DIR, slug + '.jpg');
  if (fs.existsSync(out)) fs.rmSync(out); // fuerza reintentar (borra la dudosa)
  let done = false;
  try {
    const titles = await searchFiles(term);
    // puntuar: cuántas palabras clave aparecen en el nombre
    const scored = titles
      .map((t) => {
        const low = t.toLowerCase();
        const score = keywords(term).filter((k) => low.includes(k)).length;
        return { t, score };
      })
      .sort((a, b) => b.score - a.score);
    for (const { t } of scored) {
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
  if (!done) { console.log('FAIL', slug, term); fail++; } else ok++;
  await sleep(400);
}
console.log(`\nPasada 2: ${ok} OK, ${fail} sin imagen`);
