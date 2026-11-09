#!/usr/bin/env python3
"""Baja una animación (GIF o MP4) por ejercicio desde Wikimedia Commons.
Uso: python fetch10_anim.py [slug ...]  (sin args = los 46)"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
os.makedirs(OUT, exist_ok=True)
UA = 'GymLogApp/3.0 (personal fitness app) python-urllib'

CATS = {
    'bench-press': ['Bench press', 'Barbell bench press'],
    'bench-press-incline-barbell': ['Incline bench press'],
    'bench-press-incline-dumbbell': ['Incline dumbbell press', 'Dumbbell bench press'],
    'dumbbell-fly': ['Dumbbell fly', 'Chest fly', 'Fly (exercise)'],
    'pec-deck': ['Pec deck', 'Chest fly machine', 'Fly machine'],
    'pullover': ['Pullover (exercise)', 'Chest pullover'],
    'dips': ['Dips (exercise)'],
    'pull-ups': ['Pull-up'],
    'lat-pulldown': ['Lat pulldown'],
    'lat-pulldown-closed': ['Lat pulldown', 'Seated row'],
    'barbell-row': ['Barbell row', 'Bent-over row'],
    'seated-cable-row': ['Seated row', 'Cable row'],
    'one-arm-dumbbell-row': ['Dumbbell row'],
    'back-extension': ['Back extension (exercise)'],
    'deadlift': ['Deadlift'],
    'squat': ['Squat (exercise)', 'Barbell squat'],
    'front-squat': ['Front squat'],
    'leg-press': ['Leg press'],
    'lunges': ['Lunge (exercise)', 'Lunges'],
    'bulgarian-split-squat': ['Bulgarian split squat', 'Split squat'],
    'leg-extension': ['Leg extension (exercise)', 'Leg extension machine'],
    'leg-curl': ['Leg curl', 'Lying leg curl'],
    'standing-calf-raise': ['Calf raise'],
    'seated-calf-raise': ['Calf raise', 'Seated calf raise'],
    'military-press': ['Overhead press', 'Military press'],
    'arnold-press': ['Arnold press'],
    'shoulder-machine': ['Shoulder press machine', 'Military press machine'],
    'lateral-raise': ['Lateral raise'],
    'front-raise': ['Front raise'],
    'barbell-curl': ['Barbell curl', 'Bicep curl'],
    'dumbbell-curl': ['Dumbbell curl', 'Bicep curl'],
    'hammer-curl': ['Hammer curl'],
    'concentration-curl': ['Concentration curl'],
    'cable-curl': ['Cable curl'],
    'tricep-pushdown': ['Triceps pushdown'],
    'french-press': ['French press (exercise)', 'Skull crusher'],
    'overhead-dumbbell-extension': ['Overhead triceps extension', 'Triceps extension'],
    'tricep-machine': ['Triceps extension machine'],
    'plank': ['Plank (exercise)'],
    'side-plank': ['Side plank', 'Plank (exercise)'],
    'hanging-leg-raise': ['Hanging leg raise', 'Leg raise'],
    'cable-crunch': ['Crunch (exercise)', 'Cable crunch'],
    'russian-twist': ['Russian twist'],
    'cable-cross': ['Cable crossover', 'Cable fly'],
}

BAD = ['logo', 'chart', 'diagram', 'icon', 'flag', 'painting', 'anatom',
       'sketch', 'map ', 'poster', 'card ', 'screenshot', 'screen cast',
       'test ', 'thumbnail', 'svg', 'pano']

def get(url, tries=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(25)
                continue
            raise

def cat_files(cat):
    # cmtype se comporta raro (devuelve 0): listar todo y filtrar por extensión
    j = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'list': 'categorymembers',
        'cmlimit': 500, 'cmtitle': 'Category:' + cat}))
    return [m['title'] for m in j.get('query', {}).get('categorymembers', [])
            if m.get('ns') == 6]

def search_files(term):
    j = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'list': 'search',
        'srnamespace': 6, 'srlimit': 30, 'srsearch': term}))
    return [s['title'] for s in j.get('query', {}).get('search', [])]

def is_anim(t):
    tl = t.lower()
    if not (tl.endswith('.gif') or tl.endswith('.mp4') or tl.endswith('.webm')):
        return False
    if any(b in tl for b in BAD):
        return False
    return True

def file_infos(titles):
    out = []
    for i in range(0, len(titles), 10):
        j = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'prop': 'imageinfo',
            'iiprop': 'url|size|mime|width|height', 'iiurlwidth': 640,
            'titles': '|'.join(titles[i:i + 10])}))
        for p in j.get('query', {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [None])[0]
            if ii and ii.get('mime') in ('image/gif', 'video/mp4', 'video/webm') \
                    and (ii.get('width') or 0) >= 320 and ii.get('url'):
                out.append(ii)
    return out

def dl(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def try_titles(slug, titles, source):
    """Prueba a descargar de una lista de archivos; True si lo consigue."""
    if not titles:
        return False
    infos = sorted(file_infos(titles), key=lambda x: x.get('size') or 10 ** 9)[:4]
    for ii in infos:
        ext = ii['mime'].split('/')[1]  # gif | mp4 | webm
        is_gif = ext == 'gif'
        url = ii.get('thumburl') if (is_gif and ii.get('thumburl')) else ii['url']
        try:
            buf = dl(url)
        except Exception:
            continue
        if 40_000 < len(buf) < 12_000_000:
            with open(os.path.join(OUT, f'{slug}.{ext}'), 'wb') as f:
                f.write(buf)
            print('ANIM', slug, ext, f'{len(buf)//1024}KB', '<-', source, flush=True)
            return True
    return False

def has_anim(slug):
    return any(os.path.exists(os.path.join(OUT, f'{slug}.{e}')) for e in ('gif', 'mp4', 'webm'))

def main():
    slugs = sys.argv[1:] or list(CATS)
    ok = fail = 0
    for slug in slugs:
        if has_anim(slug):
            print('SKIP', slug, flush=True)
            ok += 1
            continue
        found = False
        for cat in CATS[slug]:
            if found:
                break
            try:
                titles = [t for t in cat_files(cat) if is_anim(t)][:12]
            except Exception as e:
                print('ERR', slug, cat, e, flush=True)
                titles = []
            time.sleep(0.8)
            if try_titles(slug, titles, cat):
                found = True
            time.sleep(2.5)
        if not found:
            # Reserva: buscar por nombre en Commons (dos variantes de término)
            name = slug.replace('-', ' ')
            for term in (name, name + ' exercise'):
                if found:
                    break
                try:
                    titles = [t for t in search_files(term) if is_anim(t)][:8]
                    if try_titles(slug, titles, 'search'):
                        found = True
                except Exception as e:
                    print('ERR search', slug, e, flush=True)
                time.sleep(4)
        if not found:
            print('FAIL', slug, flush=True)
        ok += found
        fail += (not found)
        time.sleep(4)
    print(f'Hecho: {ok} con animación, {fail} sin', flush=True)

if __name__ == '__main__':
    main()
