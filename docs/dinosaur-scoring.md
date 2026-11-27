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
