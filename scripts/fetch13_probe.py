#!/usr/bin/env python3
"""Sonda: descubre la estructura actual de exrx.net (URLs de páginas e imágenes)."""
import re, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GymLog/1.0'

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode('utf-8', 'ignore')

for url in [
    'https://exrx.net/',
    'https://exrx.net/WeightTraining/CurlBarbell',
    'https://exrx.net/loads',
]:
    try:
        st, body = fetch(url)
    except Exception as e:
        print('PAGE', url, '->', getattr(e, 'code', e), flush=True)
        continue
    imgs = re.findall(r'<img[^>]+src="([^"]+)"', body, re.I)[:8]
    print('PAGE', url, '->', st, 'len', len(body), flush=True)
    for s in imgs:
        print('   img', s, flush=True)
