import { describe, it, expect } from 'vitest'
import { classify, deptPrefixOf, applyClassification } from './classify.js'
import type { Course, Program } from './types.js'
import type { ParsedCourse } from './parser.js'

const program: Program = {
  id: 'p1',
  kind: '主修',
  name: '測試系',
  deptPrefix: '900',
  requirements: {},
}

const course = (over: Partial<ParsedCourse>): ParsedCourse => ({
  name: 'x', credits: 3, semester: '114-1', ...over,
})

describe('deptPrefixOf', () => {
  it('不論識別碼格式一律取前三碼', () => {
    expect(deptPrefixOf('900 10200')).toBe('900')
    expect(deptPrefixOf('705E22200')).toBe('705')
    expect(deptPrefixOf('H01 02000')).toBe('H01')
    expect(deptPrefixOf(undefined)).toBe('')
  })
})

describe('classify', () => {
  it('停修優先於一切', () => {
    const c = course({ identifier: '900 10100', grade: '停修' })
    expect(classify(c, program)).toBe('不計入')
  })

  it('有通識領域就是通識', () => {
    expect(classify(course({ identifier: 'H01 02000', genEdDomain: 'A1' }), program)).toBe('通識')
  })

  it('依識別碼認出國文、外文、體育', () => {
    expect(classify(course({ identifier: '101 80100' }), program)).toBe('國文')
    expect(classify(course({ identifier: '102 83300' }), program)).toBe('外文')
    expect(classify(course({ identifier: '002 50010' }), program)).toBe('體育')
  })

  it('依課號前綴認出國文、外文、體育', () => {
    expect(classify(course({ code: 'CHIN8014' }), program)).toBe('國文')
    expect(classify(course({ code: 'FL1007' }), program)).toBe('外文')
    expect(classify(course({ code: 'PE1003' }), program)).toBe('體育')
  })

  it('本系課保守預設為限本系選修', () => {
    expect(classify(course({ identifier: '900 10100' }), program)).toBe('限本系選修')
  })

  it('外系課為一般選修', () => {
    expect(classify(course({ identifier: '666 30100' }), program)).toBe('一般選修')
  })

  it('服務學習預設不計入', () => {
    expect(classify(course({ code: 'StuAct0009', identifier: '005 061H0' }), program)).toBe('不計入')
    expect(classify(course({ name: '服務學習甲', identifier: '106 001A0' }), program)).toBe('不計入')
  })
})

describe('applyClassification', () => {
  const base = (over: Partial<Course>): Course => ({
    id: 'c1', name: 'x', credits: 3, semester: '114-1',
    assignments: [], overridden: false, ...over,
  })

  it('未覆寫的課會被自動歸類', () => {
    const result = applyClassification(base({ identifier: '900 10100' }), program)
    expect(result.assignments).toEqual([{ programId: 'p1', category: '限本系選修' }])
  })

  it('已覆寫的課不被自動規則蓋掉', () => {
    // 抵免案例：課名不同但系辦核可算必修，使用者手動改過
    const manual = base({
      identifier: '900 10100',
      overridden: true,
      assignments: [{ programId: 'p1', category: '系訂必修' }],
    })
    expect(applyClassification(manual, program).assignments)
      .toEqual([{ programId: 'p1', category: '系訂必修' }])
  })

  it('已覆寫的課在其他學程仍會被自動歸類', () => {
    const other: Program = { ...program, id: 'p2', deptPrefix: '666' }
    const manual = base({
      identifier: '666 30100',
      overridden: true,
      assignments: [{ programId: 'p1', category: '系訂必修' }],
    })
    const result = applyClassification(manual, other)
    expect(result.assignments).toContainEqual({ programId: 'p1', category: '系訂必修' })
    expect(result.assignments).toContainEqual({ programId: 'p2', category: '限本系選修' })
  })
})
