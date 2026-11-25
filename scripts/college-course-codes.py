# -*- coding: utf-8 -*-
"""查台大課程網，幫院學士科目補上課號與課程識別碼。

修業辦法只寫課名，光靠課名比對會把他系的同名課也算進來。這支程式用課程網的
系所課程查詢逐一查課名，只有全校同名課都指向同一個課號時才採用，其餘留空，
由 college-degrees.py 寫進 public/data/college-degrees.json。

執行：python scripts/college-course-codes.py [學期]（預設 115-1，會上網）
"""
import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEGREES = os.path.join(ROOT, "public", "data", "college-degrees.json")
OUT = os.path.join(ROOT, "scripts", "college-course-codes.json")

# 下學期才開的課（中國思想史下）在上學期查不到，所以上下學期都查
SEMESTERS = sys.argv[1:] or ["115-1", "114-2"]
BASE = "https://nol.ntu.edu.tw/nol/coursesearch/search_for_02_dpt.php"

ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
CELL = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
# 課號如 AtmSci1009、Econ1007；識別碼如 209 12400
CODE = re.compile(r"^[A-Za-z&]{2,}\s*\d[\w]*$")
IDENTIFIER = re.compile(r"^[0-9A-Z]{3}\s?[0-9A-Z]{5}$")


def text(cell: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", cell))).strip()


def search(name: str, sem: str) -> list[dict]:
    params = {
        "current_sem": sem, "dpt_sel": "0", "dptname": "0", "yearcode": "0",
        "selcode": "-1", "coursename": name, "teachername": "",
        "alltime": "yes", "allproced": "yes", "allsel": "yes", "page_cnt": "150",
    }
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        page = r.read().decode("utf-8", "replace")

    out = []
    for raw in ROW.findall(page):
        cells = [text(c) for c in CELL.findall(raw)]
        if len(cells) < 10:
            continue
        code = next((c for c in cells if CODE.match(c)), "")
        identifier = next((c for c in cells if IDENTIFIER.match(c)), "")
        if not code or not identifier:
            continue
        # 課名在課號之後、學分之前；取課號右邊第一個非空、非數字的欄位
        i = cells.index(code)
        title = next((c for c in cells[i + 1:] if c and not re.fullmatch(r"[\d.]+", c)), "")
        out.append({"code": code, "identifier": identifier, "title": title})
    return out


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def main():
    degrees = json.load(io.open(DEGREES, encoding="utf-8"))["degrees"]
    names = sorted({c["name"] for d in degrees for c in d["courses"]})

    cache = {}
    if os.path.exists(OUT):
        cache = json.load(io.open(OUT, encoding="utf-8")).get("courses", {})

    for n, name in enumerate(names, 1):
        if name in cache:
            continue
        exact = []
        for sem in SEMESTERS:
            try:
                rows = search(name, sem)
            except Exception as exc:  # noqa: BLE001 - 單一課名查不到不該中斷整批
                print(f"  ! {name} ({sem}): {exc}", file=sys.stderr)
                continue
            exact += [r for r in rows if squash(r["title"]) == squash(name)]
            time.sleep(0.3)
            if exact:
                break
        codes = sorted({r["code"] for r in exact})
        prefixes = sorted({r["identifier"][:3] for r in exact})
        cache[name] = {
            "code": codes[0] if len(codes) == 1 else "",
            "codes": codes,
            "deptPrefixes": prefixes,
            "hits": len(exact),
        }
        print(f"[{n}/{len(names)}] {name} -> {codes if codes else '找不到'}", file=sys.stderr)

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump({"semesters": SEMESTERS, "courses": cache}, f, ensure_ascii=False, indent=0, sort_keys=True)

    single = sum(1 for v in cache.values() if v["code"])
    none = sum(1 for v in cache.values() if v["hits"] == 0)
    print(f"\n{len(cache)} 個課名：{single} 個有唯一課號、{len(cache) - single - none} 個同名多課、{none} 個查不到")


if __name__ == "__main__":
    main()
