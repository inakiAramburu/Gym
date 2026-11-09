#!/usr/bin/env python3
"""Pasada 3: los slugs que siguen sin animación.
1) Commons con filetype:video  2) reserva: Openverse /videos/
Uso: python fetch11_pass3.py [slug ...]"""
import json, os, sys, time, urllib.parse, urllib.request
from fetch10_anim import get, dl, file_infos, is_anim, try_titles, OUT, has_anim

UA = 'GymLogApp/3.0 (personal fitness app) python-urllib'

# slug: [búsquedas Commons (con filetype:video), ...]
TERMS = {
    'dumbbell-fly': ['filetype:video dumbbell fly', 'filetype:video chest fly'],
    'pec-deck': ['filetype:video pec deck', 'filetype:video chest press machine'],
    'pullover': ['filetype:video chest pullover', 'filetype:video pullover'],
    'dips': ['filetype:video dips exercise', 'filetype:video dips bar'],
    'seated-cable-row': ['filetype:video seated row', 'filetype:video cable row machine'],
    'one-arm-dumbbell-row': ['filetype:video dumbbell row', 'filetype:video one arm row'],
    'standing-calf-raise': ['filetype:video calf raise', 'filetype:video standing calf raise'],
    'seated-calf-raise': ['filetype:video calf raise machine', 'filetype:video seated calf raise'],
    'shoulder-machine': ['filetype:video shoulder press machine', 'filetype:video overhead press machine'],
    'lateral-raise': ['filetype:video lateral raise', 'filetype:video dumbbell lateral raise'],
    'front-raise': ['filetype:video front raise', 'filetype:video dumbbell front raise'],
    'barbell-curl': ['filetype:video barbell curl', 'filetype:video bicep curl barbell'],
    'dumbbell-curl': ['filetype:video dumbbell curl', 'filetype:video bicep curl dumbbell'],
    'hammer-curl': ['filetype:video hammer curl', 'filetype:video hammer grip curl'],
    'concentration-curl': ['filetype:video concentration curl', 'filetype:video bicep curl bench'],
    'cable-curl': ['filetype:video cable curl', 'filetype:video bicep cable curl'],
    'tricep-pushdown': ['filetype:video triceps pushdown', 'filetype:video pushdown cable'],
    'french-press': ['filetype:video french press', 'filetype:video skull crusher'],
    'overhead-dumbbell-extension': ['filetype:video overhead triceps extension', 'filetype:video triceps extension'],
    'tricep-machine': ['filetype:video triceps machine', 'filetype:video triceps extension machine'],
    'plank': ['filetype:video plank exercise', 'filetype:video plank hold'],
    'side-plank': ['filetype:video side plank', 'filetype:video side plank exercise'],
    'cable-crunch': ['filetype:video cable crunch', 'filetype:video rope crunch'],
    'russian-twist': ['filetype:video russian twist', 'filetype:video russian twist abs'],
    'cable-cross': ['filetype:video cable crossover', 'filetype:video cable fly'],
}

def commons_search(term):
    j = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'list': 'search',
        'srnamespace': 6, 'srlimit': 30, 'srsearch': term}))
    return [s['title'] for s in j.get('query', {}).get('search', [])]

def openverse_videos(q):
    url = ('https://api.openverse.org/v1/videos/?page_size=8&'
           + urllib.parse.urlencode({'q': q}))
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read().decode())
    out = []
    for v in j.get('results', []):
        if v.get('url') and 3 <= (v.get('duration') or 0) <= 180 \
                and (v.get('size') or 0) < 15_000_000:
            out.append(v)
    return out

def try_openverse(slug, q):
    for v in openverse_videos(q)[:2]:
        try:
            buf = dl(v['url'])
        except Exception:
            continue
        if 40_000 < len(buf) < 15_000_000:
            with open(os.path.join(OUT, f'{slug}.mp4'), 'wb') as f:
                f.write(buf)
            print('ANIM', slug, 'mp4', f'{len(buf)//1024}KB', '<- Openverse', q, flush=True)
            return True
    return False

def main():
    slugs = sys.argv[1:] or list(TERMS)
    ok = fail = 0
    for slug in slugs:
        if has_anim(slug):
            print('SKIP', slug, flush=True)
            ok += 1
            continue
        found = False
        for term in TERMS[slug]:
            if found:
                break
            try:
                titles = [t for t in commons_search(term) if is_anim(t)][:8]
                if try_titles(slug, titles, 'search'):
                    found = True
            except Exception as e:
                print('ERR commons', slug, term, e, flush=True)
            time.sleep(3)
        if not found:
            # Reserva: Openverse videos (mp4)
            q = slug.replace('-', ' ')
            for term in (q, q + ' exercise'):
                if found:
                    break
                try:
                    if try_openverse(slug, term):
                        found = True
                except Exception as e:
                    print('ERR openverse', slug, term, e, flush=True)
                time.sleep(4)
        if not found:
            print('FAIL', slug, flush=True)
        ok += found
        fail += (not found)
        time.sleep(3)
    print(f'Hecho: {ok} con animación, {fail} sin', flush=True)

if __name__ == '__main__':
    main()
