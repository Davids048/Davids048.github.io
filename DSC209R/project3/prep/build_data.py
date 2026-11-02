"""Build data/climate_disasters.json, the static data file that the Project 3 page loads.

Inputs are two IMF Climate Change Indicators Dashboard CSV exports:
- disasters.csv: EM-DAT climate-related disaster counts, one row per country and disaster type, columns F1980-F2022.
- temperature.csv: FAO temperature change (degrees Celsius) from the 1951-1980 average, one row per country plus a
  "World" row, columns F1961-F2022.

The output has one entry per place: "World" first (the sum of all countries), then every country with at least one
recorded disaster. Each entry holds the yearly count for each disaster type and the yearly temperature change for
1980-2022 (null where FAO has no value).

Usage: python build_data.py <data_raw folder> <output json path>
"""
import csv
import json
import sys
from pathlib import Path

YEARS = list(range(1980, 2023))

# Short display names for IMF country names whose part before the first comma is ambiguous or unclear.
NAME_OVERRIDES = {
    "China, P.R.: Mainland": "China",
    "China, P.R.: Hong Kong": "Hong Kong",
    "China, P.R.: Macao": "Macao",
    "Congo, Dem. Rep. of the": "DR Congo",
    "Congo, Rep. of": "Congo",
    "Korea, Dem. People's Rep. of": "North Korea",
    "Korea, Rep. of": "South Korea",
}


def short_name(imf_name):
    """Return a short country name, for example "Iran" for "Iran, Islamic Rep. of"."""
    imf_name = imf_name.strip()
    return NAME_OVERRIDES.get(imf_name, imf_name.split(", ")[0])


def read_rows(path):
    """Read an IMF CSV export (UTF-8 with a byte-order mark) into a list of dicts."""
    with open(path, encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def year_values(row):
    """Return the 1980-2022 values of one row as floats, with None for empty cells."""
    return [float(row[f"F{year}"]) if row.get(f"F{year}") else None for year in YEARS]


def build(data_dir):
    """Combine the disaster counts and the temperature series into the JSON structure the page loads.

    Disaster types are ordered by their worldwide 1980-2022 total, largest first, so the largest type sits at the
    bottom of the stacked chart. Empty disaster cells mean zero disasters.
    """
    counts_by_place = {}
    names = {}
    for row in read_rows(data_dir / "disasters.csv"):
        disaster_type = row["Indicator"].split(": ")[-1]
        if disaster_type == "TOTAL":
            continue
        iso3 = row["ISO3"]
        names[iso3] = short_name(row["Country"])
        yearly = [int(value or 0) for value in year_values(row)]
        counts_by_place.setdefault(iso3, {})[disaster_type] = yearly

    type_totals = {}
    for counts in counts_by_place.values():
        for disaster_type, yearly in counts.items():
            type_totals[disaster_type] = type_totals.get(disaster_type, 0) + sum(yearly)
    types = sorted(type_totals, key=type_totals.get, reverse=True)

    temperatures = {row["ISO3"]: year_values(row) for row in read_rows(data_dir / "temperature.csv")}

    world_counts = {
        disaster_type: [sum(counts.get(disaster_type, [0] * len(YEARS))[i] for counts in counts_by_place.values())
                        for i in range(len(YEARS))]
        for disaster_type in types
    }
    places = [{"iso3": "WLD", "name": "World", "counts": world_counts, "temperature": temperatures["WLD"]}]

    for iso3 in sorted(counts_by_place, key=lambda code: names[code]):
        counts = counts_by_place[iso3]
        filled = {disaster_type: counts.get(disaster_type, [0] * len(YEARS)) for disaster_type in types}
        if sum(map(sum, filled.values())) == 0:
            continue
        places.append({"iso3": iso3, "name": names[iso3], "counts": filled,
                       "temperature": temperatures.get(iso3, [None] * len(YEARS))})

    return {
        "years": YEARS,
        "types": types,
        "source": "IMF Climate Change Indicators Dashboard (EM-DAT disaster counts; FAO temperature change)",
        "places": places,
    }


if __name__ == "__main__":
    data_dir, output_path = Path(sys.argv[1]), Path(sys.argv[2])
    output_path.write_text(json.dumps(build(data_dir), separators=(",", ":")), encoding="utf-8")
