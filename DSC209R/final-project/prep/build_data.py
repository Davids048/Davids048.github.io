"""Build data/climate.json for the DSC 209R Final Project prototype "Warmer World, More Disasters?".

Inputs are the IMF Climate Change Indicators Dashboard CSV exports (EM-DAT disaster counts and FAO temperature
change). The output holds the world series (temperature, disasters by type, reporting countries) and, per country,
the disasters per year by type and the temperature change per year, 1980-2022.
Run with: uv run --with pandas python prep/build_data.py /path/to/data_raw
"""
import json
import sys
from pathlib import Path

import pandas as pd

YEARS = list(range(1980, 2023))
TYPES = ["Flood", "Storm", "Landslide", "Drought", "Extreme temperature", "Wildfire"]
OUT = Path(__file__).resolve().parent.parent / "data" / "climate.json"


def main(raw_dir):
    """Read the two CSV tables, reshape them per country and per year, and write one compact JSON file."""
    dis = pd.read_csv(raw_dir / "disasters.csv", encoding="utf-8-sig")
    dis["type"] = dis["Indicator"].str.split(": ").str[-1]
    temp = pd.read_csv(raw_dir / "temperature.csv", encoding="utf-8-sig")
    cols = [f"F{y}" for y in YEARS]
    dis[cols] = dis[cols].fillna(0).astype(int)

    world_temp = temp.loc[temp["Country"] == "World", cols].iloc[0]
    totals = dis[dis["type"] == "TOTAL"]
    world = {
        "temp": [round(float(v), 3) for v in world_temp],
        "counts": {t: dis[dis["type"] == t][cols].sum().tolist() for t in TYPES},
        "reporting": (totals[cols] > 0).sum().tolist(),
    }

    temp_by_iso = temp.set_index("ISO3")
    countries = []
    for iso, group in dis[dis["type"].isin(TYPES)].groupby("ISO3"):
        counts = {row["type"]: row[cols].tolist() for _, row in group.iterrows()}
        t = temp_by_iso.loc[iso, cols] if iso in temp_by_iso.index else None
        countries.append({
            "iso": iso,
            "name": group["Country"].iloc[0],
            "counts": {k: v for k, v in counts.items() if any(v)},
            "temp": None if t is None else [None if pd.isna(v) else round(float(v), 3) for v in t],
        })
    OUT.write_text(json.dumps({"years": YEARS, "types": TYPES, "world": world, "countries": countries},
                              separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(countries)} countries)")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
