# Building and reviewing Maze Trail dinosaurs

The models are procedural Babylon.js meshes with a transform rig. The source of truth is [hatchling.mjs](../site/3d/hatchling.mjs). The game instantiates the rigs directly. The [lineup](https://amazingfly.github.io/maze-trail/3d/dinosaurs/) exercises the same rigs with common lighting, a level ground plane, and several camera angles.

## Start from a known model

Pick the closest body plan from the table below. Assemble a hatchling using its reference dimensions and existing pose code. Change the proportions that identify the new animal, then compare the unadorned silhouette, feet and open mouth against the first-pass reference. Once those work, add the coat and ornaments, derive the adult from the same rig, and review the actions affected by the new anatomy.

These are actual hatchling dimensions in local model units. The ribcage is centered at `[0, torsoY, .002]`. Upper/lower limb values are vertical joint offsets. The leg solver also accounts for the small forward offsets between joints.

| Starting model | Torso Y | Rib half-width / height / length | Skull half-width / snout parameter | Upper / lower load-bearing limb | Tail length |
| --- | ---: | --- | --- | --- | ---: |
| Triceratops | .288 | .138 / .125 / .216 | .113 / .128 | .126 / .123 | .335 |
| Stegosaurus | .288 | .138 / .125 / .216 | .092 / .110 | .126 / .123 | .473 |
| T. rex | .355 | .123 / .125 / .205 | .121 / .150 | .155 / .149 | .535 |
| Brachiosaurus | .355 | .138 / .125 / .216 | .087 / .119 | .168 / .160 | .401 |

For example, start a new long-necked quadruped with the Brachiosaurus trunk and legs. Put the neck pivot at `[0, torsoY + .045, .136]`. Place the hatchling skull at `[0, .344, .124]` relative to that pivot. Sweep the neck through intermediate rings up to the skull socket. Change the neck endpoint and ring centers together. Freeze a listening tilt and a yawn before adding markings. A gap at the skull on either pose means the terminal ring and skull socket need more overlap.

[First-pass reference sheet — hatchlings on the left, adults on the right](dinosaur-reference.jpg)

## Build a species

1. Define the species name, skin palette, accent, iris, gait rate, and voice pitch in [hatchling-play.mjs](../site/3d/hatchling-play.mjs). Add the adult coat in `hatchling.mjs`, an adult movement profile in `trailhead-motion.mjs`, and a voice in `JungleAudio.adultRoar`. The lineup needs a species option, space in the camera framing, and a gesture for its slot. Check rescue assignments when changing the catalog size. The level lookup uses `(level + 2) % kinds.length`, so appending a species can also change existing assignments.
2. Build at hatchling scale. The origin is on the ground under the torso, positive Y is up, and positive Z is forward. The center of each shoulder and hip must be above its planted foot. The in-game hatchling root is scaled to 0.9 of the modeling unit. The lineup uses scale 1 for babies and 5 for adults.
3. Establish the silhouette before detailing. Use ellipsoids for ribcage, hips, and fleshy limbs. Use cross-section sweeps for the skull and muzzle, neck, tapered tail, horns, and plates. Grow the muzzle from the skull sections so it has a continuous surface. Nest ornament meshes into the underlying flesh and rotate them about their insertion point.
4. Give the species one profile feature and one front or rear feature. The Triceratops has a horned frill with markings behind it. The Stegosaurus has alternating plates and paired tail spikes. The T. rex has a broad muzzle, teeth, short arms, and large hind feet. The Brachiosaurus has a curved neck that rises from a high shoulder.
5. Keep color variation at two scales. The individual seed creates a small pebbled scale texture. Vertex colors add larger pigment patches, markings, and a lighter underside. Inspect the texture from both near and far so scale contrast does not overwhelm the eyes or disguise joints. Add ornaments only where they help the species read.

In the constructor, build rounded masses with `hide(name, parent, center, halfExtents, profile)`. It shapes a sphere and applies the shared skin material and vertex colors. Use `solid` for parts with their own material, such as teeth and eyes. For the skull, neck and tail, pass `sweep` a sequence of local `[centerX, centerY, centerZ, widthRadius, heightRadius]` sections. Begin the first neck ring inside the shoulder and narrow the final skull rings toward the muzzle. Adult rib radii are 1.17× the hatchling values before the 5× root scale. Tail length grows by 1.23× before root scaling. These ratios preserve the existing age progression.

For a new species, trace the closest existing anatomy through both the constructor and `pose`. For example, a second short-armed biped needs the T. rex limb placement, free-arm branch, hind-foot scratch and two-legged gait. The current code selects those with `kind === 'rex'`. Share the biped condition across those branches while keeping rex-specific teeth, stripes and voice attached to their own species. Otherwise a similar-looking biped can still animate as a quadruped.

| Signature feature | Construction used on the reference |
| --- | --- |
| Triceratops frill and horns | Put the broad frill and inset on the skull behind the eyes, then add paired brow horns and a nose horn as tapering sweeps. Check their roots with the head pitched down. |
| Stegosaurus plates and spikes | Mount seven beveled plates on the body, alternating sides along Z. Attach each tail spike to a pivot sampled along the deforming tail. Review the plates edge-on and the spikes from behind. |
| T. rex snout and hands | Widen the middle skull rings and extend the snout. Place upper teeth under the skull, then build the two short free arms under the chest. Check tooth clearance with the jaw open and hand reach with the muzzle lowered. |
| Brachiosaurus neck | Place the thickest neck ring inside the shoulder, curve the narrowing rings upward and forward, and parent the dorsal neck scales to the neck. The adult skull pivot rises to .454 above the neck base. |

For repeatable skin, use `shade` for broad pigment differences and `scaleTexture(scene, seed)` for fine texture. The latter draws a staggered 16 × 16 field of jittered pebbles into a 128 × 128 tile, including copies at the edges for wrapping. Keep the same seed while tuning anatomy or comparing materials. Change the seed afterward to verify that individuals vary while the species markings still read.

Use the same seed and pose to compare coat changes in the lineup, then check the trailhead in gameplay lighting. The Triceratops and Brachiosaurus use dapples, the Stegosaurus has warm bands, and the T. rex has stripes with ochre edges. The seed shifts the pattern and varies the pebble shapes. For adults, use one or two tapered healed marks on a single flank. Sample the ribcage profile for each point and parent the mark to the ribcage so it moves with the skin.

Check the bare muzzle in front and profile. On the Triceratops and Stegosaurus the keratin cap grows from a wide muzzle section and turns down at the tip. The Brachiosaurus has a fleshy snout. In side and rear views, check the width of each Stegosaurus plate from root to tip. Carry the cross-section axis through the bend when building a sweep. Recomputing it from world up can twist a plate as its tangent passes through vertical.

Duplicate the first vertex of each textured ring at the far edge of the UV map. Connect the last face to that copy, use a whole number of repeats around the ring, and average both seam normals after deformation. Inspect a dark coat under side lighting to catch both stretched scales and lighting seams.

## Rig the character

- Use the root for world position, heading, and uniform scale. Place torso, tail, shoulders, and hips under the body node so the body can shift its weight as one unit.
- Use a shoulder → knee or wrist → ankle or hand chain per limb. Rest translations define upper and lower limb lengths. Put each foot under its ankle. Rotate the knee and ankle to verify they bend about the socket with the foot pointing forward.
- Put the head under the neck, and the jaw under the head. The jaw pivot sits behind the muzzle and slightly above the lower jaw. Positive jaw rotation opens the mouth in this rig. Parent the inner mouth and tongue to the jaw, the upper muzzle and teeth to the skull. The flexible throat mesh is parented to the skull at the hinge. Its upper rim stays fixed while the lower rim vertices follow the jaw angle.
- Keep the tail as a single tapered mesh. Save rest vertex positions. Compute each ring's offset from distance along the tail, apply it to the rest positions, and recompute the normals with the scene's right-handed convention. Attach tail ornaments using the same bend curve so spikes follow the surface. Preserve their rest attachment coordinates, apply shortening along Z as well as bend in X and Y, and align them with the deformed tangent. Check both extremes of a wag from the rear.
- Keep render meshes and effects scoped to the Babylon scene. When adding a part, check that a character restart disposes its per-character material and texture and creates a fresh rig.

### Joint placement and attachments

The rig uses Babylon `TransformNode` pivots and parented meshes. Model in each pivot's local coordinates. X rotation pitches the muzzle, Y turns it left or right, and Z rolls it. Angles passed to the rig are radians.

| Attach to | Build in this local frame | Quick check |
| --- | --- | --- |
| Body | Attach paired shoulders and hips at X ±.097, forelimb Z .121 and hindlimb Z −.103. Place the joint at Y .237 for the short quadrupeds, .318 for Brachiosaurus, or .287 for the T. rex hips. | Rotate the body and check that the feet can still reach the floor at the high hip. |
| Upper limb → lower limb → ankle | Put the knee at `[0, -femur, .007]` and ankle at `[0, -shin, .010]` for a load-bearing leg. Parent the pad and toes to the ankle. Keep the pad origin .003 below the ankle and its vertical radius .030. The IK target is consequently .033 above the floor. | If changing foot thickness, update the ankle target. Include socket offsets when calculating rest angles and lengths. |
| T. rex shoulder → wrist → hand | Start the short arm at `[±.094, .397, .121]`. Use upper and lower vertical offsets .060 and .050. Set the forelimb's `arm` flag and use the separate arm rotations in `pose`. | Scrub a nose scratch in profile. The hand should meet the muzzle as the head dips. |
| Skull → jaw | Set the hinge to `[0, -.049, -.028]` in skull space. Build the lower muzzle forward of it. Store the throat's rest rim so each jaw angle can be evaluated independently. | Open the jaw for a call. The tongue should travel with it and the cheek lining should bridge the opening. |
| Skull → eye socket → blink pivot → gaze pivot | Put the brow on the socket and the eye white on the blink pivot. Put iris, pupil and both glints together on the gaze pivot. Keep the nostril mesh on the muzzle. | Freeze a blink and then a listening glance. The glints should stay on the iris through both movements. |
| Tail base | Place it at `[0, torsoY + .003, -.158]`. Build 14 tapering rings, save a copy of the rest vertices, and apply each frame's bend to that copy. | Check the Stegosaurus spikes at both wag extremes. |

Add torso, neck, skull and load-bearing limb meshes to `collisionMeshes` as you construct them. The game derives collision volumes from their transformed bounds and samples the bent tail separately. Walk alongside a leg and the tail after changing proportions. [Gameplay collider implementation](../site/3d/world.mjs)

## Animation inventory

`Hatchling.pose(time, options)` evaluates a pose at a given time. The gait clock is independent of time and the action clock. In the recipes below, percentages refer to progress through one gesture, from 0 to 1. For a one-shot, use a positive duration and evaluate `(time - actionAt) / duration` while active. Pass zero progress when idle. Write each transform from its rest value or from a base pose calculated in the same frame. This makes scrubbing backwards, pausing, and interrupting a gesture reproducible.

| Motion and driver | How to build it | Where to check it |
| --- | --- | --- |
| Breathing and resting sway · continuous | Apply a sine to torso height (amplitude .005) and width/height (about 1%). Use 2.7 radians/s for babies and 1.65 for adults. Give head pitch, yaw and tail sway separate rhythms. | Three-quarter Idle, both ages |
| Blink · continuous | Every `3.37 + gait × .7` seconds, run a .17-second half-sine that compresses the blink pivot's Y scale to 9% and restores it. Multiply by the adult resting eye height .74 where applicable. | Front Idle, then a yawn to see the squint layered with the blink |
| Walk · `walk`, `gaitTime` | Offset opposite legs by half a stride and quadruped forelegs by another .42. Move a planted foot rearward through the first 62% of the cycle (71% for adults). Ease forward and lift in a sine arc during swing. Solve knee and ankle after torso movement. | Side Walk cycle, compare two successive phases |
| Turning and pivoting · `bank`, `pivot` | Bank the torso and turn the head into the curve. Blend forward foot travel toward opposite signed travel on the two sides as pivot effort increases. Counter-rotate the ankle against torso pitch and roll. | Turning stride for banking, trailhead adults for an in-place pivot |
| Looking and surveying · `interest` | Add gaze yaw to the skull. On adults, distribute a slow scan across neck and chest, shift hip weight, and ease the scan down while a gesture takes over. Add the species accent as a frill dip, stegosaur sway, rex chest turn, or long-neck sweep. | Adult Idle and roaming at the entrance |
| Sit · `sit` | Ease in and out over the outer 27% of the action. Lower the body .072, pitch it −.14, and lower the tail tip. Move forefoot targets forward .039 and rear targets .093 as the knees fold. | Side Sit, check the pads throughout the descent |
| Tail wag · `wag` | Run 2.45 side-to-side cycles inside the eased gesture. Add small roll and yaw at the body with a phase lead. Bend the tail from its rest vertices, weighting sideways displacement by distance from the base to the power 1.5. | Rear Gestures, hatchling Stegosaurus |
| Sneeze · `sneeze` | Lift the torso in anticipation. Snap head pitch at 47%, briefly open the jaw at 49%, then recoil at 58%. Layer a small head shake and eye squeeze. Trigger the companion sneeze sound once at 43%. | Gestures, hatchling Triceratops |
| Arm swing and nose scratch · `scratch` | Give the rex shoulders a small idle swing and add stride-driven swing when walking. For the scratch, move the positive-X shoulder forward .042, bend shoulder and wrist, rotate the hand up, and lower the muzzle toward it. Oscillate the reach while the pose is held. | Gestures, hatchling T. rex |
| Chirp · `voice` | Schedule notes with start offsets and durations. Pass the same notes to the sound generator and `voiceEnvelope`. Open the jaw with the envelope of each syllable and update the throat rim when the hinge angle changes. | Hear call, test each species |
| Roar · `roar` plus `voice` | Lift the head and chest, move front and rear foot targets apart, and drive jaw opening from the roar pose plus the note envelope. The species voice table supplies the timing for both audio and jaw. | Hear roar, adult lineup |
| Sniff the air · `sniff` | Hold a neck lift and pulse two inhales at 32% and 64%. Make the second broader and weaker. Expand the chest, flare the nostrils and tip the muzzle on each pulse. Transfer more of the pitch to the skull on the longneck. | Profile Sniff, 2.35 s for a baby |
| Listening tilt · `listen` | Choose a side from the seed. Start with the eyes and one brow. Begin the tilt at 8%, weight shift at 18% and opposite tail bend at 24%. Ease each layer back on its own timing. | Front and rear Listening tilt, 2.8 s for a baby |
| Ground scratch · `scuff` | Choose a forefoot on a quadruped or a hind foot on the rex. Lift during 10–44%, reach forward, then pull back along the floor during 42–69%. Lift again during 70–94% to reset. Drive a single foot target through the leg solver. Tip the gaze toward the paw, shift weight and raise the rex arms for balance. | Side Ground scratch, 2.5 s for a baby |
| Sleepy yawn · `yawn` | Droop the eyes, start opening the jaw at 9%, and reach full gape around 53%. Expand the chest and curl the tongue. Start the exhale at 58%, close the jaw by 88% and let the head and tail settle. | Front and side Sleepy yawn, 3.25 s for a baby |

The last four actions use the same duration table in gameplay and the lineup. Adults take 1.27 times as long. To add another interruptible idle gesture, register its name and seconds in `hatchling-play.mjs`, include it in the appropriate companion repertoire, and add a pose option in the lineup HTML. In `pose`, multiply its contribution by the idle weight so a companion can begin walking while the gesture fades. Test a sprint midway through the action. [Gesture scheduling](../site/3d/hatchling-play.mjs) · [Lineup controls](../site/3d/dinosaurs/index.html)

## Author and check motion

`Hatchling.pose(time, options)` consumes elapsed seconds, gait time, walk amount, turn bank, gaze interest, gesture progress, and voice amplitude. The game owns movement and collision. The rig converts those inputs into poses.

- Use normalized stride phase for foot position. During stance, move the foot rearward while keeping it planted. During swing, ease it forward and lift it in an arc. Offset the opposite limbs and the front pair so they share the load. Solve upper and lower leg angles using the two segment lengths. Counteract body pitch and bank at the ankle so grounded feet stay level.
- Keep gaze, tail, and breathing on separate rhythms from the feet. Ease into and out of sits, wags, scratches, and sneezes. Check entry and exit poses in addition to the most expressive frame. When changing the sit depth, check that forefeet stay braced and the rear feet do not pass through the floor.
- For adults, change proportions before dialing down motion. Broaden the torso and feet, lengthen the species silhouette, shrink and recess eyes, darken the mouth, and emphasize brow and jaw. Use longer stance phases, lower swing arcs, slower gait timing, and restrained head bob. For the roar, brace the limbs and lift the head and throat as the jaw opens.
- Build sounds in [sound.mjs](../site/3d/sound.mjs). Hatchling calls are short pitched syllables and a little filtered noise. Adult calls combine a lower fundamental, subharmonic, rasp, and longer envelopes. Feed the same note timings to `voiceEnvelope` so the visible jaw follows the audible call.

Check planted pads numerically when changing leg lengths or body bob. During the stance portion of a turning walk, transform the vertices of each padded foot into character-root space and record its lowest Y. A positive value is clearance and a negative value is floor penetration. Exclude airborne feet and T. rex forearms. Test multiple gait phases at both ages. The solver includes the forward offsets of the knee and ankle sockets, torso scale, pitch and bank, and the thickness under the ankle. Leave enough leg length for full extension at the highest hip position.

For a numerical reference, the current ground scratch and yawn were sampled at 61 evenly spaced points per action, per species, per age (976 poses). The largest absolute error of a supporting pad from floor height was .00089 model units. The working foot reached about .077 units above the ground for hatchlings and .065 for adults, after factoring out root scale. To repeat the comparison on level ground, pose the model with `walk = 0`, sample the lowest transformed Y vertex of each padded foot, and divide out uniform root scale. Separate the working foot from supporting pads during its two lifts. At progress 0 and 1, compare local joint transforms to Idle at the same time and gaze. A mismatch there predicts a pop when the action starts or ends.

Review a call head-on at maximum opening. Anchor the top edge of the U-shaped throat lining to the skull and rotate the bottom edge with the jaw. Check that the lining connects the upper and lower surfaces, and the tongue should read as flesh under both scene lights.

The trailhead adults share the same rig as the lineup. Their short walks and pauses are driven by `trailhead-motion.mjs`. Pass gait time, walking effort, gaze and pivot effort into the pose. When turning in place, the feet on opposite sides step in opposite directions. Inspect the neck leading the turn, chest and hips shifting weight, and tail following through. Verify the collision shapes after moving the root.

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

For a faster first comparison, capture only the reference poses into a separate directory.

```sh
python3 scripts/render_dinosaur_lineup.py \
  http://localhost:8000/3d/dinosaurs/ ./dinosaur-first-pass --reference
```

Open its `dinosaur-reference.jpg` alongside the checked-in sheet. Both use the same viewport, lights, orthographic camera and individual seeds (`271 + speciesIndex × 29`). The four rows isolate the silhouette in idle, foot placement during a stride, mouth construction during a call, and the reach of one limb during a ground scratch. The adults are framed to fill their own column. Use the lineup’s **Adults and hatchlings** view to judge relative size.

| First visible problem | Check this first |
| --- | --- |
| Foot floats or sinks during stance | Pad thickness, ankle height, segment reach and the order of body transforms before IK |
| Head separates from neck in a yawn | Last neck ring and skull rest pivot |
| Open mouth shows daylight through the back | Upper throat rim attachment, lower rim hinge transform and lining normals |
| Iris or glint slips during a blink | Parent order of socket, blink pivot and gaze pivot |
| Tail spikes slide or twist during a wag | Ring displacement, Z shortening and tangent used by the spike pivot |
| Idle looks correct but an interrupted gesture snaps | Pose at progress 0 and 1 against Idle at the same time, then gesture weight during a sprint |

The capture script also accepts `--chromium` for an existing Chromium installation. It saves idle, two walking phases, turning, front call, sitting, rear gesture, sniffing, listening, ground scratch, yawn, and size-comparison images. A lineup URL ending in `#time=0.32` holds the pose at 0.32 seconds. Remove the fragment to resume motion. Use the same timestamps and camera angles before and after each edit. Review at least the front, side, and rear for each change. In the second pass, look for feet slipping or floating, abrupt hip or jaw motion, facial features clipping at the end of a gesture, and horns or plates overlapping on turns. Repeat the capture after fixing anything visible. The lineup is a measuring stage. Check gameplay spacing with the actual maze camera before changing character scale or hit testing.
