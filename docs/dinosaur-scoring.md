# Hero model scoring · v2

Each hero gets a score out of 100 and three separate results for locomotion, grounding and voice synchronization. A model passes only when both ages pass every functional check on every seed. Its appearance score cannot override a failure. The [hero roster](dinosaur-hero-roster.md) keeps the modeling priority separate from both results.

## Run the audit

From the repository root, run `npm ci`, then install `Pillow==11.3.0`, `numpy==2.2.6`, `scipy==1.16.1` and `playwright==1.55.0` with Python. Use a new output directory and the same Chromium executable for a reproducible comparison.

```sh
python3 scripts/score_dinosaurs.py ./hero-review --chromium /usr/bin/google-chrome --require-pass
python3 scripts/score_dinosaurs.py ./rex-motion --species rex --checks-only --chromium /usr/bin/google-chrome --require-pass
```

The offline runner bundles the game rig, movement controllers and audio synthesizer. It records the browser version, package versions, source hashes and raw measurements in `scores.json`. Full runs save pose strips, region masks and labeled overviews. Every functional run saves the measured audio and jaw traces in the age/seed directory. `--checks-only` omits image scores. `--require-pass` returns a nonzero exit status after writing the report if any functional check fails. [Render and measurement fixture](../scripts/dinosaur_score_scene.mjs) · [Scorer](../scripts/score_dinosaurs.py)

## Functional checks

| Check | Exercise | Pass condition |
| --- | --- | --- |
| Locomotion | Drive a rescued hatchling or roaming adult down a straight, obstacle-free path with its actual gameplay controller, gait clock and root scale (.9 or 5). Run 10 s at 120 Hz and discard the first second of foot samples. | Root travels more than .3 maze units. Each load-bearing leg enters stance at least twice and achieves at least .018 model units of vertical swing excursion. |
| Grounding | Transform each pad's sole center into world space. During stance, measure its maximum horizontal distance from its first sampled contact point, including X and Z. Check lowest pad vertices for vertical contact in walking and stationary gestures, and for penetration in the pose sweep. | Maximum horizontal drift ≤ .040, absolute supporting-pad height ≤ .012, penetration ≤ .012. Distances are divided by uniform root scale. T. rex hands and the working scuff foot during its gesture are excluded from supporting-foot tests. |
| Voice synchronization | Generate a species call with the production scheduler, then render its oscillators, gain ramps and filtered noise to a 24 kHz mono OfflineAudioContext. Independently read the rendered rig's jaw hinge every 10 ms, using the note schedule sent to the game. Include .25 s of lead-in, the adult roar posture and the release. | Jaw excursion ≥ .25 radians, zero-lag correlation ≥ .73 and absolute best-fit lag ≤ 80 ms. An inaudible call or motionless jaw fails. |

For audio, take 10 ms RMS windows, normalize to the loudest window and apply a square root. Normalize the observed jaw trace by its range. Measure over the audible interval (compressed sound above .08), with up to 120 ms on either side. Search lags from −350 to +350 ms in 10 ms steps using Pearson correlation. Positive lag means the jaw trails the sound. The check measures the generated signal and the hinge motion under a shared clock. Speaker, Bluetooth and display latency are outside the fixture.

The gait exercise uses straight walking. Turning, scuffing and banking also appear in the pose evidence. A straight-walk pass is not a measurement of skating on every maze corner or at maximum catch-up speed.

## Render sample

Use seeds 271, 412 and 853 at hatchling and adult ages. Cross every seed with two lighting profiles. Studio uses neutral sky and sun intensities .85/.81. Canopy uses the maze's warm sky and sun colors, green ground bounce and sun direction, reduced to .42/.17 to simulate shade. Render both profiles with an identical transparent 192 × 192 orthographic frame of width 1.98. This isolates the model from scenery and keeps the scale constant.

Sample idle, walk, turning stride, sit, wag, sneeze, call, sniff, listen, scuff and yawn. Also sample the T. rex nose scratch. Capture 0, 20, 40, 55, 75, 95 and 100% of every action from the side, front three-quarter and rear three-quarter. Capture idle and open-mouth region masks from those three angles and head-on. Red identifies the primary species cue, green the secondary cue, blue the torso, yellow the eyes and magenta the mouth interior. For new models, register two anatomical cues before scoring.

For five species this yields **14,112 appearance frames, 480 region frames and 13,776 sampled rig poses**, in addition to the timed walking and audio tests. The staged call pose gives a repeatable mouth view. The separate voice test uses the actual species-specific timing.

## Points

Let U(x) clamp a number to [0,1]. Region fractions use the visible model area. Average each age, seed and lighting condition equally for each category, round category totals to three decimals, then sum. The timed walking and voice measurements are taken once per age/seed and shared by its two lighting conditions.

| Category | Max | Calculation |
| --- | ---: | --- |
| Identifying shape | 20 | For each anatomical cue independently, average its visible area fraction in its two clearest views. Score 10 √U(primary/.08) + 10 √U(secondary/.03). This gives small distinctive features credit and accommodates structures visible mainly in profile or from behind. |
| Skin and color | 20 | 10 max(U(C/35), U(L/65)) + 8 U(L/65) + 2 U(D/60). C measures variation in torso color, L measures light/dark variation, and D measures separation between the cues and the torso. Tonal patterning can earn full variation points on a coat with a restrained palette. |
| Face and voice | 20 | 6 U(eyes/.012) + 6 U(open mouth/.028) + 4 U(mouth gain/.021) + 4 × timing. Average visible area fractions over side, three-quarter and front. Timing is U(zero-lag correlation) × U(1−absolute lag in ms/180), or zero for a silent or frozen trace. |
| Rig and grounding | 20 | 8 U(1−contact/.035) + 4 U(1−drift/.08) + 4 U(1−penetration/.020) + 4 U(1−endpoint/.010). Endpoint is the maximum elementwise transform difference between a stationary action boundary and idle at the same clock. |
| Movement | 15 | For each non-idle action and view, measure the greatest silhouette change from its first frame (exclusive-or area divided by union area). Average U(change/.22) and multiply by 10. Add 5 U(peak scuff-foot lift/.070). |
| Thumbnail readability | 5 | Downsample silhouettes to 48 × 48 with area averaging, threshold at 100/255, and score the largest eight-connected component's share of visible pixels. A clipped or empty frame counts as zero. Average over all action images and multiply by five. |

For skin, compute C from the Euclidean length of the 10th–90th percentile spans of R−G and G−B. L is the 10th–90th percentile luminance span (.2126R + .7152G + .0722B). D is the RGB distance between median cue and torso colors. Channels range from 0 to 255. Average each metric across the three appearance angles before applying the formula.

## Fault controls and history

Run the checks-only command with `--control frozen`, `floating`, `sliding` or `late-jaw`. The controls respectively freeze the pose at idle, raise the rig .04 model units, add .12-unit horizontal oscillation during walking, or delay jaw input by 180 ms. They operate only in the audit fixture. The expected and observed outcomes for the T. rex at both ages were:

| Control | Locomotion | Grounding | Voice |
| --- | --- | --- | --- |
| Normal | Pass | Pass | Pass |
| Frozen | Fail | Fail | Fail |
| Floating | Pass | Fail | Pass |
| Sliding | Pass | Fail | Pass |
| Late jaw | Pass | Pass | Fail |

Use v2 scores for comparisons within this rubric. V1 used fewer conditions and different weights. Its original measurements and model-improvement evidence remain available. [V1 final scores](hero-quality/final.json) · [Ankylosaurus renders](hero-quality/ankylosaurus.jpg) · [T. rex comparison](hero-quality/rex-comparison.jpg)

## Calibration on the game rigs

The original routine walk on seed 271 showed as much as .354 model units of stance-foot drift. The controller now advances the gait by distance traveled, and the leg solves its ankle target in character-root space so a lateral chest shift can happen over a planted foot. The greatest drift after the change was .0053 across all ten age/species combinations.

The adult jaw previously peaked 150–240 ms behind the rendered roar. The jaw now consumes each note's synthesizer attack and follows its compressed exponential decay. Across the full three-seed set the residual lag was 0–10 ms, with zero-lag correlation of at least .914. [Adult roar timing plot](hero-quality/v2/roar-timing.png) · [Fault controls and before/after measurements](hero-quality/v2/validation.json)

For the visual comparison, read a single condition when diagnosing a coat or an angle, then compare the aggregate across all six conditions. [Three coat seeds under studio and canopy lighting](hero-quality/v2/coat-conditions.jpg)

A second Triceratops run reproduced all six published category scores and all three functional results. All 156 PNG strips (poses and masks at both ages) were byte-identical. Browser audio mixing can vary in the last few floating-point digits, so compare the published rounded scores and check outcomes when reproducing a run.

## Release results

Each score covers both the hatchling and the adult. A pass requires locomotion, foot planting and voice timing to pass on all three coat seeds at both ages. [Full measurements and source hashes](hero-quality/v2/scores.json)

| Species | Score /100 | Functional checks |
| --- | ---: | --- |
| Triceratops | 91.019 | Pass |
| Ankylosaurus | 90.366 | Pass |
| Tyrannosaurus rex | 88.102 | Pass |
| Stegosaurus | 87.828 | Pass |
| Brachiosaurus | 87.361 | Pass |
