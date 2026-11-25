# -*- coding: utf-8 -*-
"""讀文學院院學士學位課程清單（xlsx），把課號與識別碼併進 college-course-codes.json。

文學院逐學期公告的清單直接列了課號、課程識別碼與該課屬於哪個系的特色課程／群組，
比查課程網可靠，所以同名課以這份為準。清單含授課教師與上課時間，那些不會寫進專案。

執行：python scripts/liberal-arts-courses.py <課程清單.xlsx>
"""
import io
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scripts", "college-course-codes.json")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

CODE = re.compile(r"^[A-Za-z&]{2,}\s*\d[\w]*$")
IDENTIFIER = re.compile(r"^[0-9A-Z]{3}\s?[0-9A-Z]{5}$")


def rows(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

    for name in sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet")):
        for row in ET.fromstring(z.read(name)).iter(f"{NS}row"):
            cells = []
            for cell in row.findall(f"{NS}c"):
                v = cell.find(f"{NS}v")
                inline = cell.find(f"{NS}is")
                if cell.get("t") == "s" and v is not None:
                    cells.append(shared[int(v.text)])
                elif inline is not None:
                    cells.append("".join(t.text or "" for t in inline.iter(f"{NS}t")))
                else:
                    cells.append(v.text if v is not None else "")
            yield [(c or "").strip() for c in cells]


def main():
    if len(sys.argv) < 2:
        sys.exit("用法：python scripts/liberal-arts-courses.py <課程清單.xlsx>")

    found = {}
    pending_code = None
    for cells in rows(sys.argv[1]):
        joined = [c for c in cells if c]
        if not joined:
            continue
        # 每筆的格式是「課號 | 班次 | 課名 | 學分 | …」，識別碼落在下一列
        code = next((c for c in joined if CODE.match(c)), None)
        identifier = next((c for c in joined if IDENTIFIER.match(c)), None)
        if code:
            title = ""
            i = cells.index(code)
            for c in cells[i + 1:]:
                if c and not re.fullmatch(r"[\d.]+", c):
                    title = c
                    break
            if title:
                pending_code = {"code": re.sub(r"\s+", "", code), "title": title}
        if identifier and pending_code:
            name = re.sub(r"\s+", "", pending_code["title"])
            entry = found.setdefault(name, {"codes": set(), "deptPrefixes": set(), "hits": 0})
            entry["codes"].add(pending_code["code"])
            entry["deptPrefixes"].add(identifier[:3])
            entry["hits"] += 1
            pending_code = None

    cache = {"semesters": [], "courses": {}}
    if os.path.exists(OUT):
        cache = json.load(io.open(OUT, encoding="utf-8"))

    added = 0
    for name, v in found.items():
        codes = sorted(v["codes"])
        before = cache["courses"].get(name, {}).get("code")
        cache["courses"][name] = {
            "code": codes[0] if len(codes) == 1 else "",
            "codes": codes,
            "deptPrefixes": sorted(v["deptPrefixes"]),
            "hits": v["hits"],
            "source": "文學院院學士課程清單",
        }
        if cache["courses"][name]["code"] and not before:
            added += 1

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)

    print(f"清單共 {len(found)} 門課，其中 {added} 門是新補上的唯一課號 -> {OUT}")


if __name__ == "__main__":
    main()
