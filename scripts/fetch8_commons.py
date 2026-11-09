#!/usr/bin/env python3
"""Respaldo: baja 2 candidatos por slug desde Wikimedia Commons (solo stdlib).
Uso: python fetch8_commons.py [slug ...]  (sin args = los 8 pendientes)"""
import json, sys, time, urllib.request, urllib.parse, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
os.makedirs(OUT, exist_ok=True)
UA = 'GymLogApp/2.0 (personal fitness app) python-urllib'

# slug: (categorias, terminos busqueda)
LIST = {
    'cable-cross': (['Cable crossover', 'Cable fly'], ['cable crossover', 'cable chest fly standing']),
    'face-pull': (['Face pull', 'Face pulls'], ['face pull', 'face pull exercise rope']),
    'bulgarian-split-squat': (['Bulgarian split squat', 'Split squats'], ['split squat', 'bulgarian squat']),
    'lateral-raise': (['Lateral raise'], ['dumbbell lateral raise standing']),
    'cable-curl': (['Cable curl', 'Bicep curl'], ['cable curl', 'low cable curl biceps']),
    'tricep-machine': (['Triceps extension machine', 'Pushdown (exercise)'], ['tricep extension machine', 'triceps press machine gym']),
    'cable-crunch': (['Crunch (exercise)', 'Cable crunch'], ['cable crunch', 'cable crunch machine abs']),
    'russian-twist': (['Russian twist'], ['russian twist', 'russian twist exercise']),
}

BAD = ['svg', 'logo', 'chart', 'diagram', 'icon', 'flag', 'map ', 'painting',
       'anatom', 'skeleton', 'vintage', '18th', '19th', 'historical', 'museum',
       'uniform', 'bowl', 'vessel', 'palindrom', 'automaton', 'portrait',
       'machine gun', 'figure', 'fig.', 'photo of', 'poster', 'card']

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def cat_files(cat):
    j = get('https://commons.wikimedia.org/w/api.php?action=query&format=json'
            f'&list=categorymembers&cmtype=bitmap&cmlimit=40&cmtitle='
            + urllib.parse.quote('Category:' + cat))
    return [m['title'] for m in j.get('query', {}).get('categorymembers', [])]

def search_files(term):
    j = get('https://commons.wikimedia.org/w/api.php?action=query&format=json'
            '&list=search&srnamespace=6&srlimit=20&srsearch='
            + urllib.parse.quote('filetype:bitmap ' + term))
    return [s['title'] for s in j.get('query', {}).get('search', [])]

def file_infos(titles):
    out = []
    for i in range(0, len(titles), 12):
        chunk = titles[i:i+12]
        j = get('https://commons.wikimedia.org/w/api.php?action=query&format=json'
                '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=480&titles='
                + urllib.parse.quote('|'.join(chunk)))
        for p in j.get('query', {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [None])[0]
            if ii and ii.get('thumburl') and str(ii.get('mime', '')).startswith('image/') \
                    and (ii.get('width') or 0) >= 400:
                out.append((p['title'], ii))
    return out

def clean(titles, ext=True):
    res = []
    for t in titles:
        tl = t.lower()
        if ext and not (tl.endswith('.jpg') or tl.endswith('.jpe') or tl.endswith('.jpeg') or tl.endswith('.png')):
            continue
        if any(b in tl for b in BAD):
            continue
        res.append(t)
        if len(res) >= 10:
            break
    return res

def main():
    slugs = sys.argv[1:] or list(LIST)
    ok = fail = 0
    for slug in slugs:
        cats, terms = LIST[slug]
        cands = []
        for c in cats:
            try:
                titles = clean(cat_files(c))
                if titles:
                    cands = file_infos(titles)
                    if cands:
                        break
            except Exception as e:
                print('ERR cat', slug, c, e)
            time.sleep(0.6)
        if len(cands) < 2:
            for t in terms:
                try:
                    titles = clean(search_files(t), ext=False)
                    more = file_infos(titles)
                    cands += more
                    if len(cands) >= 2:
                        break
                except Exception as e:
                    print('ERR search', slug, t, e)
                time.sleep(0.6)
        n = 0
        for k, (title, ii) in enumerate(cands[:2]):
            try:
                req = urllib.request.Request(ii['thumburl'], headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=90) as r:
                    buf = r.read()
                if len(buf) > 1500:
                    fn = os.path.join(OUT, f'{slug}__{"ab"[k]}.jpg')
                    with open(fn, 'wb') as f:
                        f.write(buf)
                    print('CAND', slug, 'ab'[k], '<-', title, f'{len(buf)//1024}KB')
                    n += 1
            except Exception as e:
                print('ERR dl', slug, e)
        if n:
            ok += 1
        else:
            fail += 1
            print('FAIL', slug)
        time.sleep(4)
    print(f'Hecho: {ok} con candidato(s), {fail} sin candidato')

if __name__ == '__main__':
    main()
