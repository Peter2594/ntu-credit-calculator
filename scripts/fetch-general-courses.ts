/**
 * 從臺大課程網抓「溝通表達與職涯發展課程（原基本能力課程）」與「新生專題／新生講座」的歷年開課清單，
 * 輸出成 src/core/generalCourses.ts。這兩類課開課單位分散、識別碼沒有共同前綴，只能依清單辨認。
 *
 * 用法：node scripts/fetch-general-courses.ts [起始學年] [結束學年]（預設 108 115）
 *
 * 原始 HTML 快取在 scripts/.cache/nol，重跑只會補抓缺的學期；請求之間固定間隔，避免造成學校伺服器負擔。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://nol2.aca.ntu.edu.tw/nol/coursesearch/search_for_03_co.php'
const DELAY_MS = 1500
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache', 'nol')
const OUT = join(ROOT, 'src', 'core', 'generalCourses.ts')

/** 課程網「通識/新生」查詢的類別代碼 */
const AREAS = { comm: 'b', freshman: 'e' } as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getPage(semester: string, area: string): Promise<string> {
  const cacheFile = join(CACHE, `${semester}-${area}.html`)
  if (existsSync(cacheFile)) return readFile(cacheFile, 'utf8')
  await sleep(DELAY_MS)
  const url = `${BASE}?current_sem=${semester}&classarea=${area}&coursename=&teachername=&alltime=yes&allproced=yes&page_cnt=1000`
  const res = await fetch(url, { headers: { 'User-Agent': 'ntu-credit-calculator/0.1 (student project)' } })
  if (!res.ok) throw new Error(`${semester} ${area}: HTTP ${res.status}`)
  const body = await res.text()
  if (!body.includes('共查詢到')) throw new Error(`${semester} ${area}: 回應不是查詢結果`)
  await mkdir(CACHE, { recursive: true })
  await writeFile(cacheFile, body)
  return body
}

// 本校識別碼如 303 24720、102E24960；臺大系統校際課程如 TBTCG1593
const IDENTIFIER = /^(?=.*\d)[0-9A-Z]{3}\s?[0-9A-Z]{5,6}$/
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** 查詢結果表格的一列：流水號、授課對象、課號、班次、課程名稱、領域專長、學分、課程識別碼、全/半年… */
export function parseRows(html: string): { code: string; name: string; identifier: string }[] {
  const expected = Number(/共查詢到\s*(\d+)/.exec(clean(html))?.[1] ?? NaN)
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((tr) => [...tr[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) => clean(td[1]!)))
    .filter((cells) => cells.length > 8 && IDENTIFIER.test(cells[7]!))
    .map((cells) => ({ code: cells[2]!, name: cells[4]!, identifier: cells[7]! }))
  // 同一門課多個班次會重複列出，筆數以查詢結果為準，對不上就停下來，避免欄位改版時默默產生錯誤清單
  if (rows.length !== expected) throw new Error(`解析出 ${rows.length} 列，查詢結果為 ${expected} 筆`)
  return rows
}

const [from = '108', to = '115'] = process.argv.slice(2)
const semesters: string[] = []
for (let y = Number(from); y <= Number(to); y++) {
  semesters.push(`${y}-1`)
  if (y < Number(to)) semesters.push(`${y}-2`)
}

const found = { comm: new Map<string, string>(), freshman: new Map<string, string>() }
for (const semester of semesters) {
  for (const [kind, area] of Object.entries(AREAS) as [keyof typeof AREAS, string][]) {
    const rows = parseRows(await getPage(semester, area))
    for (const r of rows) found[kind].set(r.identifier.replace(/\s+/g, ''), r.name)
    process.stdout.write(`${semester} ${kind} ${rows.length}\n`)
  }
}

const list = (m: Map<string, string>) =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, name]) => `  ['${id}', ${JSON.stringify(name)}],`).join('\n')

await writeFile(OUT, `// 由 scripts/fetch-general-courses.ts 產生（${semesters[0]} 至 ${semesters.at(-1)}），請勿手動修改。

/** 溝通表達與職涯發展課程（原基本能力課程）：可充抵通識至多 6 學分。識別碼去掉空格。 */
export const COMM_COURSES: [string, string][] = [
${list(found.comm)}
]

/** 共同教育中心的新生專題、新生講座 */
export const FRESHMAN_COURSES: [string, string][] = [
${list(found.freshman)}
]
`)
console.log(`完成：溝通表達 ${found.comm.size} 門、新生專題／講座 ${found.freshman.size} 門`)
