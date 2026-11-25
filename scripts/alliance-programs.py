# -*- coding: utf-8 -*-
"""產生 public/data/alliance-programs.json：臺大系統跨校雙主修、輔系的各系應修科目表。

臺科大：教務處註冊組公告的「各系應修科目表」PDF（輔系、雙主修各一份），逐系抽出科目與學分。
臺師大：課架由校內「課架查詢系統」逐系公告，該系統擋自動存取，所以只放系所清單與學分範圍，
        科目表請使用者自行到該系統查。

執行：python scripts/alliance-programs.py（需要 pymupdf，會上網抓 PDF）
"""
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "alliance-programs.json")

YEAR = "115"
NTUST = {
    "輔系": f"https://academic.ntust.edu.tw/var/file/48/1048/img/2790/{YEAR}ass-sub.pdf",
    "雙主修": f"https://academic.ntust.edu.tw/var/file/48/1048/img/2790/{YEAR}double.pdf",
}

# 章節標題：「115 學年度機械工程系輔系應修科目表」。目錄頁的標題後面接著點點與頁碼，要排掉。
HEADING = re.compile(rf"^{YEAR}\s*學年度(.+?)(?:輔系|雙主修)應修(?:科|課)目表\s*$")
# 合計列的寫法各系不一：應修學分總數／最低修習學分總數／最低學分總數／應修總學分數
TOTAL = re.compile(r"^.{0,5}學分(?:總數|數)$")
# 已停招的學程，表上只有一段說明
# 停招說明在 PDF 裡會跨行斷開，所以認片語的任一半
CLOSED = re.compile(r"停止受|理申請修讀「")
CREDITS = re.compile(r"^(\d+(?:\.\d+)?)$")
# 合計值可能是範圍並帶說明，如「20-21 學分（含必修…）」，取下限
TOTAL_VALUE = re.compile(r"(\d+(?:\.\d+)?)")
# 直排的「左列科目任選至少三學分以上」會被抽成一個字一行，接起來才看得懂
VERTICAL = re.compile(r"^.$")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def pages(data: bytes):
    import fitz
    doc = fitz.open(stream=data, filetype="pdf")
    return [p.get_text("text") for p in doc]


def parse(text_pages, kind: str):
    """回傳 [(系名, 科目清單, 應修學分總數, 備註)]。"""
    sections = []
    current = None
    # 一個系的表可能跨頁，整份接成一串再掃，學分總數才不會被頁邊切掉
    lines = [ln.strip() for page in text_pages for ln in page.splitlines()]
    lines = [ln for ln in lines if ln]
    if True:
        for i, line in enumerate(lines):
            m = HEADING.match(line)
            if m and ("." not in line):
                current = {"dept": m.group(1).strip(), "courses": [], "total": None,
                           "totalText": "", "closed": "", "notes": []}
                sections.append(current)
                continue
            if current is None:
                continue
            if TOTAL.match(line):
                nxt = lines[i + 1] if i + 1 < len(lines) else ""
                t = TOTAL_VALUE.search(nxt)
                if t and current["total"] is None:
                    current["total"] = float(t.group(1))
                    current["totalText"] = re.sub(r"\s+", " ", nxt)
                continue
            if CLOSED.search(line):
                current["closed"] = re.sub(r"\s+", "", line)
                continue
            if line.startswith("備註"):
                current["notes"].append(line)
                continue
            # 科目名稱後面緊跟著學分數
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if CREDITS.match(nxt) and not CREDITS.match(line) and not VERTICAL.match(line) \
                    and "學分" not in line and not line.startswith("應修") and not line.startswith("科目"):
                current["courses"].append({"name": line, "credits": float(nxt)})
    return sections


def clean(sections):
    out = []
    for s in sections:
        seen = set()
        courses = []
        for c in s["courses"]:
            name = re.sub(r"\s+", "", c["name"])
            # 換頁的頁碼會被當成學分數，課名則可能撿到備註句；學分上限 10 可以濾掉絕大多數
            if name in seen or len(name) < 2 or c["credits"] > 10:
                continue
            if "。" in name or "，" in name or name in {"選修", "必修", "刪除", "備註"}:
                continue
            if re.match(r"^\d+[.、]", name) or name.startswith("("):
                continue
            seen.add(name)
            credits = c["credits"]
            courses.append({"name": name, "credits": int(credits) if credits == int(credits) else credits})
        entry = {
            "dept": re.sub(r"\s+", "", s["dept"]),
            "total": s["total"],
            "courses": courses,
        }
        if s.get("closed"):
            entry["closed"] = s["closed"]
        # 清單學分加起來還不到應修總數，表示表上列的是必修、其餘由該系課程自由補足（all）；
        # 加起來已經夠（或更多），表示那是一份可選清單（pick）。
        listed = sum(c["credits"] for c in courses)
        if s["total"] and courses:
            entry["mode"] = "all" if listed < s["total"] else "pick"
            entry["listedCredits"] = listed
        # 合計是範圍或附帶條件時留原文，介面可以照實顯示
        if s.get("totalText") and not re.fullmatch(r"\d+(?:\.\d+)?\s*(?:學分)?", s["totalText"]):
            entry["totalText"] = s["totalText"]
        out.append(entry)
    return out


# 臺師大系所清單取自課架查詢系統 CourseStructCtrl?action=getDept（大學部設有雙主修、輔系的學系）
NTNU_DEPTS = [
    "教育系", "心輔系", "社教系", "衛教系", "幼家科學系", "公領系", "特教系", "學習科學學位學程",
    "國文系", "英語系", "華語系", "歷史系", "地理系", "臺文系", "東亞系",
    "數學系", "物理系", "化學系", "生命科學系", "地科系", "資工系", "電機系", "光電工程學士學位學程",
    "體育與運動科學系", "運休所", "美術系", "設計系", "音樂系", "表演藝術學士學位學程",
    "科技應用與人力資源發展學系", "圖文傳播系", "機電工程系", "工教系",
    "社工所", "大傳所", "人管所", "企管系", "管理學院學士班",
]


# 表上沒寫應修總數、但條文把組成列清楚的，依組成補上，並留下算式讓使用者核對
OVERRIDES = {
    ("臺科大", "電機工程系", "雙主修"): {
        "total": 44,
        "totalText": "44 學分（專業必修 29 學分＋領域選修正課十選四 12 學分＋領域選修實習八選三 3 學分）",
    },
}


def main():
    result = {
        "updated": "2026-11-25",
        "schools": [
            {
                "school": "臺科大",
                "year": YEAR,
                "source": "臺科大教務處註冊組「各系應修科目表」",
                "docName": "應修科目表",
                "note": "表上的科目才採計；備註另有先修或成績門檻的，以該系公告為準。",
                "programs": [],
            },
            {
                "school": "臺師大",
                "year": YEAR,
                "source": "臺師大課架查詢系統",
                "docName": "課程架構表",
                "sourceUrl": "https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/index.jsp",
                "note": "臺師大的雙主修（40–50 學分）、輔系（20–30 學分）課架逐系公告於課架查詢系統，"
                        "該系統擋自動擷取，工具只列得出系所清單；請到課架查詢系統查該系科目表後自行填學分。",
                "programs": [{"dept": d, "輔系": None, "雙主修": None} for d in NTNU_DEPTS],
            },
        ],
    }

    by_dept = {}
    for kind, url in NTUST.items():
        print(f"fetching {kind} …", file=sys.stderr)
        sections = clean(parse(pages(fetch(url)), kind))
        for s in sections:
            entry = by_dept.setdefault(s["dept"], {"dept": s["dept"]})
            plan = {k: v for k, v in s.items() if k != "dept"}
            plan.update(OVERRIDES.get(("臺科大", s["dept"], kind), {}))
            # 補上總數的也要重算清單模式
            if plan.get("total") and plan.get("courses") and "mode" not in plan:
                listed = sum(c["credits"] for c in plan["courses"])
                plan["listedCredits"] = listed
                plan["mode"] = "all" if listed < plan["total"] else "pick"
            entry[kind] = plan

    result["schools"][0]["programs"] = [by_dept[k] for k in sorted(by_dept)]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {OUT}")
    for p in result["schools"][0]["programs"]:
        m = p.get("輔系") or {}
        d = p.get("雙主修") or {}
        print(f"  {p['dept']:24} 輔系 {str(m.get('total')):>5} ({len(m.get('courses', []))} 科)"
              f"  雙主修 {str(d.get('total')):>5} ({len(d.get('courses', []))} 科)")


if __name__ == "__main__":
    main()
