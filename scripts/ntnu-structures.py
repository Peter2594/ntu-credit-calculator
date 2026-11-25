# -*- coding: utf-8 -*-
"""抓臺師大各系的雙主修、輔系課程架構表，併進 public/data/alliance-programs.json。

臺師大課架查詢系統的報表端點會直接產生 PDF：
  CourseStructReportCtrl?action=getStruct&type=pdf&lang=&year=<學年>&deptCode=<系所>&sst=<學制>&cssgno=
學制 U2 是雙主修、U3 是輔系（取自該系統的 getUMD）。

執行：python scripts/ntnu-structures.py [學年]（預設 115，需要 pymupdf，會上網）
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "alliance-programs.json")
CACHE = os.path.join(ROOT, "scripts", "ntnu-structures.json")

YEAR = sys.argv[1] if len(sys.argv) > 1 else "115"
REPORT = "https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/CourseStructReportCtrl"
SST = {"雙主修": "U2", "輔系": "U3"}

# 大學部設有雙主修、輔系的系所，代碼取自該系統的 getDept
DEPTS = {
    "EU00": "教育系", "EU01": "心輔系", "EU02": "社教系", "EU05": "衛教系",
    "EU06": "幼家科學系", "EU07": "公領系", "EU09": "特教系", "EU11": "學習科學學位學程",
    "HU00": "國文系", "HU01": "英語系", "HU03": "歷史系", "HU04": "地理系",
    "HU05": "臺文系", "HU06": "東亞系", "HU08": "華語系",
    "SU00": "數學系", "SU01": "物理系", "SU02": "化學系", "SU03": "生命科學系",
    "SU04": "地科系", "SU05": "資工系", "SU06": "營養科學學位學程",
    "TU00": "科技應用與人力資源發展學系", "TU01": "圖文傳播系", "TU02": "機電工程系",
    "TU03": "電機系", "TU04": "光電工程學士學位學程",
    "AU00": "美術系", "AU01": "設計系",
    "MU00": "音樂系", "MU02": "表演藝術學士學位學程",
    "PU00": "體育與運動科學系",
    "CU00": "企管系", "CU01": "管理學院學士班",
}

CODE = re.compile(r"^[A-Z0-9]{3,}\d{3,}$")
CREDITS = re.compile(r"^(\d+(?:\.\d+)?)$")
REQUIRED_TOTAL = re.compile(r"必修課程，應修\s*(\d+(?:\.\d+)?)\s*學分")
ELECTIVE_TOTAL = re.compile(r"選修課程，應修\s*(\d+(?:\.\d+)?)\s*學分")
# 課名前面有流水號與全英語授課標記，如「4 E 教育研究法」「1   西洋教育史」
TITLE = re.compile(r"^\d+\s+(?:E\s+)?(.+)$")


def fetch(dept: str, sst: str) -> bytes:
    url = f"{REPORT}?action=getStruct&type=pdf&lang=&year={YEAR}&deptCode={dept}&sst={sst}&cssgno="
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def parse(data: bytes) -> dict | None:
    import fitz
    doc = fitz.open(stream=data, filetype="pdf")
    text = "\n".join(p.get_text("text") for p in doc)
    if "課程架構表" not in text:
        return None

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    required = REQUIRED_TOTAL.search(text)
    elective = ELECTIVE_TOTAL.search(text)

    courses, seen = [], set()
    for i, line in enumerate(lines):
        if not CODE.match(line):
            continue
        m = TITLE.match(lines[i + 1]) if i + 1 < len(lines) else None
        credit = CREDITS.match(lines[i + 2]) if i + 2 < len(lines) else None
        if not m or not credit:
            continue
        name = re.sub(r"\s+", "", m.group(1))
        if name in seen:
            continue
        seen.add(name)
        value = float(credit.group(1))
        courses.append({"name": name, "credits": int(value) if value == int(value) else value})

    total = (float(required.group(1)) if required else 0) + (float(elective.group(1)) if elective else 0)
    return {
        "total": total if total else None,
        "requiredCredits": float(required.group(1)) if required else None,
        "electiveCredits": float(elective.group(1)) if elective else None,
        "courses": courses,
    }


def main():
    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}

    for code, name in DEPTS.items():
        for kind, sst in SST.items():
            key = f"{code}|{sst}"
            if key in cache:
                continue
            try:
                plan = parse(fetch(code, sst))
            except Exception as exc:  # noqa: BLE001 - 單一系查不到不該中斷整批
                print(f"  ! {name} {kind}: {exc}", file=sys.stderr)
                continue
            cache[key] = {"dept": name, "kind": kind, **(plan or {"missing": True})}
            n = len(plan["courses"]) if plan else 0
            print(f"{name} {kind}: {plan['total'] if plan else '無課架'} 學分、{n} 科", file=sys.stderr)
            time.sleep(0.6)

    with io.open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)

    # 併進 alliance-programs.json 的臺師大區塊
    data = json.load(io.open(OUT, encoding="utf-8"))
    ntnu = next(s for s in data["schools"] if s["school"] == "臺師大")
    by_dept: dict[str, dict] = {}
    for v in cache.values():
        if v.get("missing"):
            continue
        entry = by_dept.setdefault(v["dept"], {"dept": v["dept"]})
        plan = {k: v[k] for k in ("total", "requiredCredits", "electiveCredits", "courses") if k in v}
        if plan.get("total") and plan.get("courses"):
            listed = sum(c["credits"] for c in plan["courses"])
            plan["listedCredits"] = listed
            plan["mode"] = "all" if listed < plan["total"] else "pick"
        entry[v["kind"]] = plan

    if by_dept:
        ntnu["programs"] = [by_dept[k] for k in sorted(by_dept)]
        ntnu["source"] = "臺師大課架查詢系統的課程架構表"
        ntnu["note"] = ("課名以臺師大課架表為準；臺大成績單上的跨校課名可能多了（教）之類的後綴，"
                        "比對時會忽略括號內容。認列與兼充由原就讀校系與加修學系認定。")

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n{len(by_dept)} 個系寫進 {OUT}")


if __name__ == "__main__":
    main()
