# Maze Trail

Maze Trail is a static GitHub Pages site for the QR codes printed by MazeGen. Each printed link opens its matching maze in tracing mode. Drag the star to the flag or the yellow dot to the star. You can also tap a connected space or focus the board and use the arrow keys. The trail follows open passages. The circular arrow resets it. The animated maze button opens the solution, where readers can pause, change speed, scrub through the route, replay it, or show the full path. The back button restores their own trail. With reduced motion enabled, the solution appears immediately. Use the dice button to open a random maze by difficulty. The selector uses the maze IDs from the latest exported production manifest. Tap **Full screen** for an expanded board. Use **+** and **−** to zoom. Grab near the player to trace and recenter on release. Drag anywhere outside the tracing target to pan the board.

The QR uses MazeGen’s printed `mz1_` page ID. That ID is a hash of the archived print edition. Each ID has one small JSON record with geometry, open passages, and the placement of its archived illustrations. The browser draws the walls, loads the original SVG artwork for that edition, and solves the passage graph using breadth-first search. Shared illustrations are stored once. The interactive solver runs in the browser. The site also links to the production book PDF from the footer.

## Preview

From this directory, install the locked npm dependencies, build into a fresh folder, and serve it.

```sh
npm ci
preview_dir="$(mktemp -d /tmp/maze-trail.XXXXXX)"
python3 scripts/build_site.py --output "$preview_dir"
python3 -m http.server 8000 --directory "$preview_dir"
```

Open `http://localhost:8000/` for the example or `http://localhost:8000/maze/mz1_t5vc6q2ixcw2ye2q2ozzkshfhu/` for its printed route.

## GitHub Pages

The public site is [Maze Trail](https://amazingfly.github.io/maze-trail/). The QR prefix for this deployment is `https://amazingfly.github.io/maze-trail/maze`.

The workflow in `.github/workflows/pages.yml` builds the static pages from the checked-in records on pushes to `main`. In the destination repository’s **Settings → Pages**, select **GitHub Actions** as the publishing source. The build creates a real `/maze/<page-id>/` page for every exported ID and works under a repository path such as `/maze-trail/`. See [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Add mazes to a book

Render the print pages with the verified live Pages URL as the QR prefix, including `/maze`. For a project site, the command looks like this from the MazeGen directory.

```sh
python3 -m mazegen render work/heart.json work/heart-web.pdf \
  --qr-base-url https://amazingfly.github.io/maze-trail/maze
```

MazeGen appends `/<page-id>` and writes the archived page to its page library. The default QR payload when no URL is supplied is plain `maze:mz1_…` text. Replace that payload by rendering with the live URL before printing the book.

From this repository, export the archived pages and commit the resulting JSON and SVG files on `main`.

```sh
python3 scripts/export_mazes.py
```

The exporter defaults to `../mazeGen/page-library`. Pass `--mazegen` for another MazeGen checkout, `--library` for a custom archive, or one or more printed IDs to export only those pages. Old records remain available when exporting a new batch so previously printed codes still work. Check a QR scan from the final print proof against the deployed site before printing.

### Change the selector’s production run

From this repository, export the maze pages listed in the book’s production manifest.

```sh
python3 scripts/export_mazes.py --production-manifest ../mazeGen/production/dinosaur-mazes/manifest.json
```

Commit the exported records and `site/data/selector-pages.json`. The build uses that list for the random selector. Every previously exported QR route is still built.


### Dinosaur Adventures title page

The printed title-page QR points to [100 Wonder Mazes: Dinosaur Adventures](https://amazingfly.github.io/maze-trail/books/dinosaur-adventures/). Its book catalog stores the printed page numbers and IDs independently of the random selector. To update the catalog while finalizing this edition, export the matching production manifest.

```sh
python3 scripts/export_mazes.py \
  --library ../mazeGen/production/dinosaur-mazes-final/page-library \
  --production-manifest ../mazeGen/production/dinosaur-mazes-final/manifest.json \
  --book-catalog site/books/dinosaur-adventures/catalog.json
```

## Dinosaur Adventures in 3D

[Play the first-person game](https://amazingfly.github.io/maze-trail/3d/), or link directly to a printed page with `/3d/?page=2`. The Pages build generates the 3D level picker from the Dinosaur Adventures book catalog and serves the same maze records used by the 2D QR routes. The game reads the printed wall paths, cell polygons, and openings directly.

Move with WASD or the up and down arrow keys. Desktop play opens fullscreen and captures the mouse where the browser allows it. Phones default to **Motion view**, where turning or tilting the phone aims a single camera. Allow orientation access when prompted. The joystick moves in fixed map directions in this mode. Choose **Fullscreen** or **In browser** for drag-to-look controls. The browser remembers your display choice. You can drag to look, use the left and right arrow keys, or select **Mouse look** to capture the mouse. Hold Shift to jog. On touch screens, drag the joystick to move. Drag the scene to look when orientation data is unavailable. Tap **Center** in Motion view to reset your heading. Press M for the map, H for footprints, and Esc to open or close the pause menu. From there you can change display and mouse settings, resume, restart, or quit to the maze picker. Finished pages are saved in the browser.

The game code lives in `site/3d/`. Change materials and landmark models in `world.mjs`; collision and routing use the separate `layout.mjs`. The build bundles Babylon.js and selects WebGPU when it initializes successfully. It falls back to WebGL if WebGPU fails to start or the graphics device is lost. Add `?renderer=webgl` to force WebGL when testing. Babylon.js is pinned in `package-lock.json`, and the browser loads the bundled engine from the same site.

### 3D exploration

Press Space to jump. Black crystals supply charges. B equips or puts one away, and F or a click while aiming places it. On touch screens, use **Jump** and aim at a nearby wall before tapping **Bomb**. The pause menu has separate music and effects sliders. Crystal powers last for the displayed number of seconds of play.

The CC0 audio files are [Cinematic percussion loop by Marwan Antonios](https://opengameart.org/content/cinematic-percussion-loop) and [Forest Ambience by TinyWorlds](https://opengameart.org/content/forest-ambience). Footsteps, pickups, charges, and spatial animal calls are synthesized locally with Web Audio.

The 3D test setup starts outside the turquoise entrance arch. Four adults and four hatchlings idle along the trailhead, and the single inviteable hatchling waits around the first turn. Use C, click, or tap to invite it and test following. Extra black bomb and pink super-jump crystals are placed within the maze, with early pickups near the entrance.
