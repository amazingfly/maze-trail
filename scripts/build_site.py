#!/usr/bin/env python3
"""Stage the static site and give every printed ID a real GitHub Pages route."""

import argparse
from html import escape
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PAGE_ID = re.compile(r"mz1_[a-z2-7]{26}")
DIFFICULTIES = {"preschool": ("First mazes", "★☆☆"), "easy": ("Easy", "★★☆"),
                "challenge": ("Challenge", "★★★")}


def build_book(book, records):
    catalog = book / "catalog.json"
    entries = json.loads(catalog.read_text(encoding="utf-8"))
    numbers = [entry["page"] for entry in entries]
    ids = [entry["id"] for entry in entries]
    if (not entries or numbers != sorted(set(numbers)) or len(ids) != len(set(ids))
            or any(page_id not in records for page_id in ids)):
        raise ValueError(f"Invalid printed maze list in {catalog}")
    groups = {}
    for number, page_id in zip(numbers, ids):
        data = records[page_id]
        left, top, right, bottom = data["bounds"]
        box = f"{left - .75:g} {top - .75:g} {right - left + 1.5:g} {bottom - top + 1.5:g}"
        shape = data["outline"]["path"] if "outline" in data else data["walls"]
        title = escape(data["title"].split(" · ")[0])
        groups.setdefault(data["difficulty"], []).append((number, f"""
          <li><a class="maze-card" href="../../maze/{page_id}/" aria-label="Page {number}, {title}">
            <svg viewBox="{box}" aria-hidden="true" focusable="false">
              <path d="{escape(shape)}" vector-effect="non-scaling-stroke"/>
            </svg>
            <span class="maze-page">{number}</span>
            <span class="maze-name">{title}</span>
          </a></li>"""))

    jumps = []
    sections = []
    for difficulty, (label, stars) in DIFFICULTIES.items():
        cards = groups.get(difficulty)
        if not cards:
            continue
        jumps.append(f'<a href="#{difficulty}"><span aria-hidden="true">{stars}</span>{label}</a>')
        sections.append(f"""
        <section id="{difficulty}" class="book-group" aria-labelledby="{difficulty}-title">
          <h3 id="{difficulty}-title"><span aria-hidden="true">{stars}</span> {label}
            <small>Pages {cards[0][0]}–{cards[-1][0]}</small></h3>
          <ul class="maze-cards" role="list">{''.join(card for _, card in cards)}</ul>
        </section>""")
    index = book / "index.html"
    template = index.read_text(encoding="utf-8")
    index.write_text(template.replace("<!-- book-jumps -->", "\n".join(jumps))
                     .replace("<!-- book-mazes -->", "\n".join(sections)), encoding="utf-8")


def build_3d(output, records):
    catalog = output / "books" / "dinosaur-adventures" / "catalog.json"
    levels = []
    for entry in json.loads(catalog.read_text(encoding="utf-8")):
        data = records[entry["id"]]
        levels.append({
            **entry,
            "title": data["title"].split(" · ")[0],
            "difficulty": data["difficulty"],
        })
    game = output / "3d"
    (game / "levels.json").write_text(
        json.dumps(levels, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    subprocess.run(["npm", "run", "build:3d", "--", f"--outdir={game}"],
                   cwd=ROOT, check=True)
    for dependency, filename, destination in (
        ("@babylonjs/core", "license.md", "BABYLON-LICENSE.txt"),
        ("@babylonjs/core", "NOTICE.md", "BABYLON-NOTICE.txt"),
        ("earcut", "LICENSE", "EARCUT-LICENSE.txt"),
    ):
        shutil.copyfile(ROOT / "node_modules" / dependency / filename, game / destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    source = ROOT / "site"
    output = args.output.resolve()
    if output == source or source in output.parents:
        parser.error("choose an output directory outside site/")
    if output.exists() and any(output.iterdir()):
        parser.error(f"{output} already contains files. Use an empty output directory.")

    data_dir = source / "data"
    selection = data_dir / "selector-pages.json"
    records = sorted(record for record in data_dir.glob("*.json") if record != selection)
    if not records or any(not PAGE_ID.fullmatch(record.stem) for record in records):
        parser.error("site/data must contain valid printed page IDs")

    maze_data = {}
    for record in records:
        data = json.loads(record.read_text(encoding="utf-8"))
        if data["id"] != record.stem:
            parser.error(f"page ID in {record.name} does not match its filename")
        maze_data[record.stem] = data

    if not selection.is_file():
        parser.error("site/data/selector-pages.json must list the current production run")
    selected = json.loads(selection.read_text(encoding="utf-8"))
    if (not selected or len(set(selected)) != len(selected)
            or any(page_id not in maze_data for page_id in selected)):
        parser.error("selector-pages.json must contain unique exported maze IDs")
    catalog = {}
    for page_id in selected:
        catalog.setdefault(maze_data[page_id]["difficulty"], []).append(page_id)

    shutil.copytree(source, output, dirs_exist_ok=True,
                    ignore=lambda path, names: [selection.name] if Path(path) == data_dir else [])
    for book_catalog in (output / "books").glob("*/catalog.json"):
        build_book(book_catalog.parent, maze_data)
    build_3d(output, maze_data)
    (output / "maze-index.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n",
                                            encoding="utf-8")
    index = (source / "index.html").read_text(encoding="utf-8")
    nested = index.replace('href="./', 'href="../../').replace('src="./', 'src="../../')
    for record in records:
        route = output / "maze" / record.stem
        route.mkdir(parents=True)
        (route / "index.html").write_text(nested, encoding="utf-8")
    (output / ".nojekyll").touch()
    print(f"Built {len(records)} printed QR routes and {len(selected)} selector entries in {output}")


if __name__ == "__main__":
    main()
