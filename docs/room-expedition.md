# Room Expedition

Room Expedition uses an Android browser's WebXR immersive AR session. On supported Android devices, Chrome gets six-degree-of-freedom tracking and camera passthrough from ARCore. The session requires CPU depth and a DOM overlay. A phone that reports immersive AR opens Room Expedition from the main 3D link. The room page has a maze fallback, and printed page links open their original maze.

Start in a lit room and sweep the floor, ceiling and walls while moving the phone slowly. Look at a black crystal and tap to collect it, or approach it on a clear floor. Aim at a scanned wall and tap **Blast wall**. If the far side has been surveyed, the window shows its reconstructed surfaces from the current viewing position. An unscanned far side stays misty until it is scanned via a real doorway. Select **Meadow view** before blasting an exterior wall to reveal the outdoor herd. The browser cannot identify the far side of a previously unseen wall from its depth image. The blast, opening and rubble are game graphics over the actual wall.

## How mapping works

- Every 130 ms, sample a 38×32 grid of CPU depth, unproject camera-plane distances with the view projection, and transform them into the tracked local reference space. Use neighboring rays to estimate surface normals and discard unreliable samples at depth discontinuities.
- Quantize measurements to 5 cm and store their accumulated support in sparse 26 cm surface tiles. Each candidate takes repeated samples to become visible. Depth behind an old tile votes to remove it, after four clear observations. Foreground obstacles and invalid depth supply no removal evidence. Measurements are bounded to 12 m from the session origin.
- Validate the nearby floor and ceiling, then flood the horizontal grid from the tracked position and look for gaps in its wall boundary. A room needs three consecutive enclosed evaluations to spawn charges. The percentage describes the current scan. An opened door can break the enclosure until the neighboring area is mapped. A reference-space reset clears old alignment and requests a fresh scan.
- Keep the map updating after the first enclosure. Rebuild shared surface geometry as evidence changes, and keep virtual blast openings in their tracked planes. View windows use off-axis projection through the physical location of the opening. Rendering concentrates on nearby openings and caps active windows and dinosaur counts for phone GPUs.

All room geometry is held in the page's memory for the current session. Raw camera frames and depth are provided locally by the browser. Reset or exit clears the map.

## Verification

Run `node scripts/test_room_map.mjs` from the repository root. The test derives synthetic perspective depth for a closed room, a misregistered wall, a door that opens and an adjoining room. It uses the same unprojection, surface fusion and enclosure validation as the game.

On a physical compatible phone, test camera permission, a complete sweep and the difference between a closed and newly opened door. Check that the reticle and crystals stay attached to the scene while walking and that opening an exterior view shows parallax on a sideways step. Chrome's support for the chosen depth features can only be confirmed when an immersive session is requested.
