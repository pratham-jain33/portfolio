#!/usr/bin/env python3
"""Generate a GitHub-style contribution heatmap SVG in brand blue (#2f6bff).

Fetches live data from GitHub GraphQL API and writes assets/contrib-graph.svg.
Run daily via cron to keep it fresh.
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime

USERNAME = "pratham-jain33"
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "contrib-graph.svg")

BLUE = "#2f6bff"
# 5 intensity levels, transparent -> full blue
LEVELS = ["#ececea", "#c3d4ff", "#8fabff", "#5c86ff", BLUE]

CELL = 11
GAP = 3
RADIUS = 2.5
TOP_PAD = 22   # month labels
LEFT_PAD = 32  # day labels


def get_token():
    cred_path = os.path.expanduser("~/.git-credentials")
    try:
        with open(cred_path) as f:
            for line in f:
                if "pratham-jain33:" in line:
                    # format: https://pratham-jain33:TOKEN@github.com
                    part = line.split("pratham-jain33:")[1]
                    return part.split("@")[0].strip()
    except FileNotFoundError:
        pass
    return ""


def fetch_calendar(token):
    query = {"query": '{ user(login: "%s") { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }' % USERNAME}
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps(query).encode(),
        headers={"Authorization": f"bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    return d["data"]["user"]["contributionsCollection"]["contributionCalendar"]


def level(count, max_count):
    if count == 0:
        return 0
    if max_count == 0:
        return 1
    ratio = count / max_count
    if ratio < 0.25:
        return 1
    if ratio < 0.5:
        return 2
    if ratio < 0.75:
        return 3
    return 4


def main():
    token = get_token()
    if not token:
        print("no token", file=sys.stderr)
        sys.exit(1)
    cal = fetch_calendar(token)
    weeks = cal["weeks"]
    max_count = max(
        d["contributionCount"] for w in weeks for d in w["contributionDays"]
    )

    cols = len(weeks)
    width = LEFT_PAD + cols * (CELL + GAP)
    height = TOP_PAD + 7 * (CELL + GAP)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="GitHub contribution graph">',
        f'<style>text{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}</style>',
    ]

    # month labels
    last_month = -1
    for ci, w in enumerate(weeks):
        first = w["contributionDays"][0]
        dt = datetime.strptime(first["date"], "%Y-%m-%d")
        if dt.month != last_month and dt.day < 8:
            last_month = dt.month
            x = LEFT_PAD + ci * (CELL + GAP)
            parts.append(
                f'<text x="{x}" y="13" font-size="10" fill="#6b7280">{dt.strftime("%b")}</text>'
            )

    # day labels
    for ri, label in enumerate(["Mon", "Wed", "Fri"]):
        y = TOP_PAD + (ri * 2 + 1) * (CELL + GAP) - 3
        parts.append(
            f'<text x="0" y="{y}" font-size="10" fill="#6b7280">{label}</text>'
        )

    # cells
    for ci, w in enumerate(weeks):
        for d in w["contributionDays"]:
            dt = datetime.strptime(d["date"], "%Y-%m-%d")
            # GitHub weeks start Sunday (weekday 6 in Python Mon=0); map Sun=0
            row = (dt.weekday() + 1) % 7
            x = LEFT_PAD + ci * (CELL + GAP)
            y = TOP_PAD + row * (CELL + GAP)
            lv = level(d["contributionCount"], max_count)
            parts.append(
                f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="{RADIUS}" fill="{LEVELS[lv]}">'
                f'<title>{d["contributionCount"]} contributions on {d["date"]}</title></rect>'
            )

    parts.append("</svg>")
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        f.write("\n".join(parts))
    print(f"wrote {OUT_PATH} ({cal['totalContributions']} total)")


if __name__ == "__main__":
    main()
