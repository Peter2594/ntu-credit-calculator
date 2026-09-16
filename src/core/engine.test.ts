import { describe, it, expect } from 'vitest'
import { tally, evaluate } from './engine.js'
import type { Course, Category, Program } from './types.js'

const c = (category: Category, credits: number, programId = 'p1'): Course => ({
  id: Math.random().toString(36).slice(2),
  name: 'x',
  credits,
  semester: '114-1',
  assignments: [{ programId, category }],
  overridden: false,
})

describe('tally', () => {
  it('按歸類加總學分', () => {
    const result = tally([c('系訂必修', 3), c('系訂必修', 2), c('一般選修', 3)], 'p1')
    expect(result['系訂必修']).toBe(5)
    expect(result['一般選修']).toBe(3)
    expect(result['通識']).toBe(0)
  })

  it('八個歸類全部有值，沒修的是 0', () => {
    const result = tally([], 'p1')
    expect(Object.values(result).every((v) => v === 0)).toBe(true)
    expect(Object.keys(result)).toHaveLength(8)
  })

  it('只算指定學程的 assignment', () => {
    const result = tally([c('系訂必修', 3, 'p1'), c('系訂必修', 3, 'p2')], 'p1')
    expect(result['系訂必修']).toBe(3)
  })

  it('一門課同時歸屬兩個學程時兩邊都算到', () => {
    const shared: Course = {
      id: 'shared',
      name: '雙主修必修',
      credits: 3,
      semester: '114-1',
      assignments: [
        { programId: 'p1', category: '一般選修' },
        { programId: 'p2', category: '系訂必修' },
      ],
      overridden: false,
    }
    expect(tally([shared], 'p1')['一般選修']).toBe(3)
    expect(tally([shared], 'p2')['系訂必修']).toBe(3)
  })

  it('不計入的課不影響其他歸類', () => {
    const result = tally([c('不計入', 3), c('系訂必修', 3)], 'p1')
    expect(result['不計入']).toBe(3)
    expect(result['系訂必修']).toBe(3)
  })
})

const program: Program = {
  id: 'p1', kind: '主修', name: '測試系', deptPrefix: '900',
  requirements: {
    total: 128, major: 50, elective: 54, electiveInMajor: 20, pe: 4,
    common: 24, chinese: 6, foreign: 6, genEd: 12,
  },
}

describe('evaluate 的上限與溢出', () => {
  it('系訂必修超修的部分溢出到一般選修', () => {
    const courses = [c('系訂必修', 53), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.major).toBe(50)
    expect(r.counted.elective).toBe(13) // 10 + 溢出的 3
  })

  it('通識超修的部分被丟棄，不進選修', () => {
    // 通識門檻 12，修了 18，超修的 6 直接消失
    const courses = [c('通識', 18), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.common).toBe(12)
    expect(r.counted.elective).toBe(10)
  })

  it('國文超修的部分被丟棄，不進選修', () => {
    // 國文門檻 6，修了 9，超修的 3 直接消失
    const courses = [c('國文', 9), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.common).toBe(6)
    expect(r.counted.elective).toBe(10)
  })

  it('外文超修的部分計入選修（與國文、通識相反）', () => {
    // 外文門檻 6，修了 9，超修的 3 進選修
    const courses = [c('外文', 9), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.common).toBe(6)
    expect(r.counted.elective).toBe(13)
  })

  it('限本系選修是下限，超修仍計入選修合計', () => {
    const courses = [c('限本系選修', 26), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.electiveInMajor).toBe(26)
    expect(r.counted.elective).toBe(36)
    expect(r.gaps.electiveInMajor).toBe(0)
  })

  it('限本系選修不足時有缺口', () => {
    const r = evaluate([c('限本系選修', 12)], program)
    expect(r.gaps.electiveInMajor).toBe(8)
  })

  it('體育不計入畢業總數，但單獨追蹤缺口', () => {
    const r = evaluate([c('體育', 2), c('系訂必修', 50)], program)
    expect(r.pe).toEqual({ taken: 2, required: 4, gap: 2 })
    expect(r.totalCounted).toBe(50)
  })

  it('不計入的課完全不算', () => {
    const r = evaluate([c('不計入', 9), c('系訂必修', 50)], program)
    expect(r.totalCounted).toBe(50)
    expect(r.totalTaken).toBe(50)
  })

  it('三類溢出規則同時生效時互不干擾', () => {
    // 國文 +3 丟棄、通識 +6 丟棄、外文 +3 進選修
    const courses = [c('國文', 9), c('通識', 18), c('外文', 9), c('一般選修', 10)]
    const r = evaluate(courses, program)
    expect(r.counted.common).toBe(24)   // 6 + 6 + 12
    expect(r.counted.elective).toBe(13) // 10 + 外文溢出的 3
  })

  it('全部達標時缺口為 0', () => {
    const courses = [
      c('系訂必修', 50), c('限本系選修', 20),
      c('一般選修', 34), c('通識', 12), c('國文', 6), c('外文', 6),
    ]
    const r = evaluate(courses, program)
    expect(r.gaps).toEqual({
      major: 0, electiveInMajor: 0, elective: 0, common: 0, total: 0,
    })
    expect(r.totalCounted).toBe(128)
  })
})
