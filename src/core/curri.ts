import type { CreditRules, RequiredCourse, Requirements } from './types.js'

/**
 * 解析台大必修課程查詢系統（curri.aca.ntu.edu.tw）的頁面。
 *
 * 該站沒有 CORS，瀏覽器無法直接抓，因此由 scripts/fetch-requirements.ts
 * 在建置前抓下來轉成 JSON。這裡只做純字串解析，core 不碰網路也不碰 DOM。
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'" }

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, k: string) => ENTITIES[k] ?? '')
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

/** HTML 轉純文字，每個標籤換成換行，連續空白收斂。 */
function toText(html: string): string {
  return decode(
    stripComments(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export type ChinesePlan = { chinese: number; genEd: number }

export type RequirementPage = {
  requirements: Requirements
  /** 國文與通識的配分方案；多數系有 6+12 與 3+15 兩種，由學生自選。 */
  chinesePlans: ChinesePlan[]
  /** 各年級（上下學期合計）的系訂必修學分，0 表示該年級不用抓必修科目表。 */
  majorByGrade: number[]
  creditRules: CreditRules
}

/** 括號內可能也有逗號，如「(A1~A8領域，無*者)」 */
const PAREN = String.raw`(?:[(（][^)）]*[)）])?`

/**
 * 備註第四點的採計規定，各系用同一套句型逐條寫明「計入／不計入選修學分」。
 * 抓不到的條目留空，不猜。
 */
export function parseCreditRules(text: string): CreditRules {
  const flat = text.replace(/\s+/g, '')
  const counts = (pattern: string) => {
    const m = flat.match(new RegExp(pattern + String.raw`[，,](不)?計入(?:系內)?選修`))
    return m ? !m[1] : undefined
  }
  const rules: CreditRules = {}
  const genEd = counts(`超修之通識課程${PAREN}`)
  const foreign = counts(String.raw`超修之外[(（]?英[)）]?文領域課程學分`)
  const own = counts(`修習本系所開通識課程${PAREN}`)
  const chinese = counts('超修之大學國文')
  if (genEd !== undefined) rules.genEdOverflowToElective = genEd
  if (foreign !== undefined) rules.foreignOverflowToElective = foreign
  if (own !== undefined) rules.ownGenEdToElective = own
  if (chinese !== undefined) rules.chineseOverflowToElective = chinese

  const together = flat.match(/「新生專題」及「新生講座」課程[，,](皆計入|皆不計入|擇一計入)選修/)
  const separate = flat.match(/「新生專題」課程[，,](不)?計入選修學分[；;]修習「新生講座」課程[，,](不)?計入選修/)
  if (together) rules.freshman = ({ 皆計入: 'both', 皆不計入: 'none', 擇一計入: 'one' } as const)[together[1] as '皆計入']
  else if (separate) {
    const seminar = !separate[1]
    const lecture = !separate[2]
    rules.freshman = seminar && lecture ? 'both' : seminar ? 'seminar' : lecture ? 'lecture' : 'none'
  }
  return rules
}

const GRADES = ['一', '二', '三', '四', '五', '六', '七']

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s))

/** 應修學分數頁（/uquery/tc）。讀不到合計列就回傳 null，寧可讓使用者手填也不亂猜。 */
export function parseRequirementPage(html: string): RequirementPage | null {
  const text = toText(html)

  const sum = text.match(/合計\n(\d+)\n(\d+)\n(\d+)\n畢業時學生應修最低學分總數\n(\d+)/)
  if (!sum) return null

  const requirements: Requirements = {
    major: Number(sum[1]),
    common: Number(sum[2]),
    elective: Number(sum[3]),
    total: Number(sum[4]),
  }

  // 以下都在備註的自由文字裡，各系寫法不一，抓不到就留空
  const flat = text.replace(/\n/g, '')
  const inMajor =
    flat.match(/選修[^。，]{0,8}?(\d+)\s*學分[^。]{0,4}?(?:限|須|需|應)[^。]{0,6}?本系/) ??
    flat.match(/(\d+)\s*學分(?:限|須|需|應)(?:選|修)[^。]{0,4}?本系/)
  const foreign = flat.match(/外\s*[(（]?英[)）]?\s*文\s*(\d+)\s*學分/)
  const pe = flat.match(/體育[^。]{0,40}?共計\s*(\d+)\s*學分/)

  if (inMajor) requirements.electiveInMajor = num(inMajor[1])
  if (foreign) requirements.foreign = num(foreign[1])
  if (pe) requirements.pe = num(pe[1])

  const chinesePlans = [...flat.matchAll(/(\d+)\s*學分國文領域[^+＋]{0,30}[+＋]\s*(\d+)\s*學分通識/g)]
    .map((m) => ({ chinese: Number(m[1]), genEd: Number(m[2]) }))

  // 年級列：「一年級 第一學期 下限 上限 必修」接「第二學期 下限 上限 必修」
  const majorByGrade = GRADES.map((g) => {
    const row = text.match(new RegExp(String.raw`${g}年級\n第一學期\n\d+\n\d+\n(\d+)\n第二學期\n\d+\n\d+\n(\d+)`))
    return row ? Number(row[1]) + Number(row[2]) : 0
  })

  return { requirements, chinesePlans, majorByGrade, creditRules: parseCreditRules(flat) }
}

const COURSE_ROW =
  /<td>\s*([A-Za-z]+\s*\d[\w]*)\s*<br\s*\/?>\s*(\w{3}\s?\w{5})\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>\s*([\d.]+)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g

/** 系訂必修科目頁（/uquery/cou，一次一個年級，以 MSLGRD 指定；不帶參數時為一年級）。 */
export function parseRequiredCourses(html: string): RequiredCourse[] {
  const clean = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  const seen = new Set<string>()
  const courses: RequiredCourse[] = []

  for (const m of stripComments(html).matchAll(COURSE_ROW)) {
    const code = clean(m[1]!).replace(/\s+/g, '')
    const identifier = clean(m[2]!)
    // 同一門課若出現在多個年級表會重複列出
    const key = `${code}|${identifier}`
    if (seen.has(key)) continue
    seen.add(key)

    const group = clean(m[5]!)
    courses.push({
      code,
      identifier,
      name: clean(m[3]!),
      credits: Number(m[4]),
      ...(group ? { group } : {}),
      scope: clean(m[6]!),
    })
  }
  return courses
}
