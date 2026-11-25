import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { classify } from './classify.js'
import { evaluate } from './engine.js'
import { isMainDegree, type Course, type Program, type Requirements } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 院學士資料是依各院修業辦法人工整理的，這些檢查防止整理時的疏漏悄悄上線。 */
type Group = { name: string; minCourses?: number; minCredits?: number }
type Degree = {
  code: string
  college: string
  name: string
  total: number
  published: string
  rules: string
  requirements: Requirements
  groups: Group[]
  courses: { name: string; credits: number; group: string; code?: string }[]
  genEdDomains?: string[]
}

const { degrees } = JSON.parse(
  readFileSync(new URL('../../public/data/college-degrees.json', import.meta.url), 'utf8'),
) as { degrees: Degree[] }

describe('院學士資料', () => {
  it('八個設有院學士的學院都在', () => {
    expect(degrees.map((d) => d.college).sort()).toEqual(
      ['工學院', '文學院', '生命科學院', '生物資源暨農學院', '理學院', '社會科學院', '管理學院', '醫學院'].sort(),
    )
  })

  it('代碼不重複', () => {
    const codes = degrees.map((d) => d.code)
    expect(codes.length).toBe(new Set(codes).size)
  })

  it.each(degrees.map((d) => [d.code, d] as const))('%s 每門課都有課名與合理學分', (_, d) => {
    for (const c of d.courses) {
      expect(c.name.trim()).not.toBe('')
      expect(Number.isInteger(c.credits) && c.credits > 0).toBe(true)
    }
  })

  it.each(degrees.map((d) => [d.code, d] as const))('%s 每個模組都對得到課程', (_, d) => {
    const used = new Set(d.courses.map((c) => c.group))
    for (const g of d.groups) expect(used.has(g.name)).toBe(true)
  })

  it.each(degrees.map((d) => [d.code, d] as const))('%s 的門檻加起來等於應修總學分', (_, d) => {
    const { total, common, major, elective } = d.requirements
    expect(total).toBe(d.total)
    // 醫學院只查得到總學分與共同必修，其餘項目的科目表還沒公開
    if (major === undefined) return
    expect(common! + major + elective!).toBe(total)
  })

  it.each(degrees.map((d) => [d.code, d] as const))('%s 補上的課號格式正確', (_, d) => {
    for (const c of d.courses) {
      if (c.code === undefined) continue
      // 台大課號是英文字母接數字，如 AtmSci1009、CHIN2003
      expect(c.code).toMatch(/^[A-Za-z&]{2,}\d[\w]*$/)
    }
  })

  it('有課號的科目夠多，不然等於沒補', () => {
    const all = degrees.flatMap((d) => d.courses)
    const withCode = all.filter((c) => c.code)
    expect(withCode.length / all.length).toBeGreaterThan(0.5)
  })

  it('沒有把聯絡人信箱之類的個資抄進公開資料', () => {
    const raw = readFileSync(new URL('../../public/data/college-degrees.json', import.meta.url), 'utf8')
    expect(raw).not.toMatch(/@[\w.-]+\.(?:tw|com|edu|org)/)
  })
})

const course = (over: Partial<ParsedCourse>): ParsedCourse => ({
  name: 'x', credits: 3, semester: '114-1', ...over,
})

const withAssignment = (c: ParsedCourse, program: Program): Course => ({
  id: c.name, overridden: false, ...c,
  assignments: [{ programId: program.id, category: classify(c, program) }],
})

describe('院學士當成畢業學位計算', () => {
  const degree: Program = {
    id: 'cd',
    kind: '院學士',
    name: '理學院院學士學位',
    deptPrefix: '',
    requirements: { total: 128, common: 24, major: 48, elective: 56 },
    requiredMode: 'pick',
    requiredCourses: [
      { code: '', identifier: '', name: '大氣科學概論', credits: 2, group: '地球系統與氣候科學', scope: '不限本院(系)課程' },
    ],
  }

  it('isMainDegree 認得院學士，雙主修與輔系不算', () => {
    expect(isMainDegree(degree)).toBe(true)
    expect(isMainDegree({ ...degree, kind: '主修' })).toBe(true)
    expect(isMainDegree({ ...degree, kind: '雙主修' })).toBe(false)
    expect(isMainDegree({ ...degree, kind: '輔系' })).toBe(false)
  })

  it('共同必修、通識與系外選修都算進院學士的畢業學分', () => {
    const courses = [
      course({ name: '大氣科學概論', identifier: '208 10100', credits: 2, grade: 'A' }),
      course({ name: '大一國文', identifier: '101 10100', credits: 3, grade: 'A' }),
      course({ name: '音樂鑑賞', identifier: 'H01 10100', credits: 2, genEdDomain: 'A1', grade: 'A' }),
      course({ name: '經濟學原理', identifier: '303 10100', credits: 3, grade: 'A' }),
    ].map((c) => withAssignment(c, degree))

    const result = evaluate(courses, degree)
    expect(result.counted.major).toBe(2)
    expect(result.counted.common).toBe(5)
    expect(result.counted.elective).toBe(3)
    expect(result.totalCounted).toBe(10)
    expect(result.gaps.total).toBe(118)
  })

  it('修業辦法自訂的通識領域會檢查（管院限 A1–A4、A7、A8）', () => {
    const mgt: Program = {
      ...degree,
      name: '管理學院院學士學位',
      requirements: { total: 129, common: 24, major: 58, elective: 47 },
      creditRules: { genEdDomains: ['A1', 'A2', 'A3', 'A4', 'A7', 'A8'] },
    }
    const courses = [
      course({ name: '通識一', identifier: 'H01 10100', credits: 3, genEdDomain: 'A1', grade: 'A' }),
      course({ name: '通識二', identifier: 'H01 10200', credits: 3, genEdDomain: 'A5', grade: 'A' }),
    ].map((c) => withAssignment(c, mgt))

    const result = evaluate(courses, mgt)
    // A5 不在管院指定的領域內，只算到一個
    expect(result.genEd?.covered).toEqual(['A1'])
    expect(result.gaps.genEdDomains).toBe(2)
  })
})
