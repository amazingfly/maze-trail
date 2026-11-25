# Maze Trail

Maze Trail is a static GitHub Pages site for the QR codes printed by MazeGen. Each printed link opens its matching maze in tracing mode. Drag the star to the flag or the yellow dot to the star. You can also tap a connected space or focus the board and use the arrow keys. The trail follows open passages. The circular arrow resets it. The animated maze button opens the solution, where readers can pause, change speed, scrub through the route, replay it, or show the full path. The back button restores their own trail. With reduced motion enabled, the solution appears immediately. Use the dice button to open a random maze by difficulty. The selector uses the maze IDs from the latest exported production manifest. Tap **Full screen** for an expanded board. Use **+** and **−** to zoom. Grab near the player to trace and recenter on release. Drag anywhere outside the tracing target to pan the board.

The QR uses MazeGen’s printed `mz1_` page ID. That ID is a hash of the archived print edition. Each ID has one small JSON record with geometry, open passages, and the placement of its archived illustrations. The browser draws the walls, loads the original SVG artwork for that edition, and solves the passage graph using breadth-first search. Shared illustrations are stored once. The interactive solver runs in the browser. The site also links to the production book PDF from the footer.

## Preview

From this directory, build into a fresh folder and serve it.

```sh
preview_dir="$(mktemp -d /tmp/maze-trail.XXXXXX)"
python3 scripts/build_site.py --output "$preview_dir"
python3 -m http.server 8000 --directory "$preview_dir"
```

Open `http://localhost:8000/` for the example or `http://localhost:8000/maze/mz1_jwgc6p4fhllup6bypbhlsuiqoa/` for its printed route.

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
  --production-manifest ../mazeGen/production/dinosaur-mazes-v2/manifest.json \
  --book-catalog site/books/dinosaur-adventures/catalog.json
```
