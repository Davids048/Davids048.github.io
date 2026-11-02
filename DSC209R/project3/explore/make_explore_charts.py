"""Draw six exploratory PNG charts of climate-related disasters and temperature change.

The charts are for a short checkpoint video, so each one is a 1600 x 900 pixel image with a
title that states its finding, large labels, and a one-line source footer. The inputs are two
IMF Climate Change Indicators Dashboard CSV exports in the data_raw folder:

- disasters.csv: EM-DAT climate-related disaster counts, one row per country and disaster type
  (Drought, Extreme temperature, Flood, Landslide, Storm, Wildfire, TOTAL), columns F1980 ... F2022.
  An empty cell means zero disasters.
- temperature.csv: FAO temperature change (degrees Celsius) relative to the 1951-1980 average,
  one row per country plus one "World" row (ISO3 code WLD), columns F1961 ... F2022.

The script also writes captions.json, a list of {"file", "title", "finding"} records.

Usage: make_explore_charts.py DATA_RAW_DIR OUTPUT_DIR
"""
import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib import font_manager

DISASTER_TYPES = ["Drought", "Extreme temperature", "Flood", "Landslide", "Storm", "Wildfire"]
EARLY_YEARS = (1980, 1989)
RECENT_YEARS = (2013, 2022)

# Colors: one neutral color for context marks and one accent color for the marks that carry the finding.
NEUTRAL = "#7b8590"
ACCENT = "#d9480f"
TITLE_COLOR = "#111111"
TEXT_COLOR = "#333333"
MUTED_COLOR = "#666666"
GRID_COLOR = "#e4e4e4"

DISASTER_SOURCE = "Source: EM-DAT disaster counts via IMF Climate Change Indicators Dashboard"
TEMPERATURE_SOURCE = "Source: FAO temperature change via IMF Climate Change Indicators Dashboard"
BOTH_SOURCE = "Source: EM-DAT disaster counts and FAO temperature change via IMF Climate Change Indicators Dashboard"

# Readable names for the IMF country labels that the "text before the first comma" rule handles badly.
SHORT_NAMES = {
    "China, P.R.: Mainland": "China",
    "China, P.R.: Hong Kong": "Hong Kong",
    "China, P.R.: Macao": "Macao",
    "Korea, Rep. of": "South Korea",
    "Korea, Dem. People's Rep. of": "North Korea",
    "Congo, Dem. Rep. of the": "DR Congo",
    "Congo, Rep. of": "Rep. of the Congo",
    "Russian Federation": "Russia",
    "Lao People's Dem. Rep.": "Laos",
    "Taiwan Province of China": "Taiwan",
    "United States Virgin Islands": "US Virgin Islands",
}


def use_arial():
    """Register the macOS Arial fonts with Matplotlib and make Arial the default font family."""
    font_dir = Path("/System/Library/Fonts/Supplemental")
    for name in ["Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf", "Arial Unicode.ttf"]:
        font_manager.fontManager.addfont(str(font_dir / name))
    matplotlib.rcParams["font.family"] = ["Arial", "Arial Unicode MS"]


def short_country_name(name):
    """Return a short display name, for example "China" for "China, P.R.: Mainland"."""
    return SHORT_NAMES.get(name, name.split(",")[0].strip())


def year_columns(table):
    """Return the year columns (F1961, F1962, ...) of an IMF wide-format table."""
    return [c for c in table.columns if c.startswith("F") and c[1:].isdigit()]


def load_disaster_counts(data_dir):
    """Return disaster counts as a long-format table with columns ISO3, country, type, year, count.

    The disaster type is the text after the last ": " in the Indicator column. Empty cells become 0.
    """
    table = pd.read_csv(data_dir / "disasters.csv", encoding="utf-8-sig")
    table["type"] = table["Indicator"].str.split(": ").str[-1]
    table["country"] = table["Country"].map(short_country_name)
    long_table = table.melt(id_vars=["ISO3", "country", "type"], value_vars=year_columns(table),
                            var_name="year", value_name="count")
    long_table["year"] = long_table["year"].str[1:].astype(int)
    long_table["count"] = long_table["count"].fillna(0).astype(int)
    return long_table


def load_temperature_change(data_dir):
    """Return temperature change (degrees Celsius vs. 1951-1980) as a table: one row per ISO3 code, one column per year."""
    table = pd.read_csv(data_dir / "temperature.csv", encoding="utf-8-sig")
    cols = year_columns(table)
    wide = table.set_index("ISO3")[cols].astype(float)
    wide.columns = [int(c[1:]) for c in cols]
    return wide


def period_mean(series, years):
    """Return the mean of a year-indexed Series over an inclusive (first, last) year range."""
    return series.loc[years[0]:years[1]].mean()


def new_chart(title, subtitle, source, axes_rect=(0.075, 0.12, 0.895, 0.66)):
    """Create a 1600 x 900 figure with a bold title, a gray subtitle, and a one-line source footer.

    Returns the figure and one axes placed inside axes_rect (left, bottom, width, height in figure
    fractions). Pass axes_rect=None to get the figure without axes.
    """
    fig = plt.figure(figsize=(16, 9), dpi=100, facecolor="white")
    fig.text(0.03, 0.955, title, ha="left", va="top", fontsize=25, fontweight="bold", color=TITLE_COLOR)
    fig.text(0.03, 0.885, subtitle, ha="left", va="top", fontsize=16, color=MUTED_COLOR)
    fig.text(0.03, 0.025, source, ha="left", va="bottom", fontsize=12, color=MUTED_COLOR)
    if axes_rect is None:
        return fig, None
    return fig, fig.add_axes(axes_rect)


def style_axes(ax, grid_axis="y"):
    """Apply the shared light style: no top or right spine, a light grid, and large gray tick labels."""
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    for side in ["left", "bottom"]:
        ax.spines[side].set_color("#999999")
    ax.tick_params(labelsize=14, colors=TEXT_COLOR, length=4, color="#999999")
    ax.grid(axis=grid_axis, color=GRID_COLOR, linewidth=1)
    ax.set_axisbelow(True)


def draw_period_average(ax, series, years, label, color=ACCENT):
    """Draw a line at the average of a year-indexed series over an inclusive year range.

    The label is centered over the range, just above its tallest bar, so it never covers a bar.
    """
    ax.hlines(period_mean(series, years), years[0] - 0.4, years[1] + 0.4, color=color, linewidth=3, zorder=3)
    ax.annotate(label, ((years[0] + years[1]) / 2, series.loc[years[0]:years[1]].max()), xytext=(0, 8),
                textcoords="offset points", ha="center", va="bottom", fontsize=15, fontweight="bold", color=color)


def chart_world_total(counts, out_dir):
    """Chart 1: worldwide disasters per year, with the 1980s and 2013-2022 averages marked."""
    world = counts[counts["type"] == "TOTAL"].groupby("year")["count"].sum()
    early, recent = period_mean(world, EARLY_YEARS), period_mean(world, RECENT_YEARS)
    ratio = recent / early
    peak_year = int(world.idxmax())
    title = f"Recorded climate disasters rose {ratio:.1f}× since the 1980s, then leveled off after 2000"
    subtitle = "Worldwide number of climate-related disasters per year, all countries, 1980–2022"
    fig, ax = new_chart(title, subtitle, DISASTER_SOURCE)
    ax.bar(world.index, world.values, width=0.8, color=NEUTRAL)
    draw_period_average(ax, world, EARLY_YEARS, f"1980–89 average: {early:.0f} per year")
    draw_period_average(ax, world, RECENT_YEARS, f"2013–22 average: {recent:.0f} per year")
    ax.annotate(f"Peak: {world[peak_year]} in {peak_year}", (peak_year, world[peak_year]), xytext=(0, 8),
                textcoords="offset points", ha="center", va="bottom", fontsize=14, color=TEXT_COLOR)
    style_axes(ax)
    ax.set_xlim(1979, 2023)
    ax.set_ylim(0, 460)
    ax.set_ylabel("Disasters per year", fontsize=15, color=TEXT_COLOR)
    fig.savefig(out_dir / "01_world_total.png", facecolor="white")
    plt.close(fig)
    finding = (f"Worldwide recorded disasters averaged {early:.0f} per year in 1980–1989 and {recent:.0f} per year "
               f"in 2013–2022 ({ratio:.1f}×), with most of the rise before 2000 and a peak of {world[peak_year]} "
               f"in {peak_year}.")
    return {"file": "01_world_total.png", "title": title, "finding": finding}


def chart_by_type(counts, out_dir):
    """Chart 2: one small-multiple panel per disaster type on a shared y-axis.

    Panels are ordered by the rise in the yearly average from 1980-1989 to 2013-2022. The types that
    together account for most of the total rise are drawn in the accent color.
    """
    by_type = counts[counts["type"] != "TOTAL"].pivot_table(index="year", columns="type", values="count",
                                                            aggfunc="sum")
    rise = (by_type.loc[RECENT_YEARS[0]:RECENT_YEARS[1]].mean()
            - by_type.loc[EARLY_YEARS[0]:EARLY_YEARS[1]].mean()).sort_values(ascending=False)
    drivers = list(rise.index[:2])
    driver_share = rise[drivers].sum() / rise.sum()
    title = f"Floods and storms account for {driver_share:.0%} of the rise in recorded disasters"
    subtitle = ("Worldwide disasters per year by type, same y-axis in every panel. "
                "Change = 2013–22 average minus 1980–89 average.")
    fig, _ = new_chart(title, subtitle, DISASTER_SOURCE, axes_rect=None)
    axes = fig.subplots(2, 3, sharex=True, sharey=True,
                        gridspec_kw={"left": 0.065, "right": 0.975, "bottom": 0.11, "top": 0.74,
                                     "hspace": 0.42, "wspace": 0.08})
    for ax, disaster_type in zip(axes.flat, rise.index):
        color = ACCENT if disaster_type in drivers else NEUTRAL
        series = by_type[disaster_type]
        ax.fill_between(series.index, series.values, color=color, alpha=0.15, linewidth=0)
        ax.plot(series.index, series.values, color=color, linewidth=2.5)
        ax.set_title(f"{disaster_type}   {rise[disaster_type]:+.0f} per year", loc="left", fontsize=17,
                     fontweight="bold", color=color if disaster_type in drivers else TEXT_COLOR, pad=8)
        style_axes(ax)
        ax.set_xlim(1980, 2022)
        ax.set_ylim(0, 240)
        ax.set_xticks([1980, 2000, 2020])
    for ax in axes[:, 0]:
        ax.set_ylabel("Disasters per year", fontsize=14, color=TEXT_COLOR)
    fig.savefig(out_dir / "02_by_type.png", facecolor="white")
    plt.close(fig)
    parts = ", ".join(f"{t.lower()} {rise[t]:+.0f}" for t in rise.index)
    finding = (f"Of the rise of {rise.sum():.0f} disasters per year between 1980–1989 and 2013–2022, floods "
               f"({rise['Flood']:+.0f}) and storms ({rise['Storm']:+.0f}) account for {driver_share:.0%} "
               f"(all types: {parts}).")
    return {"file": "02_by_type.png", "title": title, "finding": finding}


def chart_world_temperature(temperature, out_dir):
    """Chart 3: World temperature change per year, warm years in the accent color."""
    world = temperature.loc["WLD"].dropna()
    early, recent = period_mean(world, (1961, 1970)), period_mean(world, RECENT_YEARS)
    hottest_year = int(world.idxmax())
    title = f"World temperatures in 2013–2022 averaged {recent:.1f} °C above the 1951–1980 baseline"
    subtitle = "World temperature change per year (°C) relative to the 1951–1980 average, 1961–2022"
    fig, ax = new_chart(title, subtitle, TEMPERATURE_SOURCE)
    colors = [ACCENT if value > 0 else NEUTRAL for value in world.values]
    ax.bar(world.index, world.values, width=0.8, color=colors)
    ax.axhline(0, color="#555555", linewidth=1.2)
    draw_period_average(ax, world, RECENT_YEARS, f"2013–22 avg: +{recent:.2f} °C", color=TITLE_COLOR)
    style_axes(ax)
    ax.set_xlim(1960, 2023)
    ax.set_ylim(-0.5, 2.0)
    ax.set_ylabel("Temperature change (°C)", fontsize=15, color=TEXT_COLOR)
    fig.savefig(out_dir / "03_world_temperature.png", facecolor="white")
    plt.close(fig)
    early = round(early, 2) + 0  # turns a rounded -0.00 into +0.00
    finding = (f"World temperature change rose from {early:+.2f} °C in 1961–1970 to {recent:+.2f} °C in 2013–2022 "
               f"relative to 1951–1980, with the warmest year {hottest_year} at +{world[hottest_year]:.2f} °C.")
    return {"file": "03_world_temperature.png", "title": title, "finding": finding}


def chart_top_countries(counts, out_dir):
    """Chart 4: the 15 countries with the most recorded disasters in 1980-2022, as horizontal bars.

    Ties are broken alphabetically. The footer names any country tied with the 15th bar but left out.
    """
    totals = counts[counts["type"] == "TOTAL"].groupby("country")["count"].sum()
    ranked = totals.reset_index().sort_values(["count", "country"], ascending=[False, True])
    top = ranked.head(15)
    cutoff = top["count"].iloc[-1]
    left_out = ranked.iloc[15:]
    tied_out = left_out.loc[left_out["count"] == cutoff, "country"].tolist()
    share = top["count"].sum() / totals.sum()
    first, second = top.iloc[0], top.iloc[1]
    title = (f"The {first['country']} and {second['country']} recorded the most climate disasters "
             f"since 1980: {first['count']} and {second['count']}")
    subtitle = (f"Total recorded climate-related disasters, 1980–2022, top 15 countries "
                f"({share:.0%} of all {totals.sum():,} disasters)")
    source = DISASTER_SOURCE
    if tied_out:
        source = f"{source}.  Also at {cutoff}: {', '.join(tied_out)}."
    fig, ax = new_chart(title, subtitle, source, axes_rect=(0.17, 0.10, 0.78, 0.70))
    colors = [ACCENT if i < 2 else NEUTRAL for i in range(len(top))]
    positions = range(len(top))[::-1]
    ax.barh(list(positions), top["count"], height=0.72, color=colors)
    for y, value in zip(positions, top["count"]):
        ax.text(value + 8, y, f"{value}", va="center", ha="left", fontsize=14, color=TEXT_COLOR)
    ax.set_yticks(list(positions))
    ax.set_yticklabels(top["country"], fontsize=15)
    style_axes(ax, grid_axis="x")
    ax.grid(False)
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.xaxis.set_visible(False)
    ax.set_xlim(0, 1000)
    fig.savefig(out_dir / "04_top_countries.png", facecolor="white")
    plt.close(fig)
    names = ", ".join(f"{c} ({n})" for c, n in zip(top["country"].iloc[2:5], top["count"].iloc[2:5]))
    finding = (f"The {first['country']} ({first['count']}) and {second['country']} ({second['count']}) lead, "
               f"followed by {names}; the top 15 countries hold {share:.0%} of all {totals.sum():,} recorded "
               f"disasters.")
    return {"file": "04_top_countries.png", "title": title, "finding": finding}


def chart_reporting_countries(counts, out_dir):
    """Chart 5: number of countries with at least one recorded disaster per year (a coverage caveat)."""
    totals = counts[counts["type"] == "TOTAL"]
    reporting = totals[totals["count"] > 0].groupby("year")["ISO3"].nunique()
    reporting = reporting.reindex(range(1980, 2023), fill_value=0)
    early, recent = period_mean(reporting, EARLY_YEARS), period_mean(reporting, RECENT_YEARS)
    title = f"The number of countries with a recorded disaster nearly doubled, from {early:.0f} to {recent:.0f} a year"
    subtitle = ("Countries with at least one recorded climate-related disaster per year. Part of the rise in "
                "counts may come from wider reporting.")
    fig, ax = new_chart(title, subtitle, DISASTER_SOURCE)
    ax.bar(reporting.index, reporting.values, width=0.8, color=NEUTRAL)
    draw_period_average(ax, reporting, EARLY_YEARS, f"1980–89 average: {early:.0f} countries")
    draw_period_average(ax, reporting, RECENT_YEARS, f"2013–22 average: {recent:.0f} countries")
    style_axes(ax)
    ax.set_xlim(1979, 2023)
    ax.set_ylim(0, 150)
    ax.set_ylabel("Countries", fontsize=15, color=TEXT_COLOR)
    fig.savefig(out_dir / "05_reporting_countries.png", facecolor="white")
    plt.close(fig)
    finding = (f"The number of countries with at least one recorded disaster rose from an average of {early:.0f} "
               f"per year in 1980–1989 to {recent:.0f} in 2013–2022 ({recent / early:.1f}×), so wider reporting "
               f"may explain part of the rise in disaster counts.")
    return {"file": "05_reporting_countries.png", "title": title, "finding": finding}


def chart_warming_vs_change(counts, temperature, out_dir):
    """Chart 6: per-country warming against the change in disasters per year, with the correlation.

    x is the mean temperature change in 2013-2022. y is the mean disasters per year in 2003-2022 minus
    the mean in 1983-2002. The World row and countries missing either value are excluded. The 8 points
    farthest from the center (in standard-deviation units on both axes) are labeled.
    """
    totals = counts[counts["type"] == "TOTAL"].pivot_table(index="ISO3", columns="year", values="count",
                                                           aggfunc="sum")
    names = counts.drop_duplicates("ISO3").set_index("ISO3")["country"]
    change = totals.loc[:, 2003:2022].mean(axis=1) - totals.loc[:, 1983:2002].mean(axis=1)
    warming = temperature.drop(index="WLD").loc[:, RECENT_YEARS[0]:RECENT_YEARS[1]].mean(axis=1)
    points = pd.DataFrame({"warming": warming, "change": change}).dropna()
    points["country"] = names.reindex(points.index)
    pearson = points["warming"].corr(points["change"])
    # Spearman rho is the Pearson correlation of the ranks (this avoids a SciPy dependency).
    spearman = points["warming"].rank().corr(points["change"].rank())
    z_scores = (points[["warming", "change"]] - points[["warming", "change"]].mean()) / points[["warming", "change"]].std()
    labeled = points.loc[(z_scores ** 2).sum(axis=1).sort_values(ascending=False).index[:8]]
    title = "Countries that warmed more did not see larger rises in disasters"
    subtitle = (f"One dot per country (n = {len(points)}).  Pearson r = {pearson:.2f},  Spearman ρ = {spearman:.2f}.  "
                f"Labeled: the 8 most extreme countries.")
    fig, ax = new_chart(title, subtitle, BOTH_SOURCE, axes_rect=(0.085, 0.145, 0.885, 0.635))
    ax.axhline(0, color="#555555", linewidth=1.2)
    others = points.drop(index=labeled.index)
    ax.scatter(others["warming"], others["change"], s=70, color=NEUTRAL, alpha=0.75, edgecolor="white", linewidth=1)
    ax.scatter(labeled["warming"], labeled["change"], s=90, color=ACCENT, edgecolor="white", linewidth=1, zorder=3)
    for _, row in labeled.iterrows():
        ax.annotate(row["country"], (row["warming"], row["change"]), xytext=(9, 0), textcoords="offset points",
                    ha="left", va="center", fontsize=15, color=TEXT_COLOR)
    style_axes(ax, grid_axis="both")
    ax.set_xlabel("Mean temperature change 2013–2022 (°C vs. 1951–1980)", fontsize=15, color=TEXT_COLOR)
    ax.set_ylabel("Change in disasters per year\n(2003–22 mean minus 1983–2002 mean)", fontsize=15,
                  color=TEXT_COLOR)
    fig.savefig(out_dir / "06_warming_vs_change.png", facecolor="white")
    plt.close(fig)
    finding = (f"Across {len(points)} countries, 2013–2022 warming and the change in disasters per year are barely "
               f"related (Pearson r = {pearson:.2f}, Spearman ρ = {spearman:.2f}).")
    return {"file": "06_warming_vs_change.png", "title": title, "finding": finding}


def main():
    """Read the two CSV files, draw the six charts, and write captions.json into the output folder."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("data_dir", type=Path, help="data_raw folder with disasters.csv and temperature.csv")
    parser.add_argument("out_dir", type=Path, help="folder for the PNG files and captions.json")
    args = parser.parse_args()
    use_arial()
    counts = load_disaster_counts(args.data_dir)
    temperature = load_temperature_change(args.data_dir)
    captions = [
        chart_world_total(counts, args.out_dir),
        chart_by_type(counts, args.out_dir),
        chart_world_temperature(temperature, args.out_dir),
        chart_top_countries(counts, args.out_dir),
        chart_reporting_countries(counts, args.out_dir),
        chart_warming_vs_change(counts, temperature, args.out_dir),
    ]
    (args.out_dir / "captions.json").write_text(json.dumps(captions, indent=2, ensure_ascii=False) + "\n",
                                                encoding="utf-8")


if __name__ == "__main__":
    main()
