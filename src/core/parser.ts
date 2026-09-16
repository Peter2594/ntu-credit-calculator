import type { Course } from './types.js'

export type ParsedCourse = Omit<Course, 'id' | 'assignments' | 'overridden'>

const SEMESTER = /^\d{3}-[1-4]$/
/**
 * 課程識別碼：三碼單位代碼（必含數字，如 705、H01、P37）＋五碼；
 * 無空格的寫法是一個字元接五位數字（705E22200），以免把 SPORT1001 這類課號誤認。
 */
const IDENTIFIER = /^(?=[0-9A-Z]{0,2}\d)[0-9A-Z]{3}(?:\s[0-9A-Z]{5}|[0-9A-Z]\d{5})$/
const COURSE_CODE = /^[A-Za-z]{2,}\s*\d[\w]*$/
const GEN_ED_DOMAIN = /^A\d+\*?$/
const CREDITS = /^\d+(?:\.\d+)?$/
const GRADE = /^(?:A\+|A-?|B[+-]?|C[+-]?|D|E|F|X|通過|不通過|停修|抵免|免修)$/

/**
 * 解析 myNTU 歷年成績複製貼上的文字。
 *
 * 整頁複製時會夾帶表頭、每學期的平均成績與實得學分數等統計列，
 * 分隔符號 ❮ 也不一定每門課都有，所以不依賴記錄邊界：
 * 以課程識別碼為錨點，往前取課號、沿用最近出現的學期；
 * 往後找到成績，成績前一行是課名，其間最後一個數字是學分。
 */
export function parseTranscript(raw: string): ParsedCourse[] {
  const lines = raw
    .split(/\n|❮/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const courses: ParsedCourse[] = []
  let semester = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (SEMESTER.test(line)) {
      semester = line
      continue
    }
    if (!IDENTIFIER.test(line)) continue

    const course = readCourse(lines, i, semester)
    if (course) {
      courses.push(course.course)
      i = course.end
    }
  }
  return courses
}

/** 識別碼之後依序是：班次（選填）、通識領域（選填）、學分、課名、成績。 */
const MAX_SPAN = 6

function readCourse(lines: string[], at: number, semester: string) {
  const previous = lines[at - 1] ?? ''
  const code = COURSE_CODE.test(previous) ? previous.replace(/\s+/g, '') : undefined

  for (let g = at + 2; g <= Math.min(at + MAX_SPAN, lines.length - 1); g++) {
    if (!GRADE.test(lines[g]!)) continue
    if (IDENTIFIER.test(lines[g - 1]!)) return null

    const middle = lines.slice(at + 1, g - 1)
    const credits = [...middle].reverse().find((f) => CREDITS.test(f))
    if (credits === undefined) continue

    const genEdDomain = middle.find((f) => GEN_ED_DOMAIN.test(f))
    return {
      end: g,
      course: {
        semester,
        ...(code ? { code } : {}),
        identifier: lines[at]!,
        credits: Number(credits),
        name: lines[g - 1]!,
        grade: lines[g]!,
        ...(genEdDomain ? { genEdDomain } : {}),
      } satisfies ParsedCourse,
    }
  }
  return null
}
