#!/usr/bin/env python3
"""Última pasada: Openverse para los 7 slugs que aún no tienen imagen buena.
Uso: python fetch9_openverse.py [slug ...]"""
import json, os, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
os.makedirs(OUT, exist_ok=True)
UA = 'GymLogApp/2.0 (personal fitness app) python-urllib'

TERMS = {
    'face-pull': ['pulling rope towards face', 'face pull rear delt', 'shoulder cable pull'],
    'tricep-machine': ['extension machine triceps', 'seated extension machine', 'tricep machine gym'],
    'cable-crunch': ['ab rope exercise cable', 'rope ab crunch', 'cable ab crunch'],
}

BAD_CREATOR = ['everkinetic']
BAD_TYPE = {'svg', 'gif'}

def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def dl(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def main():
    slugs = sys.argv[1:] or list(TERMS)
    ok = fail = 0
    for slug in slugs:
        cands = []
        for t in TERMS[slug]:
            try:
                j = get_json('https://api.openverse.org/v1/images/?page_size=8&'
                             + urllib.parse.urlencode({'q': t}))
                for r in j.get('results', []):
                    if (r.get('width') or 0) >= 350 and (r.get('height') or 0) >= 250 and r.get('url') \
                            and r.get('type', '') in ('', 'jpg', 'jpeg', 'png', 'webp', 'tiff') \
                            and (r.get('creator') or '').lower() != BAD_CREATOR[0]:
                        cands.append(r)
                    if len(cands) >= 8:
                        break
                if len(cands) >= 3:
                    break
            except Exception as e:
                print('ERR', slug, t, e)
                break
            time.sleep(4)
        n = 0
        for k, c in enumerate(cands[:3]):
            try:
                src = c['thumbnail'] if ((c.get('width') or 0) > 1800 and c.get('thumbnail')) else c['url']
                buf = dl(src)
                if len(buf) > 1500:
                    fn = os.path.join(OUT, f'{slug}__{"abc"[k]}.jpg')
                    with open(fn, 'wb') as f:
                        f.write(buf)
                    print('CAND', slug, 'abc'[k], '<-', c.get('creator') or '?', f'{len(buf)//1024}KB')
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
