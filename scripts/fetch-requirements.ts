/**
 * 從台大必修課程查詢系統抓各系應修學分與系訂必修科目，並從教務處「轉系、輔系及雙主修相關規定查詢」
 * 抓輔系與雙主修規定，輸出成 public/data/requirements/{年度}.json。
 *
 * 用法：node scripts/fetch-requirements.ts [起始年度] [結束年度]（預設 110 115）
 *
 * 該站沒有 CORS，網頁無法在瀏覽器端直接抓，所以在建置前先抓好。
 * 原始 HTML 快取在 scripts/.cache，重跑只會補抓缺的頁面；請求之間固定間隔，避免造成學校伺服器負擔。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRequiredCourses, parseRequirementPage } from '../src/core/curri.ts'
import { parseRulePage, type RulePage } from '../src/core/regrules.ts'

const BASE = 'https://curri.aca.ntu.edu.tw/NTUVoxCourse/index.php'
const DELAY_MS = 400
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT = join(ROOT, 'public', 'data', 'requirements')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string, cacheFile: string): Promise<string> {
  if (existsSync(cacheFile)) return readFile(cacheFile, 'utf8')
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ntu-credit-calculator/0.1 (student project)' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.text()
      // 錯誤頁不快取，下次重跑才會再試
      if (!body.includes('無此系所')) {
        await mkdir(dirname(cacheFile), { recursive: true })
        await writeFile(cacheFile, body)
      }
      return body
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${(err as Error).message}`)
      await sleep(DELAY_MS * 5 * attempt)
    }
  }
}

const REG_RULES = 'https://reg227.aca.ntu.edu.tw/tmd/stuquery/show_s.asp'
/** 該站是 Big5 表單，查詢類別與送出按鈕的值要以 Big5 編碼 */
const RULE_KIND = { minor: '%BB%B2%A8t', doubleMajor: '%C2%F9%A5D%AD%D7' } as const
const SUBMIT = '%ACd%B8%DF'

async function getRule(year: string, kind: keyof typeof RULE_KIND, code: string): Promise<RulePage | undefined> {
  const cacheFile = join(CACHE, year, `${code}-${kind}.html`)
  if (existsSync(cacheFile)) return parseRulePage(await readFile(cacheFile, 'utf8')) ?? undefined
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS)
    try {
      const res = await fetch(REG_RULES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ntu-credit-calculator/0.1 (student project)',
        },
        body: `year=${year}&select=${RULE_KIND[kind]}&dept_code=${code}&search=${SUBMIT}`,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = new TextDecoder('big5').decode(await res.arrayBuffer())
      await mkdir(dirname(cacheFile), { recursive: true })
      await writeFile(cacheFile, body)
      return parseRulePage(body) ?? undefined
    } catch (err) {
      if (attempt >= 3) throw new Error(`${kind} ${year} ${code}: ${(err as Error).message}`)
      await sleep(DELAY_MS * 5 * attempt)
    }
  }
}

type Dept = { value: string; data: string; text: string }

async function fetchYear(year: string) {
  const list = JSON.parse(
    await get(`${BASE}/api/departments?year=${year}&lang=zh`, join(CACHE, year, 'departments.json')),
  ) as { success: boolean; data: Dept[] }
  if (!list.success) throw new Error(`${year} 系所清單讀取失敗`)

  const departments = []
  const problems: string[] = []

  for (const dept of list.data) {
    // value 才是查詢用代碼：分學群／分組的系是 5 碼（如 60800），一般系與 data 相同為 4 碼
    const code = dept.value.trim()
    const name = dept.text.trim()
    const q = `DPRNDPT=${code}&QPYEAR=${year}`
    const page = parseRequirementPage(await get(`${BASE}/uquery/tc?${q}`, join(CACHE, year, `${code}-tc.html`)))
    if (!page) {
      problems.push(`${code} ${name}：應修學分表解析失敗`)
      continue
    }

    const requiredCourses = []
    for (const [i, credits] of page.majorByGrade.entries()) {
      if (credits === 0) continue
      const grade = i + 1
      const html = await get(`${BASE}/uquery/cou?${q}&MSLGRD=${grade}`, join(CACHE, year, `${code}-cou-${grade}.html`))
      for (const c of parseRequiredCourses(html)) {
        if (!requiredCourses.some((x) => x.code === c.code && x.identifier === c.identifier)) requiredCourses.push(c)
      }
    }

    // 群組別的意義各系不同（有的是數選一、有的只是分類），只在連群修都湊不滿時才提醒
    const listed = requiredCourses.reduce((s, c) => s + c.credits, 0)
    const major = page.requirements.major ?? 0
    if (listed < major) problems.push(`${code} ${name}：必修科目表只列出 ${listed} 學分，應修 ${major}`)

    // 教務處規定查詢用 4 碼；分學群的系（60800）對應整個學系（6080）
    const ruleCode = code.slice(0, 4)
    const minor = await getRule(year, 'minor', ruleCode)
    const doubleMajor = await getRule(year, 'doubleMajor', ruleCode)

    departments.push({
      code,
      name,
      deptPrefix: dept.data.trim().slice(0, 3),
      requirements: page.requirements,
      chinesePlans: page.chinesePlans,
      creditRules: page.creditRules,
      requiredCourses,
      ...(minor ? { minor } : {}),
      ...(doubleMajor ? { doubleMajor } : {}),
    })
    process.stdout.write('.')
  }

  await mkdir(OUT, { recursive: true })
  await writeFile(
    join(OUT, `${year}.json`),
    JSON.stringify({ year, fetchedAt: new Date().toISOString().slice(0, 10), departments }),
  )
  console.log(`\n${year}：${departments.length}/${list.data.length} 個系所`)
  for (const p of problems) console.log(`  ⚠ ${p}`)
  return departments.length > 0
}

const [from = '110', to = '115'] = process.argv.slice(2)
const years: string[] = []
for (let y = Number(to); y >= Number(from); y--) {
  if (await fetchYear(String(y))) years.push(String(y))
}
await writeFile(join(OUT, 'index.json'), JSON.stringify({ years }))
console.log(`完成：${years.join('、')}`)
