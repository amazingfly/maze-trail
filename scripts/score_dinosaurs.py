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
VERSION = 'hero-v1'
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


def measure(poses, phase_count, strips, idle_ids, call_ids, rig):
    fractions, color, light, accent, connected, excursions = [], [], [], [], [], []
    for row in range(3):
        ids, opened = regions(idle_ids, row), regions(call_ids, row)
        area = (tile(idle_ids, row, 0)[:, :, 3] > 128).sum()
        open_area = (tile(call_ids, row, 0)[:, :, 3] > 128).sum()
        fractions.append([np.sum(ids == k)/area for k in [4, 2, 6]] +
                         [np.sum(opened == 5)/open_area, np.sum(ids == 5)/area])
        if row < 2:
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
        for row in range(2):
            masks = [tile(strips[action], row, col)[:, :, 3] > 128 for col in range(phase_count)]
            for mask in masks:
                thumb = np.asarray(Image.fromarray(mask.astype('uint8')*255).resize((48, 48), Image.Resampling.BOX)) > 100
                clusters, count = label(thumb, structure=np.ones((3, 3)))
                sizes = np.bincount(clusters.ravel())[1:]
                connected.append(max(sizes)/thumb.sum() if count and not (mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any()) else 0)
            if action != 'idle':
                excursions.append(max(np.sum(masks[0] ^ later)/max(1, np.sum(masks[0] | later))
                                      for later in masks[1:]))
    primary, secondary, eyes, mouth, closed = np.mean(fractions, axis=0)
    metrics = dict(primary=primary, secondary=secondary, eyes=eyes, open_mouth=mouth,
                   mouth_gain=max(0, mouth-closed), chroma=np.mean(color), luminance=np.mean(light),
                   cue_contrast=np.mean(accent), connected=np.mean(connected), **rig,
                   motion_response=np.mean([unit(x/.22) for x in excursions]))
    scores = dict(
        shape=12*unit(primary/.10)+8*unit(secondary/.035),
        skin=8*unit(metrics['chroma']/35)+7*unit(metrics['luminance']/84)+5*unit(metrics['cue_contrast']/82),
        face=8*unit(eyes/.012)+7*unit(mouth/.028)+5*unit(metrics['mouth_gain']/.021),
        rig=12*unit(1-rig['contact']/.035)+4*unit(1-rig['penetration']/.020)+4*unit(1-rig['endpoint']/.010),
        motion=10*metrics['motion_response']+5*unit(rig['lift']/.070),
        readability=5*unit(metrics['connected']),
    )
    if not all(np.isfinite(x) for x in [*scores.values(), *metrics.values()]):
        raise ValueError('Non-finite render or rig metric')
    return dict(metrics=metrics, scores=scores)


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--chromium', help='Chromium executable, e.g. /usr/bin/google-chrome')
    parser.add_argument('--species', nargs='+', help='Audit a subset using the same rubric')
    parser.add_argument('--control', choices=['normal', 'frozen', 'floating'], default='normal',
                        help='Apply a known fault in the offline fixture to test score sensitivity')
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        folder = Path(tmp)
        subprocess.run([ROOT/'node_modules/.bin/esbuild', 'scripts/dinosaur_score_scene.mjs', '--bundle',
                        '--log-level=warning', f'--outfile={folder}/fixture.js'], cwd=ROOT, check=True)
        html = folder/'index.html'
        html.write_text(f'<canvas width="{SIZE}" height="{SIZE}"></canvas><script src="fixture.js"></script>')
        browser = pw.chromium.launch(executable_path=args.chromium, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(device_scale_factor=1)
        page.goto(html.as_uri())
        available = page.evaluate('audit.kinds')
        selected = args.species or available
        if set(selected)-set(available):
            parser.error(f'Available species: {available}')
        report = dict(version=VERSION, control=args.control, browser=browser.version, seed=271, tile=SIZE,
                      packages={k:version(k) for k in ['Pillow', 'numpy', 'scipy', 'playwright']}, species={})
        report['source_sha256'] = {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in (
            'site/3d/hatchling.mjs', 'site/3d/hatchling-play.mjs', 'scripts/dinosaur_score_scene.mjs',
            'scripts/score_dinosaurs.py', 'package-lock.json')}
        for kind in selected:
            ages = {}
            poses = page.evaluate('audit.poses') + (['scratch'] if kind == 'rex' else [])
            for adult in [False, True]:
                age = 'adult' if adult else 'baby'
                folder = args.destination/kind/age
                folder.mkdir(parents=True, exist_ok=True)
                page.evaluate('(args)=>audit.select(...args)', [kind, adult, args.control])
                strips = {}
                overview = Image.new('RGB', (SIZE*4, len(poses)*(SIZE//2+16)), '#18312b')
                pen = ImageDraw.Draw(overview)
                for i, action in enumerate(poses):
                    sheet = read_strip(page, action)
                    sheet.save(folder/f'{action}.png')
                    strips[action] = sheet
                    y = i*(SIZE//2+16)
                    pen.text((4, y), action, fill='white')
                    for j, col in enumerate([0, 2, 3, 5]):
                        for row in range(2):
                            im = Image.fromarray(tile(sheet, row, col)).resize((SIZE//2, SIZE//2))
                            overview.paste(im, ((j+row*4)*SIZE//2, y+16), im)
                overview.save(folder/'overview.jpg', quality=90)
                ids = [read_strip(page, a, True) for a in ['idle', 'call']]
                for a, sheet in zip(['idle', 'call'], ids):
                    sheet.save(folder/f'{a}-regions.png')
                rig = page.evaluate('(actions)=>audit.mechanics(actions)', poses)
                ages[age] = measure(poses, 7, strips, *ids, rig)
            scores = {k:round(sum(a['scores'][k] for a in ages.values())/2, 3) for k in GROUPS}
            report['species'][kind] = dict(total=round(sum(scores.values()), 3), scores=scores, ages=ages)
            print(kind, report['species'][kind]['total'], scores, flush=True)
            (args.destination/'scores.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
        browser.close()


if __name__ == '__main__':
    run()
