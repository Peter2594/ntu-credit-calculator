import type { Course } from './types.js'

export type ParsedCourse = Omit<Course, 'id' | 'assignments' | 'overridden'>

const RECORD_SEPARATOR = '❮'
const GEN_ED_DOMAIN = /^A\d+\*?$/

/**
 * 解析 myNTU 歷年成績複製貼上的文字。
 *
 * 每筆紀錄以 ❮ 分隔，記錄內欄位數量不固定（班次、通識領域為選填），
 * 因此從開頭取學年期／課號／識別碼，從結尾取成績／課名／學分，
 * 中段只挑出符合通識領域格式者。
 */
export function parseTranscript(raw: string): ParsedCourse[] {
  return raw
    .split(RECORD_SEPARATOR)
    .map((record) =>
      record
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
    .filter((fields) => fields.length >= 6)
    .map(toCourse)
}

function toCourse(fields: string[]): ParsedCourse {
  const [semester, code, identifier] = fields as [string, string, string]
  const grade = fields[fields.length - 1]!
  const name = fields[fields.length - 2]!
  const credits = Number(fields[fields.length - 3])

  const middle = fields.slice(3, fields.length - 3)
  const genEdDomain = middle.find((f) => GEN_ED_DOMAIN.test(f))

  return {
    semester,
    code,
    identifier,
    credits: Number.isFinite(credits) ? credits : 0,
    name,
    grade,
    ...(genEdDomain ? { genEdDomain } : {}),
  }
}
