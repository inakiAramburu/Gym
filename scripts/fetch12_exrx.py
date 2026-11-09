#!/usr/bin/env python3
"""Pasada 4: los 21 slugs que faltan, con GIFs de exrx.net (catálogo animado).
Uso: python fetch12_exrx.py [slug ...]"""
import os, sys, time, urllib.request, urllib.error
from fetch10_anim import dl, OUT, has_anim

UA = 'GymLogApp/4.0 (personal fitness app) python-urllib'

# slug: nombres candidatos en exrx.net (https://exrx.net/Loads/<Nombre>.gif)
CANDIDATES = {
    'dumbbell-fly': ['FlyWeighted', 'FlyCableLow'],
    'seated-cable-row': ['RowCableSeated', 'RowCable'],
    'standing-calf-raise': ['RaiseCalfStanding', 'RaiseCalf'],
    'seated-calf-raise': ['RaiseCalfSeated', 'RaiseCalfMachine'],
    'shoulder-machine': ['PressOverheadMachine', 'PressOverhead'],
    'lateral-raise': ['RaiseLateralWeighted', 'RaiseLateral', 'LateralRaiseWeighted'],
    'front-raise': ['RaiseFrontWeighted', 'RaiseFront', 'FrontRaiseWeighted'],
    'barbell-curl': ['CurlBarbell', 'CurlEZ'],
    'dumbbell-curl': ['CurlWeighted', 'CurlAlternate'],
    'hammer-curl': ['HammerCurl', 'CurlHammer'],
    'concentration-curl': ['ConcentrationCurl', 'CurlConcentration'],
    'cable-curl': ['CableCurl', 'CurlCable'],
    'tricep-pushdown': ['PushdownCable', 'PushdownRope'],
    'french-press': ['PressFrench', 'PressFrenchEZ'],
    'overhead-dumbbell-extension': ['ExtensionWeighted', 'ExtensionOneArm'],
    'tricep-machine': ['ExtensionMachine', 'PressFrenchMachine'],
    'plank': ['Plank', 'PlankSide'],
    'side-plank': ['SidePlank', 'PlankSide'],
    'cable-crunch': ['CrunchCable', 'CrunchRope', 'CrunchWeighted'],
    'russian-twist': ['RussianTwist', 'TwistRussian'],
    'cable-cross': ['FlyCableHigh', 'FlyCable', 'CableCrossover'],
}

def try_exrx(slug, names):
    for n in names:
        url = f'https://exrx.net/Loads/{n}.gif'
        try:
            buf = dl(url)
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
            print('MISS', slug, n, getattr(e, 'code', e), flush=True)
            continue
        if len(buf) > 40_000 and buf[:6] == b'GIF89a' and len(buf) < 12_000_000:
            with open(os.path.join(OUT, f'{slug}.gif'), 'wb') as f:
                f.write(buf)
            print('ANIM', slug, 'gif', f'{len(buf)//1024}KB', '<- exrx', n, flush=True)
            return True
        print('SMALL', slug, n, len(buf), flush=True)
    return False

def main():
    slugs = sys.argv[1:] or list(CANDIDATES)
    ok = fail = 0
    for slug in slugs:
        if has_anim(slug):
            print('SKIP', slug, flush=True)
            ok += 1
            continue
        if try_exrx(slug, CANDIDATES[slug]):
            ok += 1
        else:
            print('FAIL', slug, flush=True)
            fail += 1
        time.sleep(1.5)
    print(f'Hecho: {ok} con animacion, {fail} sin', flush=True)

if __name__ == '__main__':
    main()
