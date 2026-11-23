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

    records = sorted((source / "data").glob("*.json"))
    if not records or any(not PAGE_ID.fullmatch(record.stem) for record in records):
        parser.error("site/data must contain valid printed page IDs")

    catalog = {}
    for record in records:
        data = json.loads(record.read_text(encoding="utf-8"))
        if data["id"] != record.stem:
            parser.error(f"page ID in {record.name} does not match its filename")
        catalog.setdefault(data["difficulty"], []).append(record.stem)

    shutil.copytree(source, output, dirs_exist_ok=True)
    (output / "maze-index.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n",
                                            encoding="utf-8")
    index = (source / "index.html").read_text(encoding="utf-8")
    nested = index.replace('href="./', 'href="../../').replace('src="./', 'src="../../')
    for record in records:
        route = output / "maze" / record.stem
        route.mkdir(parents=True)
        (route / "index.html").write_text(nested, encoding="utf-8")
    (output / ".nojekyll").touch()
    print(f"Built {len(records)} printed QR routes in {output}")


if __name__ == "__main__":
    main()
