# Building and reviewing Maze Trail dinosaurs

The models are procedural Babylon.js meshes with a transform rig. The source of truth is [hatchling.mjs](../site/3d/hatchling.mjs). The game instantiates the rigs directly. The [lineup](https://amazingfly.github.io/maze-trail/3d/dinosaurs/) exercises the same rigs with common lighting, a level ground plane, and several camera angles.

## Build a species

1. Define the species name, skin palette, accent, iris, gait rate, and voice pitch in [hatchling-play.mjs](../site/3d/hatchling-play.mjs). Add the species to the adult coat and roar tables, then check the lineup selector and row lengths. Preserve existing species order if adding a species to an existing level catalog. The game uses the order to choose which hatchlings appear.
2. Build at hatchling scale. The origin is on the ground under the torso, positive Y is up, and positive Z is forward. The center of each shoulder and hip must be above its planted foot. The in-game hatchling root is scaled to 0.9 of the modeling unit. The lineup uses scale 1 for babies and 5 for adults.
3. Establish the silhouette before detailing. Use ellipsoids for ribcage, hips, and fleshy limbs. Use cross-section sweeps for the skull and muzzle, neck, tapered tail, horns, and plates. Grow the muzzle from the skull sections so it has a continuous surface. Nest ornament meshes into the underlying flesh and rotate them about their insertion point.
4. Give the species one profile feature and one front or rear feature. The Triceratops has a horned frill with markings behind it. The Stegosaurus has alternating plates and paired tail spikes. The T. rex has a broad muzzle, teeth, short arms, and large hind feet. The Brachiosaurus has a curved neck that rises from a high shoulder.
5. Keep color variation at two scales. The individual seed creates a small pebbled scale texture. Vertex colors add larger pigment patches, markings, and a lighter underside. Inspect the texture from both near and far so scale contrast does not overwhelm the eyes or disguise joints. Add ornaments only where they help the species read.

## Rig the character

- Use the root for world position, heading, and uniform scale. Place torso, tail, shoulders, and hips under the body node so the body can shift its weight as one unit.
- Use a shoulder → knee or wrist → ankle or hand chain per limb. Rest translations define upper and lower limb lengths. Put each foot under its ankle. Rotate the knee and ankle to verify they bend about the socket with the foot pointing forward.
- Put the head under the neck, and the jaw under the head. The jaw pivot sits behind the muzzle and slightly above the lower jaw. Positive jaw rotation opens the mouth in this rig. Place the tongue and lower lining under the jaw and the upper muzzle and teeth on the head.
- Keep the tail as a single tapered mesh. Save rest vertex positions. Compute each ring's offset from distance along the tail, apply it to the rest positions, and recompute the normals with the scene's right-handed convention. Attach tail ornaments using the same bend curve so spikes follow the surface.
- Keep render meshes and effects scoped to the Babylon scene. When adding a part, check that a character restart disposes its per-character material and texture and creates a fresh rig.

## Author and check motion

`Hatchling.pose(time, options)` consumes elapsed seconds, gait time, walk amount, turn bank, gaze interest, gesture progress, and voice amplitude. The game owns movement and collision. The rig converts those inputs into poses.

- Use normalized stride phase for foot position. During stance, move the foot rearward while keeping it planted. During swing, ease it forward and lift it in an arc. Offset the opposite limbs and the front pair so they share the load. Solve upper and lower leg angles using the two segment lengths. Counteract body pitch and bank at the ankle so grounded feet stay level.
- Keep gaze, tail, and breathing on separate rhythms from the feet. Ease into and out of sits, wags, scratches, and sneezes. Check entry and exit poses in addition to the most expressive frame. When changing the sit depth, check that forefeet stay braced and the rear feet do not pass through the floor.
- For adults, change proportions before dialing down motion. Broaden the torso and feet, lengthen the species silhouette, shrink and recess eyes, darken the mouth, and emphasize brow and jaw. Use longer stance phases, lower swing arcs, slower gait timing, and restrained head bob. For the roar, brace the limbs and lift the head and throat as the jaw opens.
- Build sounds in [sound.mjs](../site/3d/sound.mjs). Hatchling calls are short pitched syllables and a little filtered noise. Adult calls combine a lower fundamental, subharmonic, rasp, and longer envelopes. Feed the same note timings to `voiceEnvelope` so the visible jaw follows the audible call.

## Reproduce the render review

Build from the repository root and preview it locally.

```sh
npm ci
review_dir="$(mktemp -d /tmp/maze-dinosaur-review.XXXXXX)"
python3 scripts/build_site.py --output "$review_dir"
python3 -m http.server 8000 --directory "$review_dir"
```

Open `http://localhost:8000/3d/dinosaurs/`. The stage shows the four species together and supports hatchlings, adults, and a scale comparison. Select each view and motion. Use **Hear call** or **Hear roar** to test one species. The sound button also drives the selected animal's jaw. In the maze, separately test a greeting and a recruited hatchling turning a corner.

To save the lineup sheets, run this in a second terminal with Pillow and Playwright installed.

```sh
python3 -m pip install Pillow playwright
python3 -m playwright install chromium
python3 scripts/render_dinosaur_lineup.py \
  http://localhost:8000/3d/dinosaurs/ ./dinosaur-renders
```

The capture script also accepts `--chromium` for an existing Chromium installation. It saves walking, front call, sitting, rear gesture, and size-comparison images. Review at least the front, side, and rear for each change. In the second pass, look for feet slipping or floating, abrupt hip or jaw motion, facial features clipping at the end of a gesture, and horns or plates overlapping on turns. Repeat the capture after fixing anything visible. The lineup is a measuring stage. Check gameplay spacing with the actual maze camera before changing character scale or hit testing.
