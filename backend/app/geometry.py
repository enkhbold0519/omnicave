"""Cellar geometry: free 3D placement of bottles on (removable) racks.

Coordinates in cm. x: from the left wall, y: up from the cellar floor, z: from the door glass.
A 750 ml Bordeaux bottle is ~7.5 cm wide and ~30 cm long. Lying bottles rest on a rack
surface; further bottles can be stacked on top (level 1, 2 ...) in the grooves between two
bottles, which is why a "10-bottle" rack can physically hold 12 or more.
"""
from __future__ import annotations

import math

D = 7.6                 # bottle diameter
R = D / 2
L = 30.0                # bottle length
STACK_STEP = D * 0.87   # vertical step when nested in the groove of the row below
MIN_GAP = D * 0.92      # two bottles closer than this on the same level/layer overlap


def present_racks(racks: list[dict]) -> list[dict]:
    return sorted([r for r in racks if r["present"]], key=lambda r: r["y_cm"])


def support_rack(racks: list[dict], y: float) -> dict | None:
    """Highest present rack whose surface is at or below the bottle's bottom edge."""
    best = None
    for r in present_racks(racks):
        if r["y_cm"] <= y - R + 1.0:
            best = r
    return best


def snap(racks: list[dict], x: float, y: float, z: float, width: float, height: float, depth: float,
         bottles: list[dict] | None = None) -> dict:
    """Snap a free point to a physically plausible resting position.
    With `bottles`, gravity applies: a stacked level needs a bottle underneath."""
    x = min(max(x, R), width - R)
    z = min(max(z, 2.0), max(2.0, depth - L * 0.5))
    rack = support_rack(racks, max(y, R))
    base = rack["y_cm"] if rack else 0.0
    level = max(0, round((y - base - R) / STACK_STEP))
    # don't let a stack poke through the next rack above
    above = [r for r in present_racks(racks) if r["y_cm"] > base + 0.1]
    if above:
        max_level = max(0, math.floor((above[0]["y_cm"] - base - D) / STACK_STEP))
        level = min(level, max_level)
    if bottles is not None:
        rid = rack["id"] if rack else None
        while level > 0 and not any(o.get("rack_id") == rid and o["level"] == level - 1 and abs(o["x"] - x) < D
                                    and abs(o["z"] - z) < 15 for o in bottles):
            level -= 1
    y_c = base + R + level * STACK_STEP
    return {"x": round(x, 1), "y": round(min(y_c, height - R), 1), "z": round(z, 1),
            "rack_id": rack["id"] if rack else None, "level": level}


def layer(z: float, rack_depth: float) -> str:
    return "front" if z < rack_depth / 2 else "back"


def rack_stats(rack: dict, bottles: list[dict]) -> dict:
    on = [b for b in bottles if b["rack_id"] == rack["id"]]
    return {"count": len(on), "base_count": sum(1 for b in on if b["level"] == 0),
            "over_capacity": len(on) > rack["capacity"]}


def find_free_spot(racks: list[dict], bottles: list[dict], width: float, prefer, eye_level: float = 100.0) -> dict | None:
    """Best empty spot: preferred racks first, eye level first, front layer first,
    then stacking on top of the existing row. `prefer(rack) -> bool`."""
    cands = []
    for r in present_racks(racks):
        on = [b for b in bottles if b["rack_id"] == r["id"]]
        for zname, z in (("front", 6.0), ("back", r["depth_cm"] / 2 + 6.0)):
            if z + L * 0.5 > r["depth_cm"] + 5:
                continue
            row = sorted(b["x"] for b in on if b["level"] == 0 and layer(b["z"], r["depth_cm"]) == zname)
            bounds = [None] + row + [None]
            for left, right in zip(bounds, bounds[1:]):
                lo = R if left is None else left + D
                hi = width - R if right is None else right - D
                if hi >= lo:  # a bottle centre fits in [lo, hi]; pack from the left
                    score = (0 if prefer(r) else 1000) + abs(r["y_cm"] - eye_level) * 0.5 + (0 if zname == "front" else 15) + lo * 0.01
                    cands.append((score, {"rack_id": r["id"], "x": round(lo, 1), "z": z, "level": 0, "layer": zname}))
            # stacking: groove between two neighbours on the base row
            for a, b in zip(row, row[1:]):
                if b - a <= D * 1.3:
                    gx = (a + b) / 2
                    if not any(abs(o["x"] - gx) < D * 0.6 and o["level"] == 1 and layer(o["z"], r["depth_cm"]) == zname for o in on):
                        score = (0 if prefer(r) else 1000) + abs(r["y_cm"] - eye_level) * 0.5 + 40 + (0 if zname == "front" else 15)
                        cands.append((score, {"rack_id": r["id"], "x": round(gx, 1), "z": z, "level": 1, "layer": zname}))
    if not cands:
        return None
    cands.sort(key=lambda t: t[0])
    spot = cands[0][1]
    rack = next(r for r in racks if r["id"] == spot["rack_id"])
    spot["y"] = round(rack["y_cm"] + R + spot["level"] * STACK_STEP, 1)
    spot["rack_name"] = rack["name"]
    return spot


def location_text(b: dict, rack_name: str | None) -> str:
    where = rack_name or "free-standing"
    side = "front" if b["z"] < 20 else "back"
    lvl = f", stacked L{b['level']}" if b["level"] else ""
    return f"{where} · {b['x']:.0f} cm from left · {side}{lvl}"
