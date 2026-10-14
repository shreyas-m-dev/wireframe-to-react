#!/usr/bin/env python3
"""Read-only inspector for services/rag/vectors.sqlite3.

Usage: python scripts/inspect_rag_db.py [path] [--json]
Uses SQLite URI mode=ro and never calls project indexing code, so it cannot
create, seed, migrate, or overwrite the database.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def inspect(path: Path) -> dict:
    conn = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    tables = conn.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
    indexes = conn.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' ORDER BY name").fetchall()
    report = {"path": str(path), "tables": [], "indexes": [dict(row) for row in indexes]}
    for table in tables:
        name = table["name"]
        count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        columns = [dict(row) for row in conn.execute(f'PRAGMA table_info("{name}")')]
        samples = [dict(row) for row in conn.execute(f'SELECT * FROM "{name}" ORDER BY 1 LIMIT 10')]
        for sample in samples:
            for key, value in list(sample.items()):
                if isinstance(value, str) and len(value) > 220:
                    sample[key] = value[:217] + "..."
        report["tables"].append({"name": name, "createSql": table["sql"], "recordCount": count, "columns": columns, "samples": samples})
    conn.close()
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="services/rag/vectors.sqlite3")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = inspect(Path(args.path))
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print(f"Database (read-only): {report['path']}")
    for table in report["tables"]:
        print(f"\n{table['name']}: {table['recordCount']} records")
        print("columns: " + ", ".join(f"{c['name']} {c['type']}" for c in table['columns']))
        for row in table["samples"]:
            print("- " + " | ".join(f"{key}={value}" for key, value in row.items()))
    print("\nIndexes:")
    for index in report["indexes"]:
        print(f"- {index['name']} on {index['tbl_name']}: {index['sql'] or 'implicit/auto index'}")


if __name__ == "__main__":
    main()
