#!/usr/bin/env python3
"""Debug: qué variante de la API de Commons devuelve miembros de categoría."""
import json, urllib.parse, urllib.request

UA = 'GymLogApp/3.0 (personal fitness app) python-urllib'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

base = 'https://commons.wikimedia.org/w/api.php'
variants = {
    'cmtype=bitmap':      {'cmtype': 'bitmap'},
    'cmtype=video':       {'cmtype': 'video'},
    'cmtype=image|video': {'cmtype': 'image|video'},
    'cmtype=file':        {'cmtype': 'file'},
    'sin cmtype':         {},
}
for name, extra in variants.items():
    params = {'action': 'query', 'format': 'json', 'list': 'categorymembers',
              'cmlimit': '100', 'cmtitle': 'Category:Bench press'}
    params.update(extra)
    try:
        j = get(base + '?' + urllib.parse.urlencode(params))
        mem = j.get('query', {}).get('categorymembers', [])
        files = [m['title'] for m in mem if m.get('ns') == 6]
        gifmp4 = [t for t in files if t.lower().endswith(('.gif', '.mp4', '.webm'))]
        print(f'{name}: {len(mem)} miembros, {len(files)} archivos, {len(gifmp4)} anim -> {gifmp4[:3]}')
    except Exception as e:
        print(f'{name}: ERROR {e}')
