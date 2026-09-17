import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/** 學分學程資料是人工整理的，這些檢查防止整理時的疏漏悄悄上線。 */
type Rule = { name: string; minCourses?: number; minCredits?: number; maxCourses?: number; maxCredits?: number }
type Entry = { identifier?: string; name: string; credits: number; group?: string; matchName?: boolean }
type CreditProgram = { code: string; name: string; total: number | null; rules: string; groups?: Rule[]; courses: Entry[] }

const { programs } = JSON.parse(
  readFileSync(new URL('../../public/data/programs.json', import.meta.url), 'utf8'),
) as { programs: CreditProgram[] }

const squash = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()

describe('學分學程資料', () => {
  it('學程代碼不重複', () => {
    const codes = programs.map((p) => p.code)
    expect(codes.length).toBe(new Set(codes).size)
  })

  it.each(programs.map((p) => [p.code, p] as const))('%s 每門課都有課名與合理學分', (_, p) => {
    for (const c of p.courses) {
      expect(c.name.trim()).not.toBe('')
      expect(Number.isInteger(c.credits) && c.credits >= 0).toBe(true)
    }
  })

  it.each(programs.map((p) => [p.code, p] as const))('%s 有門檻的模組都對得到課程', (_, p) => {
    const used = new Set(p.courses.map((c) => c.group))
    const constrained = (p.groups ?? []).filter((g) => g.minCourses !== undefined || g.minCredits !== undefined)
    expect(constrained.filter((g) => !used.has(g.name)).map((g) => g.name)).toEqual([])
  })

  it.each(programs.map((p) => [p.code, p] as const))('%s 課程分到的模組都有定義', (_, p) => {
    if (!p.groups) return
    const defined = new Set(p.groups.map((g) => g.name))
    expect([...new Set(p.courses.map((c) => c.group))].filter((g) => g && !defined.has(g))).toEqual([])
  })

  it.each(programs.map((p) => [p.code, p] as const))('%s 模組最低學分合計不超過總學分', (_, p) => {
    if (p.total === null) return
    const sum = (p.groups ?? []).reduce((s, g) => s + (g.minCredits ?? 0), 0)
    expect(sum).toBeLessThanOrEqual(p.total)
  })

  it.each(programs.map((p) => [p.code, p] as const))('%s 同一模組內沒有重複的課號', (_, p) => {
    const seen = new Set<string>()
    const dup: string[] = []
    for (const c of p.courses) {
      if (!c.identifier) continue
      const key = `${c.group}|${squash(c.identifier)}`
      if (seen.has(key)) dup.push(key)
      seen.add(key)
    }
    expect(dup).toEqual([])
  })
})
