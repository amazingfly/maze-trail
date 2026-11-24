#!/usr/bin/env python3
"""Stage the static site and give every printed ID a real GitHub Pages route."""

import argparse
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
PAGE_ID = re.compile(r"mz1_[a-z2-7]{26}")


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

    difficulties = {}
    for record in records:
        data = json.loads(record.read_text(encoding="utf-8"))
        if data["id"] != record.stem:
            parser.error(f"page ID in {record.name} does not match its filename")
        difficulties[record.stem] = data["difficulty"]

    if not selection.is_file():
        parser.error("site/data/selector-pages.json must list the current production run")
    selected = json.loads(selection.read_text(encoding="utf-8"))
    if (not selected or len(set(selected)) != len(selected)
            or any(page_id not in difficulties for page_id in selected)):
        parser.error("selector-pages.json must contain unique exported maze IDs")
    catalog = {}
    for page_id in selected:
        catalog.setdefault(difficulties[page_id], []).append(page_id)

    shutil.copytree(source, output, dirs_exist_ok=True,
                    ignore=lambda path, names: [selection.name] if Path(path) == data_dir else [])
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
