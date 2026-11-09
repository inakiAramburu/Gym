#!/usr/bin/env python3
"""Sonda 2: encontrar las páginas de ejercicio en exrx.net y sus GIFs."""
import re, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GymLog/1.0'

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode('utf-8', 'ignore')

# 1) sitemap
try:
    st, body = fetch('https://exrx.net/sitemap.xml')
    locs = re.findall(r'<loc>([^<]+)</loc>', body)
    curls = [l for l in locs if 'curl' in l.lower()][:10]
    print('SITEMAP', st, 'locs', len(locs), 'curls', flush=True)
    for l in curls:
        print('   ', l, flush=True)
    print('   primeras:', locs[:5], flush=True)
except Exception as e:
    print('SITEMAP ->', getattr(e, 'code', e), flush=True)

# 2) homepage: hrefs con exercise/weight
try:
    st, body = fetch('https://exrx.net/')
    hrefs = re.findall(r'<a[^>]+href="([^"]+)"', body)
    interesting = [h for h in hrefs if re.search(r'(exercise|weight|bicep|curl)', h, re.I)][:20]
    print('HOME', st, 'hrefs', len(hrefs), flush=True)
    for h in interesting:
        print('   a', h, flush=True)
except Exception as e:
    print('HOME ->', getattr(e, 'code', e), flush=True)

# 3) si hay un sitemap con curls, abrir uno y ver sus imágenes
try:
    st, body = fetch(curls[0])
    imgs = re.findall(r'<img[^>]+src="([^"]+)"', body, re.I)
    gifs = [s for s in imgs if s.lower().endswith('.gif')]
    print('EXPAGE', curls[0], st, 'imgs', len(imgs), 'gifs', len(gifs), flush=True)
    for s in imgs[:10]:
        print('   img', s, flush=True)
except Exception as e:
    print('EXPAGE ->', getattr(e, 'code', e), flush=True)
