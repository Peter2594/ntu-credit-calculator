import { describe, it, expect } from 'vitest'
import type { Program } from '../core/types'
import { refreshMainRules, type OfficialYear } from './officialData'

describe('refreshMainRules', () => {
  const dept = {
    code: '7050', name: '編造學系', deptPrefix: '705', requirements: {}, chinesePlans: [], requiredCourses: [],
    creditRules: { genEdOverflowToElective: true },
  }
  const years = new Map<string, OfficialYear>([['115', { year: '115', fetchedAt: '2026-09-17', departments: [dept] }]])
  const main: Program = {
    id: 'm', kind: '主修', name: '編造學系', deptPrefix: '705', requirements: { total: 134 },
    source: { year: '115', deptCode: '7050', kind: '主修' },
  }

  it('舊存檔的主修補上系上規定與指定通識領域，其他設定不動', () => {
    const [p] = refreshMainRules([main], years)!
    expect(p!.creditRules).toEqual({ genEdOverflowToElective: true, genEdDomains: ['A1', 'A2', 'A3', 'A4', 'A7', 'A8'] })
    expect(p!.requirements).toEqual({ total: 134 })
  })

  it('已是最新、手動建立或不是主修時不動', () => {
    const fresh = refreshMainRules([main], years)!
    expect(refreshMainRules(fresh, years)).toBeNull()
    expect(refreshMainRules([{ ...main, source: undefined }], years)).toBeNull()
    expect(refreshMainRules([{ ...main, kind: '雙主修', source: { ...main.source!, kind: '雙主修' } }], years)).toBeNull()
  })
})
