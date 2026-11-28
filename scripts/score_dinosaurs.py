#!/usr/bin/env python3
"""Render and score the production rigs offline. Requires Chromium, Pillow, NumPy, SciPy and Playwright."""
import argparse
import base64
from io import BytesIO
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
SIZE = 192
VERSION = 'hero-v2'
SEEDS = (271, 412, 853)
LIGHTS = ('studio', 'canopy')
GROUPS = dict(shape=20, skin=20, face=20, rig=20, motion=15, readability=5)


def unit(x):
    return float(np.clip(x, 0, 1))


def read_strip(page, action, ids=False):
    data = page.evaluate('([a,ids])=>audit.strip(a,ids)', [action, ids])
    return Image.open(BytesIO(base64.b64decode(data))).convert('RGBA')


def tile(sheet, row, col):
    return np.array(sheet.crop((col*SIZE, row*SIZE, (col+1)*SIZE, (row+1)*SIZE)))


def regions(sheet, row):
    pixels = tile(sheet, row, 0)
    bits = (pixels[:, :, :3] > 150).astype(int)
    return (4*bits[:, :, 0]+2*bits[:, :, 1]+bits[:, :, 2])*(pixels[:, :, 3] > 200)


def measure(poses, phase_count, strips, idle_ids, call_ids, rig, checks):
    fractions, color, light, accent, connected, excursions = [], [], [], [], [], []
    for row in range(4):
        ids, opened = regions(idle_ids, row), regions(call_ids, row)
        area = (tile(idle_ids, row, 0)[:, :, 3] > 128).sum()
        open_area = (tile(call_ids, row, 0)[:, :, 3] > 128).sum()
        fractions.append([np.sum(ids == k)/area for k in [4, 2, 6]] +
                         [np.sum(opened == 5)/open_area, np.sum(ids == 5)/area])
        if row < 3:
            image = tile(strips['idle'], row, 0)[:, :, :3].astype(float)
            hide = image[ids == 1]
            if not len(hide):
                color.append(0); light.append(0); accent.append(0)
                continue
            chroma = hide[:, :2] - hide[:, 1:3]
            color.append(np.linalg.norm(np.diff(np.percentile(chroma, [10, 90], axis=0), axis=0)))
            light.append(np.ptp(np.percentile(hide @ [.2126, .7152, .0722], [10, 90])))
            cue = image[(ids == 4) | (ids == 2)]
            accent.append(np.linalg.norm(np.median(cue, axis=0)-np.median(hide, axis=0)) if len(cue) else 0)
    for action in poses:
        for row in range(3):
            masks = [tile(strips[action], row, col)[:, :, 3] > 128 for col in range(phase_count)]
            for mask in masks:
                thumb = np.asarray(Image.fromarray(mask.astype('uint8')*255).resize((48, 48), Image.Resampling.BOX)) > 100
                clusters, count = label(thumb, structure=np.ones((3, 3)))
                sizes = np.bincount(clusters.ravel())[1:]
                connected.append(max(sizes)/thumb.sum() if count and not (mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any()) else 0)
            if action != 'idle':
                excursions.append(max(np.sum(masks[0] ^ later)/max(1, np.sum(masks[0] | later))
                                      for later in masks[1:]))
    # Independent best two views for each ID cue. A tail club need not show head-on.
    cue_views = np.asarray(fractions)
    primary, secondary = np.sort(cue_views[:, :2], axis=0)[-2:].mean(axis=0)
    eyes, mouth, closed = cue_views[[0, 1, 3], 2:].mean(axis=0)
    metrics = dict(primary=primary, secondary=secondary, eyes=eyes, open_mouth=mouth,
                   mouth_gain=max(0, mouth-closed), chroma=np.mean(color), luminance=np.mean(light),
                   cue_contrast=np.mean(accent), connected=np.mean(connected), **rig,
                   motion_response=np.mean([unit(x/.22) for x in excursions]))
    voice = checks['voice']
    timing = 0 if voice['lag_ms'] is None else unit(voice['correlation'])*unit(1-abs(voice['lag_ms'])/180)
    scores = dict(
        shape=10*unit(primary/.08)**.5+10*unit(secondary/.03)**.5,
        skin=10*max(unit(metrics['chroma']/35), unit(metrics['luminance']/65))
             +8*unit(metrics['luminance']/65)+2*unit(metrics['cue_contrast']/60),
        face=6*unit(eyes/.012)+6*unit(mouth/.028)+4*unit(metrics['mouth_gain']/.021)+4*timing,
        rig=8*unit(1-checks['contact']/.035)+4*unit(1-checks['drift']/.08)
            +4*unit(1-rig['penetration']/.020)+4*unit(1-rig['endpoint']/.010),
        motion=10*metrics['motion_response']+5*unit(rig['lift']/.070),
        readability=5*unit(metrics['connected']),
    )
    if not all(np.isfinite(x) for x in [*scores.values(), *metrics.values()]):
        raise ValueError('Non-finite render or rig metric')
    return dict(metrics=metrics, scores=scores)


def call_alignment(record):
    jaw = np.array(record['mouth'])
    amplitude = float(np.ptp(jaw))
    jaw = (jaw-jaw.min()) / max(amplitude, 1e-8)
    # Compression approximates perceived loudness and keeps the decay measurable.
    sound = np.sqrt(np.asarray(record['rms']) / max(max(record['rms']), 1e-8))
    active = np.flatnonzero(sound > .08)
    if not len(active) or amplitude < 1e-6:
        return dict(jaw_range=amplitude, correlation=0., lag_ms=None, passed=False)
    frames = np.arange(max(0, active[0]-12), min(len(sound), active[-1]+13))
    def correlation(lag):
        shifted = np.interp(frames+lag, np.arange(len(jaw)), jaw, left=0, right=0)
        return float(np.corrcoef(sound[frames], shifted)[0, 1]) if shifted.std() > 1e-8 else 0.
    dt = record['dt']
    lag = max(range(-35, 36), key=lambda step: (correlation(step), -abs(step)))
    corr = correlation(0)
    return dict(jaw_range=amplitude, correlation=corr, lag_ms=round(1000*dt*lag),
                passed=bool(amplitude >= .25 and abs(lag*dt) <= .08 and corr >= .73))


def functional_checks(page, rig, folder):
    walk = page.evaluate('audit.locomotion()')
    feet = walk['feet']
    vocal = page.evaluate('audit.vocalTiming()')
    (folder/'call-timing.json').write_text(json.dumps(vocal, allow_nan=False))
    sound = call_alignment(vocal)
    locomotion = walk['travel'] > .3 and all(f['strides'] >= 2 and f['swingRange'] >= .018 for f in feet)
    drift = max(f['drift'] for f in feet)
    contact = max(rig['contact'], max(f['contact'] for f in feet))
    grounding = drift <= .04 and contact <= .012 and rig['penetration'] <= .012
    return dict(locomotion=locomotion, grounding=grounding, voice_sync=sound['passed'],
                passed=locomotion and grounding and sound['passed'], drift=drift, contact=contact,
                walk=walk, voice=sound)


def render_condition(page, folder, poses, rig, checks, overview):
    strips = {}
    if overview:
        sheet_overview = Image.new('RGB', (SIZE*6, len(poses)*(SIZE//2+16)), '#18312b')
        pen = ImageDraw.Draw(sheet_overview)
    for i, action in enumerate(poses):
        sheet = read_strip(page, action)
        sheet.save(folder/f'{action}.png')
        strips[action] = sheet
        if overview:
            y = i*(SIZE//2+16)
            pen.text((4, y), action, fill='white')
            for j, col in enumerate([0, 2, 3, 5]):
                for row in range(3):
                    im = Image.fromarray(tile(sheet, row, col)).resize((SIZE//2, SIZE//2))
                    sheet_overview.paste(im, ((j+row*4)*SIZE//2, y+16), im)
    if overview:
        sheet_overview.save(folder/'overview.jpg', quality=90)
    ids = [read_strip(page, action, True) for action in ('idle', 'call')]
    for action, sheet in zip(('idle', 'call'), ids):
        sheet.save(folder/f'{action}-regions.png')
    return measure(poses, 7, strips, *ids, rig, checks)


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--chromium', help='Chromium executable, e.g. /usr/bin/google-chrome')
    parser.add_argument('--species', nargs='+', help='Audit a subset using the same rubric')
    parser.add_argument('--control', choices=['normal', 'frozen', 'floating', 'sliding', 'late-jaw'], default='normal',
                        help='Apply a known fault in the offline fixture to test score sensitivity')
    parser.add_argument('--checks-only', action='store_true', help='Run the timed motion, contact and voice checks without rendering score sheets')
    parser.add_argument('--require-pass', action='store_true', help='Exit unsuccessfully if any functional check fails')
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        folder = Path(tmp)
        subprocess.run([ROOT/'node_modules/.bin/esbuild', 'scripts/dinosaur_score_scene.mjs', '--bundle',
                        '--log-level=warning', '--format=esm', f'--outfile={folder}/fixture.js'], cwd=ROOT, check=True)
        html = folder/'index.html'
        html.write_text(f'<canvas width="{SIZE}" height="{SIZE}"></canvas><script type="module" src="fixture.js"></script>')
        browser = pw.chromium.launch(executable_path=args.chromium, args=['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(device_scale_factor=1)
        page.goto(html.as_uri())
        available = page.evaluate('audit.kinds')
        selected = args.species or available
        if set(selected)-set(available):
            parser.error(f'Available species: {available}')
        report = dict(version=VERSION, control=args.control, browser=browser.version, seeds=SEEDS, lights=LIGHTS, tile=SIZE,
                      packages={k:version(k) for k in ['Pillow', 'numpy', 'scipy', 'playwright']}, species={})
        report['source_sha256'] = {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in (
            'site/3d/hatchling.mjs', 'site/3d/hatchling-play.mjs', 'scripts/dinosaur_score_scene.mjs',
            'site/3d/trailhead-motion.mjs', 'site/3d/sound.mjs', 'scripts/score_dinosaurs.py', 'package-lock.json')}
        for kind in selected:
            ages = {}
            poses = page.evaluate('audit.poses') + (['scratch'] if kind == 'rex' else [])
            for adult in [False, True]:
                age = 'adult' if adult else 'baby'
                folder = args.destination/kind/age
                folder.mkdir(parents=True, exist_ok=True)
                conditions = {}
                by_seed = {}
                for seed in SEEDS:
                    page.evaluate('(args)=>audit.select(...args)', [kind, adult, args.control, seed])
                    rig = page.evaluate('(actions)=>audit.mechanics(actions)', poses)
                    sample_folder = folder/str(seed)
                    sample_folder.mkdir(exist_ok=True)
                    checks = functional_checks(page, rig, sample_folder)
                    by_seed[str(seed)] = checks
                    if args.checks_only:
                        continue
                    for light in LIGHTS:
                        dest = sample_folder/light
                        dest.mkdir(exist_ok=True)
                        page.evaluate('(profile)=>audit.lighting(profile)', light)
                        conditions[f'{seed}-{light}'] = render_condition(page, dest, poses, rig, checks, seed == SEEDS[0])
                ages[age] = dict(checks={gate:all(c[gate] for c in by_seed.values())
                                        for gate in ('locomotion', 'grounding', 'voice_sync', 'passed')},
                                 by_seed=by_seed, conditions=conditions)
            result = dict(passed=all(a['checks']['passed'] for a in ages.values()), ages=ages)
            if not args.checks_only:
                scores = {k:round(float(np.mean([c['scores'][k] for a in ages.values()
                                                 for c in a['conditions'].values()])), 3) for k in GROUPS}
                result.update(total=round(sum(scores.values()), 3), scores=scores)
            report['species'][kind] = result
            print(kind, result.get('total', ''), 'PASS' if result['passed'] else 'FAIL', flush=True)
            (args.destination/'scores.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
        browser.close()
        if args.require_pass and not all(v['passed'] for v in report['species'].values()):
            raise SystemExit(1)


if __name__ == '__main__':
    run()
