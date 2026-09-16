import type { Course } from './types.js'

export type ParsedCourse = Omit<Course, 'id' | 'assignments' | 'overridden'>

const SEMESTER = /^\d{3}-[1-4]$/
/**
 * 課程識別碼：三碼單位代碼（必含數字，如 705、H01、P37）＋五碼；
 * 無空格的寫法是一個字元接五位數字（705E22200），以免把 SPORT1001 這類課號誤認。
 */
const IDENTIFIER = /^(?=[0-9A-Z]{0,2}\d)[0-9A-Z]{3}(?:\s[0-9A-Z]{5}|[0-9A-Z]\d{5})$/
const UNIT_CODE = /^(?=[0-9A-Z]{0,2}\d)[0-9A-Z]{3}$/
const IDENTIFIER_TAIL = /^[0-9A-Z]{5}$/
const COURSE_CODE = /^[A-Za-z]{2,}\s*\d[\w]*$/
const GEN_ED_DOMAIN = /^A\d+\*?$/
const CREDITS = /^\d+(?:\.\d+)?$/
/** 班次，如 01、H3 */
const CLASS_NO = /^[0-9A-Z]{2}$/
const GRADE = /^(?:A\+|A-?|B[+-]?|C[+-]?|D|E|F|X|通過|不通過|停修|抵免|免修)$/
/** 手機版有時每個欄位前面帶標籤 */
const FIELD_LABEL = /^(?:學年期|學期|課號|課程識別碼|識別碼|班次|學分|通識領域|課程名稱|課名|成績|等第)\s*[：:]\s*/

/** 一門課從識別碼到成績之間最多幾個欄位（班次、學分、領域、課名可能被空格拆成數段）。 */
const MAX_SPAN = 12

/**
 * 解析 myNTU 歷年成績複製貼上的文字。
 *
 * 電腦整頁複製時每個欄位一行，還夾帶表頭與每學期統計列；手機複製時常變成整列同一行，
 * 以 Tab 或空格分隔，甚至每個欄位前面帶標籤。所以不依賴行或記錄邊界：
 * 以課程識別碼為錨點，往前取課號、沿用最近出現的學期；往後依序是班次、學分、
 * 通識領域（皆可省略），接著是課名，直到成績為止。
 * 兩種切法（逐行、逐詞）都試，取解析出較多課程的結果。
 */
export function parseTranscript(raw: string): ParsedCourse[] {
  const text = raw.replace(/\r/g, '').replace(/[ 　]/g, ' ')

  const fields = text
    .split(/[\n\t❮]/)
    .map((f) => f.trim().replace(FIELD_LABEL, '').replace(/\s+/g, ' '))
    .filter((f) => f.length > 0)

  const byField = scan(fields)
  const byWord = scan(mergeIdentifiers(fields.flatMap((f) => f.split(' '))))
  return byWord.length > byField.length ? byWord : byField
}

/** 以空格切開後，識別碼「705 10300」會變成兩段，接回去。 */
function mergeIdentifiers(words: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1]
    if (UNIT_CODE.test(words[i]!) && next !== undefined && IDENTIFIER_TAIL.test(next)) {
      out.push(`${words[i]} ${next}`)
      i++
    } else {
      out.push(words[i]!)
    }
  }
  return out
}

function scan(tokens: string[]): ParsedCourse[] {
  const courses: ParsedCourse[] = []
  let semester = ''

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (SEMESTER.test(token)) {
      semester = token
      continue
    }
    if (!IDENTIFIER.test(token)) continue

    const found = readCourse(tokens, i, semester)
    if (found) {
      courses.push(found.course)
      i = found.end
    }
  }
  return courses
}

function readCourse(tokens: string[], at: number, semester: string) {
  const previous = tokens[at - 1] ?? ''
  const code = COURSE_CODE.test(previous) ? previous.replace(/\s+/g, '') : undefined

  // 識別碼之後連續的班次、學分、通識領域；學分是其中最後一個數字
  let cursor = at + 1
  let credits: string | undefined
  let genEdDomain: string | undefined
  while (cursor < tokens.length) {
    const t = tokens[cursor]!
    if (CREDITS.test(t)) credits = t
    else if (GEN_ED_DOMAIN.test(t)) genEdDomain = t
    else if (!CLASS_NO.test(t)) break
    cursor++
  }
  if (credits === undefined) return null

  // 課名可能被空格拆成數段，一路收到成績為止
  const limit = Math.min(at + MAX_SPAN, tokens.length - 1)
  for (let g = cursor + 1; g <= limit; g++) {
    const t = tokens[g]!
    if (IDENTIFIER.test(t) || SEMESTER.test(t)) return null
    if (!GRADE.test(t)) continue

    return {
      end: g,
      course: {
        semester,
        ...(code ? { code } : {}),
        identifier: tokens[at]!,
        credits: Number(credits),
        name: tokens.slice(cursor, g).join(' '),
        grade: t,
        ...(genEdDomain ? { genEdDomain } : {}),
      } satisfies ParsedCourse,
    }
  }
  return null
}

export type GradeRow = { semester: string; name: string; grade: string; genEdDomain?: string }

/**
 * 手機版歷年成績頁只顯示學期、通識領域、課名、成績，沒有課號、識別碼、學分，
 * 無法算學分與分類，但可以拿來更新已匯入課程的成績。
 * 內容含課程識別碼時代表是完整格式，回傳空陣列。
 */
export function parseGradeRows(raw: string): GradeRow[] {
  const text = raw.replace(/\r/g, '').replace(/[\u00a0\u3000]/g, ' ')
  const records = text.split('❮').map((r) =>
    r.split(/[\n\t]/).map((f) => f.trim().replace(/\s+/g, ' ')).filter(Boolean),
  )
  if (records.some((fields) => fields.some((f) => IDENTIFIER.test(f)))) return []

  return records.flatMap((fields): GradeRow[] => {
    const semester = fields.find((f) => SEMESTER.test(f))
    let gradeAt = fields.length - 1
    while (gradeAt >= 0 && !GRADE.test(fields[gradeAt]!)) gradeAt--
    if (!semester || gradeAt < 1) return []
    const name = fields[gradeAt - 1]!
    if (SEMESTER.test(name) || GEN_ED_DOMAIN.test(name)) return []
    const genEdDomain = fields.slice(0, gradeAt - 1).find((f) => GEN_ED_DOMAIN.test(f))
    return [{ semester, name, grade: fields[gradeAt]!, ...(genEdDomain ? { genEdDomain } : {}) }]
  })
}
