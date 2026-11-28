# Room Expedition

Room Expedition uses an Android browser's WebXR immersive AR session. On supported Android devices, Chrome gets six-degree-of-freedom tracking and camera passthrough from ARCore. The session requires CPU depth and a DOM overlay. A phone that reports immersive AR opens Room Expedition from the main 3D link. The room page has a maze fallback, and printed page links open their original maze.

Tap **Start exploring** in a lit room. You enter the mist immediately. As you look around, grass, stone and sky appear wherever the phone recognizes floor, walls and ceiling. The phaser fires as soon as tracking and depth are available. Completing an enclosure reveals black crystals. Look at a black crystal and press **Collect crystal**, or approach it on a clear floor. Aim at a scanned wall and tap **Blast wall**. If the far side has been surveyed, the window shows its reconstructed surfaces from the current viewing position. An unscanned far side stays misty until it is scanned via a real doorway. Select **Meadow view** before blasting an exterior wall to reveal the outdoor herd. The browser cannot identify the far side of a previously unseen wall from its depth image. The blast, opening and rubble are game graphics over the actual wall.

## Pocket dinosaurs

Look near a newly revealed patch of floor to find the first dinosaur. Feathered teal raptors wander in, call, crouch and spring toward the shield. Gold-domed pachycephalosaurs crack a scanned wall, push through a temporary burrow and charge head-first. A contracting amber ring gives time to shoot. Only one dinosaur winds up at a time. A hit pulses the edge of the screen red. Exploration continues after a hit.

Tap anywhere near a visible dinosaur to fire the phaser. Aim assist accepts about 33 degrees of error, favors the dinosaur closest to the tap direction and ignores targets hidden by scanned obstacles. A successful shot collapses the silhouette into crystal sparks and increments the star counter. The speaker button remembers the sound setting on this browser. All nine encounter cues are synthesized locally, with separate voices for each species and camera-relative stereo placement.

The animals follow the connected, observed floor. A broken wall window remains a physical barrier. Animals can roam any sufficiently large connected patch of confirmed floor near you, even with an open doorway or an unseen ceiling. Their movement pauses when tracking, recent depth or local floor support is lost. At most three indoor dinosaurs are active. If the map has no suitable wall for a burrow, another raptor can appear on the floor.

## How mapping works

- Every 130 ms, sample a 38×32 grid of CPU depth, unproject camera-plane distances with the view projection, and transform them into the tracked local reference space. Use neighboring rays to estimate surface normals and discard unreliable samples at depth discontinuities.
- In a familiar view, check geometry less often. Keep confirmed surfaces fixed through ordinary depth jitter. Process unmapped areas at the original rate.
- Quantize measurements to 5 cm and store their accumulated support in sparse 26 cm surface tiles. Each candidate takes repeated samples to become visible. Depth behind an old tile votes to remove it, after four clear observations. Foreground obstacles and invalid depth supply no removal evidence. Measurements are bounded to 12 m from the session origin.
- Thicken or clear the fog independently across the camera view using the accumulated evidence for the physical tile under each depth sample. A newly seen surface gradually clears. Turning back to a known surface reuses its evidence. Missing observations, changed surfaces and tracking loss can restore mist.
- Validate the nearby floor and ceiling, then flood the horizontal grid from the tracked position and look for gaps in its wall boundary. A room needs three consecutive enclosed evaluations to spawn charges. An opened door can break the enclosure until the neighboring area is mapped. A reference-space reset clears old alignment and requests a fresh scan.
- Keep the map updating after the first enclosure. Rebuild shared surface geometry as evidence changes, and keep virtual blast openings in their tracked planes. View windows use off-axis projection through the physical location of the opening. Rendering concentrates on nearby openings and caps active windows and dinosaur counts for phone GPUs.

The game saves confirmed geometry for the most recent room in this browser. Tap **Resume saved room** from the same spot and face the same direction as when you first started that map. The new tracking session checks the saved geometry against live depth before showing it. If alignment fails, you can play a temporary expedition and try resuming again later. **Start a new map** or **Rescan** replaces the saved room once enough new geometry is confirmed. Camera images, raw depth and game progress stay out of the save.

## Verification

Run `node scripts/test_room_map.mjs` from the repository root. The test derives synthetic perspective depth for a closed room, a misregistered wall, a door that opens and an adjoining room. It uses the same unprojection, surface fusion and enclosure validation as the game.

On a physical compatible phone, test camera permission, a complete sweep and the difference between a closed and newly opened door. Check that the reticle and crystals stay attached to the scene while walking and that opening an exterior view shows parallax on a sideways step. Chrome's support for the chosen depth features can only be confirmed when an immersive session is requested.

## Encounter review and repeatable tests

| Pass | What the test or render exposed | Change |
| --- | --- | --- |
| 1 | The original session test ended at enclosure, and a page screenshot captured only the controls. | Add a framebuffer capture and exercise indoor spawning, warnings, hits and touch shooting after the scan. |
| 2 | Front and side renders showed a segmented tail, a cap-like skull and a cropped leap. | Taper the tail continuously, blend the dome into the skull and frame the warning separately from the leap. |
| 3 | A head-on image hid the burrow behind the animal. A single-room simulation missed disconnected floor. | Render the breach from the side, animate the emerging body and debris, and route over connected floor with a single attacker winding up at a time. |
| 4 | The phaser tail was brief and the stereo direction was reversed for a right-handed XR camera. | Extend the descending phaser and species-specific calls. Render isolated stereo cues and test panning after a half-turn. |
| 5 | The phone-height capture hid the raptor’s eyes. The charge counter wrapped to its own row. | Raise its gaze, slim the brow, move inventory into the scanner and check action placement at 320 CSS pixels. |
| 6 | A room without a usable low wall could stall future spawns. Both species shared an attack arc, and the laser obscured its core. | Add floor-spawn fallback, a low dome-first ram, a translucent beam halo and a brief shrinking afterimage. Retest the original crystal and meadow controls during an encounter. |

From the repository root, run the following. The render and session scripts use Python Playwright and Pillow. They use installed Google Chrome, a Playwright Chromium installation, or the executable given by `CHROME_BIN`.

```sh
node scripts/test_room_map.mjs
node scripts/test_room_encounters.mjs
python scripts/room-qa/render.py ./renders/encounters roam side warning leap breach ram vapor
```

To exercise the built site, pass its room URL and a capture directory. The test enters in dense fog with a synthetic camera and depth feed. It withholds depth from half the view, checks the fog on both halves, taps a dinosaur before enclosure, then completes the room, collects a crystal, opens a meadow window, interrupts and restores tracking and depth, mutes audio, rescans and exits. Add `--shield` to capture the impact reaction as well.

```sh
python scripts/room-qa/session.py http://localhost:8000/3d/room/ ./renders/session
```

The pose renderer exports a contact sheet, individual PNGs, a stereo WAV and per-cue peak, RMS, balance and audible duration. The WAV plays the phaser, raptor warning, raptor cry, wall cracks, breach, dome warning, dome cry, shield hit and vaporization in that order. On a phone, check the cues over its speakers, try standing and seated eye heights, and walk past actual furniture to evaluate occlusion and tracking.
