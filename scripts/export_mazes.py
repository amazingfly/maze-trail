#!/usr/bin/env python3
"""Export the geometry needed to play and solve archived MazeGen pages."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def compact(point):
    return [round(value, 5) for value in point]


def encode(page, mesh, midpoint, path_data):
    source = page["source"]
    layout = page["layout"]
    config = source["config"]
    openings = [page["openings"][key] for key in ("start", "destination")]
    # Keep passage order. MazeGen uses it to break ties between equal shortest routes.
    passages = []
    for edge in sorted(source["passages"]):
        line, (a, b) = mesh.edges[edge]
        passages.append([a, b, *compact(midpoint(line))])

    return {
        "version": 2,
        "id": page["page_id"],
        "title": source.get("title") or (source.get("quest") or {}).get("name") or "Maze solution",
        "difficulty": config["difficulty"],
        "bounds": compact(mesh.bounds),
        "wallWidth": round(config["wall_pt"] / layout["scale"], 5),
        "wallStyle": config["wall_style"],
        "corridor": round(layout["corridor"] / layout["scale"], 5),
        "walls": "".join(
            path_data(points) + ("Z" if points[0] == points[-1] else "")
            for points in page["walls"]
        ),
        "centers": [compact(cell["center"]) for cell in mesh.cells],
        "polygons": [
            [compact(point) for side in cell["sides"] for point in side[:-1]]
            if index not in mesh.reserved else None
            for index, cell in enumerate(mesh.cells)
        ],
        "passages": passages,
        "openings": [
            [opening["cell"], compact(opening["center"]), compact(opening["outward"])]
            for opening in openings
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mazegen", type=Path, default=ROOT.parent / "mazeGen")
    parser.add_argument("--library", type=Path, help="MazeGen page library root")
    parser.add_argument("--output", type=Path, default=ROOT / "site" / "data")
    parser.add_argument("ids", nargs="*", help="Optional mz1_ page IDs to export")
    args = parser.parse_args()

    sys.path.insert(0, str(args.mazegen.resolve()))
    from mazegen.geometry import Mesh, midpoint
    from mazegen.page_identity import canonical, digest, parse_id, short_id
    from mazegen.render import path_data

    pages = (args.library or args.mazegen / "page-library") / "pages"
    files = ([pages / f"{parse_id(value)}.json" for value in args.ids] if args.ids
             else sorted(pages.glob("mz1_*.json")))
    if not files:
        parser.error(f"no archived pages found in {pages}")

    args.output.mkdir(parents=True, exist_ok=True)
    for file in files:
        page = json.loads(file.read_text(encoding="utf-8"))
        record = {key: value for key, value in page.items() if key not in {"page_id", "sha256", "svg"}}
        checksum = digest(canonical(record))
        if (page["schema"] != "mazegen-page-v1" or file.stem != page["page_id"]
                or checksum != page["sha256"] or short_id(checksum) != file.stem):
            raise ValueError(f"Invalid archived page: {file}")
        source = page["source"]
        mesh = Mesh(source["cells"], set(source["reserved"]))
        payload = encode(page, mesh, midpoint, path_data)
        target = args.output / file.name
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                        encoding="utf-8")
        temp.replace(target)
    print(f"Exported {len(files)} maze pages to {args.output}")


if __name__ == "__main__":
    main()
