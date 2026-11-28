"""Render deterministic encounter poses with the game's Babylon renderer."""
import argparse
import base64
import json
import wave
import os
import shutil
import subprocess
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("poses", nargs="*", default=["roam", "side", "warning", "leap", "breach", "vapor"])
args = parser.parse_args()
args.output.mkdir(exist_ok=True, parents=True)
with tempfile.TemporaryDirectory() as directory, sync_playwright() as pw:
    stage = Path(directory)
    subprocess.run([str(root / "node_modules/.bin/esbuild"), str(root / "scripts/room-qa/stage.mjs"),
                    "--bundle", "--format=esm", "--log-level=warning", "--outfile="+str(stage/"stage.js")], check=True)
    (stage/"index.html").write_text('<style>*{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas><script type=module src="stage.js"></script>')
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=directory))
    Thread(target=server.serve_forever, daemon=True).start()
    browser = pw.chromium.launch(executable_path=os.getenv("CHROME_BIN") or shutil.which("google-chrome"),
                                 args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width":480,"height":540})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"http://127.0.0.1:{server.server_port}")
    page.wait_for_function("typeof renderPose === 'function'")
    sheet = Image.new("RGB", (320*min(3,len(args.poses)), 384*((len(args.poses)+2)//3)), "#16332e")
    for i, pose in enumerate(args.poses):
        data = page.evaluate("name=>renderPose(name)",pose)
        path = args.output/(pose+".png")
        page.screenshot(path=str(path))
        im = Image.open(path).convert("RGB")
        assert im.getextrema()[1][1]-im.getextrema()[1][0]>60, pose
        x, y = i%3*320, i//3*384
        sheet.paste(im.resize((320,360)),(x,y))
        ImageDraw.Draw(sheet).text((x+8,y+364),pose,fill="#e7f6ce")
        print(pose,data,flush=True)
    sheet.save(args.output/"sheet.jpg",quality=91)
    audio = page.evaluate("renderSounds()")
    for i, cue in enumerate(audio["metrics"]):
        assert .035 < cue["peak"] < .96 and cue["audible"] > .055, cue
        assert (cue["balance"] > .15 if i%2 else cue["balance"] < -.15), cue
    (args.output/"audio.json").write_text(json.dumps(audio["metrics"], indent=2))
    with wave.open(str(args.output/"soundcheck.wav"), "wb") as wav:
        wav.setparams((2, 2, audio["rate"], 0, "NONE", ""))
        wav.writeframes(base64.b64decode(audio["pcm"]))
    browser.close()
    server.shutdown()
    assert not errors,errors
