"""Exercise the shipped DOM controls with synthetic pose/depth and a real XR framebuffer."""
import argparse
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("url",help="Built room/ URL, local or deployed")
ap.add_argument("output",type=Path)
ap.add_argument("--shield",action="store_true",help="Wait for and photograph a shield impact before shooting")
args = ap.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROME_BIN") or shutil.which("google-chrome"),
                                 args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True)
    errors = []
    page.on("pageerror",lambda e: errors.append(str(e)))
    page.add_init_script(path=Path(__file__).with_name("mock-xr.js"))
    page.goto(args.url)
    page.evaluate("mockRoom.aim(0,-1.04);mockRoom.depth(false)")
    page.locator("#begin:enabled").tap()
    page.locator("#ar-ui").wait_for()
    assert page.locator("#phaser").is_disabled()
    assert "depth-sensing" in page.evaluate("requestedFeatures")
    # Examine the rendered alpha over the left and right thirds of the view.
    page.evaluate("""() => {
      window.mistLevels=()=>{
        const c=document.getElementById('discovery-fog')
        const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data
        return [.22,.79].map(f=>{
          let sum=0,n=0
          for(let y=8;y<23;y++) for(let x=-3;x<=3;x++) {
            sum+=p[(y*c.width+Math.floor(f*c.width)+x)*4+3];n++
          }
          return sum/n
        })
      }
    }""")
    assert min(page.evaluate("mistLevels()"))>150
    page.screenshot(path=str(args.output/"entry-mist.png"))
    # Level gaze with a narrow band of wall depth and no floor or ceiling.
    page.evaluate("mockRoom.aim(0,0);mockRoom.wallOnly(true);mockRoom.width(.54);mockRoom.depth(true)")
    page.locator("#phaser:enabled").wait_for()
    page.wait_for_function("document.getElementById('scan-state').textContent==='Exploring'")
    assert page.locator("#ar-ui").get_attribute("data-armed")=="false"
    page.touchscreen.tap(196,424)
    assert page.locator("#charge").is_hidden()
    page.evaluate("mockRoom.wallOnly(false);mockRoom.aim(0,-1.04)")
    page.wait_for_function("mistLevels()[0]<30 && mistLevels()[1]>150")
    page.locator("#phaser:enabled").wait_for()
    assert page.locator("#charge").is_hidden()
    page.wait_for_function("document.getElementById('ar-ui').dataset.armed==='true'")
    page.wait_for_function("mockRoom.snapshot()>2000")
    page.screenshot(path=str(args.output/"partial-floor.png"))
    page.evaluate("mockRoom.depth(false);mockRoom.aim(Math.PI,.18)")
    page.wait_for_function("Math.min(...mistLevels())>150")
    page.evaluate("mockRoom.width(1);mockRoom.aim(0,-1.04);mockRoom.depth(true)")
    page.wait_for_function("Math.max(...mistLevels())<35")
    print("Entered in fog; only the observed half cleared. The floor and phaser appeared before enclosure.",flush=True)
    def capture(name):
        assert page.evaluate("mockRoom.snapshot()")>2000, "XR render target was empty"
        page.screenshot(path=str(args.output/(name+".png")))
    def find_target():
        for i in range(50):
            if page.locator("#ar-ui").get_attribute("data-lock")=="true":
                return
            if i%3==0: page.evaluate("i=>mockRoom.aim(i*.51,-.87)",i//3)
            page.wait_for_timeout(220)
        raise AssertionError("Visible target did not enter the reticle")
    if args.shield:
        page.evaluate("""() => {
          const shield=document.getElementById('shield-hit')
          function watch() {
            if(shield.getAnimations().length && Number(getComputedStyle(shield).opacity)>.20) {
              mockRoom.snapshot()
              // Hold the first actual hit frame for the screenshot.
              for(const a of shield.getAnimations()) a.pause()
              return
            }
            requestAnimationFrame(watch)
          }
          watch()
        }""")
        for i in range(8):
            find_target()
            page.wait_for_timeout(1000)
            if page.evaluate("document.getElementById('shield-hit').getAnimations().some(a=>a.playState==='paused')"): break
        assert page.evaluate("document.getElementById('shield-hit').getAnimations().some(a=>a.playState==='paused')"), "No shield hit"
        page.screenshot(path=str(args.output/"shield-hit.png"))
        page.evaluate("document.getElementById('shield-hit').getAnimations().forEach(a=>a.cancel())")
    find_target()
    capture("tracked-target")
    # A near miss on the glass should be assisted to the nearest visible target.
    for i in range(5):
        page.touchscreen.tap(207,428)
        page.wait_for_timeout(165)
        if int(page.locator("#tag-count").inner_text()): break
        find_target()
    assert int(page.locator("#tag-count").inner_text())==1,"Touch did not land a single assisted shot"
    assert page.locator("#charge").is_hidden(),"A partial room unlocked black crystals"
    print("Tapped a dinosaur before mapping the ceiling or enclosing the room.",flush=True)
    capture("after-shot")
    page.evaluate("mockRoom.pause(true)")
    page.wait_for_function("document.querySelector('#phaser').disabled")
    page.touchscreen.tap(198,423)
    assert page.locator("#tag-count").inner_text()=="1"
    page.evaluate("mockRoom.pause(false)")
    page.locator("#phaser:enabled").wait_for()
    page.evaluate("mockRoom.depth(false)")
    page.wait_for_function("document.querySelector('#phaser').disabled")
    page.evaluate("mockRoom.depth(true)")
    page.locator("#phaser:enabled").wait_for()
    page.evaluate("mockRoom.scan()")
    page.get_by_text("Room mapped",exact=True).wait_for(timeout=95000)
    # Keep the original crystal and wall controls covered in the same encounter.
    for i in range(40):
        if int(page.locator("#ammo-count").inner_text()): break
        page.evaluate("i=>mockRoom.aim(i*Math.PI/16,-.45)",i)
        page.wait_for_timeout(80)
        if page.locator("#charge").is_enabled(): page.locator("#charge").evaluate("e=>e.click()")
    assert int(page.locator("#ammo-count").inner_text())>0, "Could not collect a crystal"
    for yaw in [.07,.18,-.22,.43,1.45,-1.18,2.9]:
        page.evaluate("yaw=>mockRoom.aim(yaw,-.06,[.08,1.53,.05])",yaw)
        page.wait_for_timeout(260)
        if page.locator("#exterior").is_enabled(): break
    assert page.locator("#exterior").is_enabled(),page.locator("#ar-ui").inner_text()
    page.locator("#exterior").tap(timeout=6000)
    page.locator("#charge:enabled").tap()
    page.get_by_text("Meadow revealed",exact=True).wait_for(timeout=20000)
    capture("meadow-window")
    print("Crystal collection and meadow wall blast passed alongside encounters.",flush=True)
    page.get_by_role("button",name="Mute sounds",exact=True).tap()
    assert page.locator("#sound").get_attribute("aria-pressed")=="true"
    page.set_viewport_size({"width":320,"height":660})
    boxes=[page.locator("#"+k).bounding_box() for k in ["rescan","exterior","charge"]]
    assert max(b["y"] for b in boxes)-min(b["y"] for b in boxes)<2
    assert all(0<=b["x"] and b["x"]+b["width"]<=321 for b in boxes)
    capture("compact-hud")
    page.evaluate("mockRoom.depth(false)")
    page.get_by_role("button",name="Rescan",exact=True).tap()
    assert page.locator("#tag-count").inner_text()=="0" and page.locator("#phaser").is_disabled()
    assert min(page.evaluate("mistLevels()"))>150 and page.locator("#charge").is_hidden()
    page.evaluate("mockRoom.depth(true)")
    page.locator("#phaser:enabled").wait_for()
    page.get_by_role("button",name="Exit",exact=True).tap()
    page.locator("#begin:enabled").wait_for()
    assert not errors,errors
    print("Tracking interruption, stale depth, recovery, rescan and exit passed.",flush=True)
    browser.close()
