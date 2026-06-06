# Rebuilds data/cbl/cbl26.json.gz from DOB's Covered Buildings List workbook.
#
# The CBL is published yearly as Excel on the DOB sustainability page
# (https://www.nyc.gov/site/buildings/codes/ll97-greenhouse-gas-emissions-reductions.page,
# "Covered Buildings List" - cbl26.xlsx for filing year 2026). One row per
# BIN; we aggregate to BBL and keep only buildings covered by at least one
# sustainability law, which shrinks 1M rows to ~29k entries.
#
# Usage:
#   curl -sL -A "Mozilla/5.0" -o /tmp/cbl.xlsx https://www.nyc.gov/assets/buildings/excel/cbl26.xlsx
#   python3 data/scripts/refresh-cbl.py /tmp/cbl.xlsx data/cbl/cbl26.json.gz "Filing Year 2026"

import gzip
import json
import re
import sys
import zipfile
from datetime import date

workbook_path, output_path, edition = sys.argv[1], sys.argv[2], sys.argv[3]

workbook = zipfile.ZipFile(workbook_path)
shared_xml = workbook.read("xl/sharedStrings.xml").decode("utf8")
string_items = re.findall(r"<si>(.*?)</si>", shared_xml, re.S)
shared = ["".join(re.findall(r"<t[^>]*>([^<]*)</t>", item)) for item in string_items]


def to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


# Columns in the data sheet: A=BBL, B=BIN, C=on LL97 CBL, D=LL97 compliance
# pathway (0-4; 3 means Article 321), E=on LL84 CBL, G=on LL88 CBL,
# H=on LL87, I=DOF address, L=DOF gross square footage.
sheet = workbook.read("xl/worksheets/sheet2.xml").decode("utf8")
cell_pattern = re.compile(r"<c ([^>]*?)/?>(?:<v>([^<]*)</v>)?(?:</c>)?")
ref_pattern = re.compile(r'r="([A-Z]+)\d+"')
type_pattern = re.compile(r't="(\w+)"')

buildings = {}
for row in re.finditer(r"<row[^>]*>(.*?)</row>", sheet, re.S):
    cells = {}
    for attrs, value in cell_pattern.findall(row.group(1)):
        ref = ref_pattern.search(attrs)
        cell_type = type_pattern.search(attrs)
        if ref:
            is_shared = cell_type and cell_type.group(1) == "s" and value
            cells[ref.group(1)] = shared[int(value)] if is_shared else value

    bbl = cells.get("A")
    if not bbl or bbl == "BBL":
        continue

    ll97 = cells.get("C") == "Y"
    ll84 = cells.get("E") == "Y"
    ll88 = cells.get("G") == "Y"
    ll87 = cells.get("H") == "Y"
    if not (ll97 or ll84 or ll88 or ll87):
        continue

    entry = buildings.setdefault(
        bbl,
        {"ll97": False, "cp": [], "ll84": False, "ll87": False, "ll88": False, "gsf": None, "addr": None},
    )
    entry["ll97"] |= ll97
    entry["ll84"] |= ll84
    entry["ll87"] |= ll87
    entry["ll88"] |= ll88

    pathway = to_int(cells.get("D"))
    if pathway is not None and pathway not in entry["cp"]:
        entry["cp"].append(pathway)
    if entry["gsf"] is None:
        entry["gsf"] = to_int(cells.get("L"))
    if entry["addr"] is None:
        entry["addr"] = cells.get("I")

snapshot = {
    "source": f"DOB Sustainability Covered Buildings List, {edition} (retrieved {date.today().isoformat()})",
    "buildings": buildings,
}
with gzip.open(output_path, "wt") as out:
    json.dump(snapshot, out, separators=(",", ":"))

print(f"{len(buildings)} covered BBLs -> {output_path}")
