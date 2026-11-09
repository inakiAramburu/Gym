// Última pasada laxa: acepta el primer resultado que contenga alguna palabra permitida.
import fs from 'node:fs';
import path from 'node:path';

const LIST = [
  ['cable-crunch', ['cable crunch', 'crunch abs cable', 'ab crunch machine'], ['crunch']],
  ['russian-twist', ['russian twist', 'twist abs', 'medicine ball twist'], ['twist']],
  ['hanging-leg-raise', ['leg raise', 'hanging leg raise', 'knee raise'], ['raise']],
];

const UA = 'GymLogApp/1.0 (personal fitness app; https://localhost) node-fetch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT_DIR = path.join(process.cwd(), 'public', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function searchFiles(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&list=search&srnamespace=6&srlimit=25&srsearch=${encodeURIComponent('filetype:bitmap ' + term)}`;
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

for (const [slug, terms, allowed] of LIST) {
  const out = path.join(OUT_DIR, slug + '.jpg');
  if (fs.existsSync(out)) fs.rmSync(out);
  let done = false;
  for (const term of terms) {
    if (done) break;
    const titles = await searchFiles(term);
    console.log(`[${slug}] términos="${term}" → ${titles.length} resultados`);
    for (const t of titles) {
      const low = t.toLowerCase();
      if (t.includes('/svg')) continue;
      if (allowed.some((a) => low.includes(a))) {
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
    await sleep(300);
  }
  if (!done) console.log('FAIL', slug);
}
console.log('Hecho');
