# -*- coding: utf-8 -*-
"""抓臺師大各系的雙主修、輔系課程架構表，併進 public/data/alliance-programs.json。

臺師大課架查詢系統的報表端點會直接產生 PDF：
  CourseStructReportCtrl?action=getStruct&type=pdf&lang=&year=<學年>&deptCode=<系所>&sst=<學制>&cssgno=
學制 U2 是雙主修、U3 是輔系（取自該系統的 getUMD）。

課架查詢系統擋自動擷取，所以 PDF 由使用者用 scripts/ntnu-download.html 在瀏覽器下載，
這支程式讀整個資料夾、從每份 PDF 的標題認出是哪個系的哪一種課架（下載順序不影響）。

執行：python scripts/ntnu-structures.py <PDF 資料夾> [學年]
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

# Windows 主控台預設 cp950，印中文系名會炸，統一用 UTF-8 輸出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "alliance-programs.json")
CACHE = os.path.join(ROOT, "scripts", "ntnu-structures.json")

FOLDER = sys.argv[1] if len(sys.argv) > 1 else ""
YEAR = sys.argv[2] if len(sys.argv) > 2 else "115"
REPORT = "https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/CourseStructReportCtrl"
SST = {"雙主修": "U2", "輔系": "U3"}

# 大學部設有雙主修、輔系的系所，代碼取自該系統的 getDept
DEPTS = {
    # 教育學院
    "EU00": "教育系", "EU01": "心輔系", "EU02": "社教系", "EU05": "衛教系",
    "EU06": "幼家科學系", "EU07": "公領系", "EU09": "特教系",
    "EU11": "學習科學學位學程", "EU13": "教院學士班",
    # 文學院
    "LU20": "國文系", "LU21": "英語系", "LU22": "歷史系", "LU23": "地理系", "LU26": "臺文系",
    # 理學院
    "SU40": "數學系", "SU41": "物理系", "SU42": "化學系", "SU43": "生科系",
    "SU44": "地科系", "SU47": "資工系", "SU51": "營養學位學程",
    # 藝術學院
    "TU60": "美術系", "TU68": "設計系",
    # 科技與工程學院
    "HU70": "工教系", "HU71": "科技系", "HU72": "圖傳系", "HU73": "機電系",
    "HU75": "電機系", "HU76": "車能學位學程", "HU77": "光電學位學程",
    # 運動與休閒學院
    "AU30": "體育系", "AU32": "競技系",
    # 國際與社會科學學院
    "IU83": "東亞系", "IU84": "華語系", "IUH0": "全球研究學位學程",
    # 音樂學院
    "MU90": "音樂系", "MU92": "表藝系",
    # 管理學院
    "OU57": "企管系",
}

CODE = re.compile(r"^[A-Z0-9]{3,}\d{3,}$")
CREDITS = re.compile(r"^(\d+(?:\.\d+)?)$")
REQUIRED_TOTAL = re.compile(r"必修課程，應修\s*(\d+(?:\.\d+)?)\s*學分")
ELECTIVE_TOTAL = re.compile(r"選修課程，應修\s*(\d+(?:\.\d+)?)\s*學分")
# 課名前面有流水號與全英語授課標記，如「4 E 教育研究法」「1   西洋教育史」；
# 分課群的系編號寫成「1-1   語言學概論」
TITLE = re.compile(r"^\d+(?:-\d+)*\s+(?:E\s+)?(.+)$")
# 總計學分數區塊的一列，如「28.0」「視覺設計組 30.0學分」
TOTAL_ROW = re.compile(r"^(?:(\D+?)\s+)?(\d+(?:\.\d+)?)\s*(?:學分)?$")


def fetch(dept: str, sst: str) -> bytes:
    url = f"{REPORT}?action=getStruct&type=pdf&lang=&year={YEAR}&deptCode={dept}&sst={sst}&cssgno="
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def parse(data: bytes) -> dict | None:
    import fitz
    doc = fitz.open(stream=data, filetype="pdf")
    text = "\n".join(p.get_text("text") for p in doc)
    title = next((ln.strip() for ln in text.splitlines() if "課程架構表" in ln), "")
    if not title:
        return None
    m = re.match(r"^國立臺灣師範大學(.+?)(雙主修|輔系)課程架構表$", title.strip())
    if not m:
        return None
    dept, kind = m.group(1), m.group(2)

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

    # 「總計學分數」區塊才是真的應修總數：分組的系（如設計系視覺／產品設計組）
    # 會列出每組的必修、選修與總計，條文開頭的「必修課程，應修X學分」只是共同部分。
    totals: dict[str, float] = {}
    try:
        start = lines.index("總計學分數") + 1
    except ValueError:
        start = len(lines)
    for line in lines[start:]:
        if line.startswith("科目代碼"):
            break
        m2 = TOTAL_ROW.match(line)
        if not m2:
            continue
        value = float(m2.group(2))
        # 「115」那一列是適用學年度，不是學分
        if m2.group(1) is None and value == int(value) and 100 <= value <= 199 and "學分" not in line:
            continue
        totals[m2.group(1) or ""] = value

    fallback = (float(required.group(1)) if required else 0) + (float(elective.group(1)) if elective else 0)
    total = min(totals.values()) if totals else (fallback or None)
    result = {
        "dept": dept,
        "kind": kind,
        "total": total,
        "requiredCredits": float(required.group(1)) if required else None,
        "electiveCredits": float(elective.group(1)) if elective else None,
        "courses": courses,
    }
    if len(totals) > 1:
        result["totalText"] = "、".join(f"{k}{v:g} 學分" for k, v in totals.items())
    return result


def main():
    if not FOLDER or not os.path.isdir(FOLDER):
        sys.exit("用法：python scripts/ntnu-structures.py <PDF 資料夾> [學年]\n"
                 "PDF 請先用 scripts/ntnu-download.html 在瀏覽器下載。")

    plans = []
    skipped = []
    for name in sorted(os.listdir(FOLDER)):
        if not name.lower().endswith(".pdf"):
            continue
        path = os.path.join(FOLDER, name)
        try:
            plan = parse(io.open(path, "rb").read())
        except Exception as exc:  # noqa: BLE001 - 壞掉的檔案不該中斷整批
            skipped.append(f"{name}（{exc}）")
            continue
        if plan is None:
            # 資料夾裡多半混著使用者自己的 PDF，只回報看起來是從下載頁存下來的那些
            if name.lower().startswith("coursestructreport"):
                skipped.append(f"{name}（伺服器沒給課架表）")
            continue
        plans.append(plan)
        print(f"{plan['dept']} {plan['kind']}：{plan['total']} 學分、{len(plan['courses'])} 科", file=sys.stderr)

    if not plans:
        sys.exit("資料夾裡沒有讀得到的課架表 PDF")

    by_dept: dict[str, dict] = {}
    for plan in plans:
        entry = by_dept.setdefault(plan["dept"], {"dept": plan["dept"]})
        body = {k: plan[k] for k in ("total", "requiredCredits", "electiveCredits", "courses")}
        if body["total"] and body["courses"]:
            listed = sum(c["credits"] for c in body["courses"])
            body["listedCredits"] = listed
            body["mode"] = "all" if listed < body["total"] else "pick"
        entry[plan["kind"]] = body

    data = json.load(io.open(OUT, encoding="utf-8"))
    ntnu = next(s for s in data["schools"] if s["school"] == "臺師大")
    ntnu["programs"] = [by_dept[k] for k in sorted(by_dept)]
    ntnu["year"] = YEAR
    ntnu["source"] = "臺師大課架查詢系統的課程架構表"
    ntnu["docName"] = "課程架構表"
    ntnu["note"] = ("課名以臺師大課架表為準；臺大成績單上的跨校課名可能多了（教）之類的後綴，"
                    "比對時會忽略括號內容。認列與兼充由原就讀校系與加修學系認定。")
    ntnu.pop("sourceUrl", None)

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n{len(by_dept)} 個系、{len(plans)} 份課架寫進 {OUT}")
    if skipped:
        print("略過：" + "、".join(skipped))


if __name__ == "__main__":
    main()
