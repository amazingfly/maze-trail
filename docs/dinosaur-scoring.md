# Hero model scoring · v1

Use the same production mesh, texture generator and pose function that the maze uses. The score describes visible detail and technical behavior under controlled conditions. Keep the recognition priority in the [hero roster](dinosaur-hero-roster.md) independent of these measurements.

## Reproduce a score

From the repo root, install the locked Node dependencies with `npm ci`. The Python packages and Chrome version used for a published run are recorded in its JSON. Use the same browser executable, software renderer, package versions and source revision for exact comparisons.

```sh
python3 -m pip install Pillow==11.3.0 numpy==2.2.6 scipy==1.16.1 playwright==1.55.0
python3 scripts/score_dinosaurs.py ./hero-review --chromium /usr/bin/google-chrome
python3 scripts/score_dinosaurs.py ./one-hero-review --species rex --chromium /usr/bin/google-chrome
```

Use a fresh output directory per revision. The runner bundles the local Babylon.js code into a temporary offline page and launches headless Chromium with SwiftShader. New species need two identification cues registered in the fixture before their first score. Preserve those definitions and the rubric across an improvement comparison. [Render fixture](../scripts/dinosaur_score_scene.mjs) · [Measurement and aggregation](../scripts/score_dinosaurs.py)

## Sampling

Each species has two equally weighted age passes. Use seed 271 at both ages, a unit root scale, the same transparent 192×192 orthographic frame of width 1.98, fixed lights, and a level root at the origin. Render side and three-quarter views of idle, walking, pivoting, sitting, wagging, sneezing, calling, sniffing, listening, ground scratching and yawning. At each angle capture 0, 20, 40, 55, 75, 95 and 100 percent. Also sample the rex nose scratch. One walk sample sequence spans a nominal species stride. For other actions the clock uses the game's gesture-duration lookup. The fixture drives a controlled single-syllable call, including the adult roar posture. It does not judge audio synthesis.

Save an RGBA strip per action (columns are time, rows are views), a labeled overview, and flat-color region renders of idle and open mouth at side, three-quarter and front views. The region pass uses the same geometry and depth test. Primary cue is red, secondary green, torso blue, visible iris/pupil/glints yellow, and visible mouth lining/tongue magenta. Independently sample 41 evenly spaced rig poses per action per age. The full roster of five produces 1,568 beauty frames, 60 region frames and 4,592 rig poses per full run.

## Points

Let U(x) clamp to [0,1]. Pixel-area fractions use the model's visible alpha footprint, averaged across the three diagnostic angles. Skin measurements use the two matching beauty images. Rig distances are hatchling model units before game scale. Compute category values for each age, average ages per category, round each category to three decimals, and sum those rounded values.

| Category | Max | Exact measurement |
| --- | ---: | --- |
| Shape and visible identifying anatomy | 20 | 12 U(primary area / .10) + 8 U(secondary area / .035). Trike uses frill and horns, stego plates and tail spikes, rex skull and short arms, longneck neck and skull, anky club and back/flank armor. |
| Skin and color design | 20 | 8 U(C/35) + 7 U(L/84) + 5 U(D/82). On visible torso pixels, C is the Euclidean length of the 10th–90th percentile spans of R−G and G−B. L is the 10th–90th percentile span of luminance (.2126R+.7152G+.0722B). D is the RGB distance between median cue and torso colors. Average each metric across both views first. Channels range from 0 to 255. |
| Face and expression | 20 | 8 U(visible eye fraction/.012) + 7 U(open mouth fraction/.028) + 5 U(positive change in mouth fraction from idle/.021). The diagnostic open-mouth pose is sampled at 55%. |
| Rig and grounding | 20 | 12 U(1−E/.035) + 4 U(1−P/.020) + 4 U(1−J/.010). E is the largest absolute supporting-pad height in stationary gestures, excluding the working scuff foot. P is the largest penetration of any padded foot across all sampled actions. J is the largest elementwise world-transform difference between a stationary action endpoint and idle at the same clock. |
| Movement | 15 | For each non-idle action and angle, take the greatest silhouette change from its first frame, measured as XOR area divided by union area. Average U(change/.22) and multiply by 10. Add 5 U(peak working-foot lift during scuff/.070). |
| Small-screen readability | 5 | Downsample each silhouette to 48×48 with area averaging, threshold at 100/255 and find eight-connected components. Take the largest component's share of foreground pixels. A clipped full-size frame or empty thumbnail gets zero. Average over all beauty frames and multiply by five. |

The scripts specify thresholds, pixel masks and the exact mesh names. Keep both ages' raw metrics and the decomposed score in `scores.json`; use the image strips to diagnose a weak category before editing a model. Re-run the entire roster for comparison after changing a fixture, weight, camera, seed or cue definition.

## First audit and improvement

The baseline is commit `ff31216`. Keep the full-precision measurements when comparing versions. On Chrome 155.0.8059.39 with SwiftShader, two final full-roster runs produced identical per-age metrics. The isolated T. rex rerun also matched its full-roster result. The calibrated camera includes the entire club in adult side views. [Baseline data](hero-quality/before.json) · [Final data, tool versions and source hashes](hero-quality/final.json)

| Hero | Before /100 | Final /100 | Final place |
| --- | ---: | ---: | ---: |
| Triceratops | 92.289 | 92.289 | 1 |
| Ankylosaurus | 91.783 | 91.099 | 2 |
| T. rex | 85.779 | 89.410 | 3 |
| Stegosaurus | 86.894 | 86.894 | 4 |
| Brachiosaurus | 86.793 | 86.793 | 5 |

The initially lowest model was T. rex. Its short arms disappeared into its olive chest, particularly on the adult. Moving the shoulder sockets outward and spreading the two fingers increased the visible adult arm fraction from 1.61% to 3.45%. A warmer muzzle, stronger flank stripes and a slightly softer adult brow improved separation at maze distance. The skin category rose from 12.045 to 13.601 and the shape category from 17.845 to 19.940. Rig points stayed at 19.535. [Before and after, same camera and pose](hero-quality/rex-comparison.jpg)

Ankylosaurus received a separate art pass. The rounded tiles and bright club in the first build looked like separate beads. The release uses overlapping, tapered, keeled armor and a textured two-lobed club with a thickened handle. This reduced its total by 0.684, largely by reducing accent contrast. We retained the revision because the armor and club read as parts of the animal. [Hatchling and adult renders](hero-quality/ankylosaurus.jpg)

## What the score measures well, and what to change next

The two control runs below alter pose playback only in the offline fixture. Repeat the subset command with `--control frozen` or `--control floating` and a separate output directory.

| T. rex control | Total | Evidence |
| --- | ---: | --- |
| Production rig | 89.410 | Motion 13.405/15 and rig 19.535/20. |
| Freeze all joints at idle | 66.072 | Motion drops to 0 and face falls to 7.531 because the jaw stays closed. Rig increases to 20 because stationary feet and endpoints are perfectly consistent. |
| Raise the entire rig .04 units | 78.376 | Rig falls to 8 because supporting pads visibly float. Tiny changes in projection slightly increase some appearance measurements. |

The frozen model demonstrates why a high total alone is a poor release criterion. For a v2 rubric, report an explicit locomotion/grounding result alongside the total. Add stance-foot horizontal drift and a timed audio-to-jaw alignment check. The current tests measure vertical pad contact, sampled pose transitions and mouth visibility. [Frozen measurements](hero-quality/frozen.json) · [Floating measurements](hero-quality/floating.json)

The shape and color scores favor large, contrasting features. The ankylosaur armor revision and the low cue contrast of the naturally uniform longneck expose that bias. Before reweighting those categories, run a blinded picture-matching exercise using shuffled, unlabeled silhouettes from several angles. Record child recognition accuracy and which species are confused. Also sample more coat seeds, rear views and dim maze lighting. Keep v1 scores comparable until a replacement has been calibrated across the full roster. The 0.101-point gap between Stegosaurus and Brachiosaurus is reproducible on this fixture but gives little basis for preferring one's overall art.
