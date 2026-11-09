#!/usr/bin/env python3
"""Respaldo 3: imagen del artículo de Wikipedia de cada ejercicio (action API).
Uso: python fetch8_wiki.py [slug ...]"""
import json, os, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
os.makedirs(OUT, exist_ok=True)
UA = 'GymLogApp/2.0 (personal fitness app) python-urllib'

TITLES = {
    'cable-cross': ['Cable crossover', 'Cable fly', 'Crossover (exercise)'],
    'face-pull': ['Face pull', 'Rear deltoid'],
    'bulgarian-split-squat': ['Bulgarian split squat', 'Split squat'],
    'cable-curl': ['Biceps curl', 'Cable curl'],
    'tricep-machine': ['Triceps extension machine', 'Triceps pushdown'],
    'cable-crunch': ['Crunch (exercise)', 'Cable crunch'],
    'russian-twist': ['Russian twist', 'Russian twist (exercise)'],
}

def dl(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def pageimages(title):
    url = ('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
           '&prop=pageimages&piprop=thumbnail|original&pithumbsize=640&titles='
           + urllib.parse.quote(title))
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode())
    for p in j.get('query', {}).get('pages', {}).values():
        if p.get('missing') is not None:
            return None, None
        thumb = (p.get('thumbnail') or {}).get('source')
        orig = (p.get('originalimage') or {}).get('source')
        return thumb, orig
    return None, None

def main():
    slugs = sys.argv[1:] or list(TITLES)
    ok = fail = 0
    for slug in slugs:
        done = False
        for t in TITLES[slug]:
            try:
                thumb, orig = pageimages(t)
                if not thumb and not orig:
                    continue
                buf = b''
                for u in (thumb, orig):
                    if not u:
                        continue
                    try:
                        buf = dl(u)
                        if len(buf) > 1500:
                            break
                    except Exception:
                        buf = b''
                if len(buf) > 1500:
                    with open(os.path.join(OUT, f'{slug}__a.jpg'), 'wb') as f:
                        f.write(buf)
                    print('CAND', slug, '<-', t, f'{len(buf)//1024}KB')
                    done = True
                    break
            except Exception as e:
                print('ERR', slug, t, e)
            time.sleep(1.0)
        if done:
            ok += 1
        else:
            fail += 1
            print('FAIL', slug)
        time.sleep(1.0)
    print(f'Hecho: {ok} con candidato, {fail} sin candidato')

if __name__ == '__main__':
    main()
