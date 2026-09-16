import { describe, it, expect } from 'vitest'
import { tally, evaluate, evaluateAll } from './engine.js'
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

  describe('國文與通識合併上限（國文 6＋通識 12 或 國文 3＋通識 15）', () => {
    const plans: Program = {
      ...program,
      requirements: { ...program.requirements, chinese: 6, genEd: 15, chineseGenEd: 18 },
    }

    it('走國文 3＋通識 15 時，通識 15 學分全部採計', () => {
      const r = evaluate([c('國文', 3), c('通識', 15)], plans)
      expect(r.counted.common).toBe(18)
      expect(r.totalTaken - r.totalCounted).toBe(0)
    })

    it('走國文 6＋通識 12 時也全部採計', () => {
      const r = evaluate([c('國文', 6), c('通識', 12)], plans)
      expect(r.counted.common).toBe(18)
    })

    it('兩者合計超過 18 的部分才不計入', () => {
      const r = evaluate([c('國文', 3), c('通識', 18), c('一般選修', 10)], plans)
      expect(r.counted.common).toBe(18)
      expect(r.counted.elective).toBe(10)
    })

    it('國文 6＋通識 15 時合計只採計 18', () => {
      const r = evaluate([c('國文', 6), c('通識', 15)], plans)
      expect(r.counted.common).toBe(18)
      expect(r.totalTaken - r.totalCounted).toBe(3)
    })

    it('國文仍以 6 為上限', () => {
      const r = evaluate([c('國文', 9), c('通識', 6)], plans)
      expect(r.counted.common).toBe(12)
    })
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

  it('系外選修另外列出，含必修與外文溢出', () => {
    const courses = [c('限本系選修', 26), c('一般選修', 10), c('系訂必修', 53)]
    const r = evaluate(courses, program)
    expect(r.counted.electiveInMajor).toBe(26)
    expect(r.counted.electiveOutside).toBe(13)
  })

  it('選修超過門檻被截掉時，系外選修也跟著扣', () => {
    const r = evaluate([c('限本系選修', 40), c('一般選修', 30)], program)
    expect(r.counted.elective).toBe(54)
    expect(r.counted.electiveOutside).toBe(14)
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

describe('抵免的學分差額', () => {
  const withList: Program = {
    ...program,
    requiredCourses: [{ code: 'ECO1001', identifier: '303 10100', name: '個經', credits: 3, scope: '不限本院(系)課程' }],
  }
  const sub: Course = {
    id: 'sub', name: '個經與實習', credits: 4, semester: '113-1', grade: '通過',
    assignments: [{ programId: 'p1', category: '系訂必修' }], overridden: true,
  }

  it('4 學分抵 3 學分必修，餘 1 學分計入選修', () => {
    const p = { ...withList, waivers: [{ key: 'ECO1001|303 10100', courseId: 'sub' }] }
    const r = evaluate([sub], p)
    expect(r.counted.major).toBe(3)
    expect(r.counted.elective).toBe(1)
    expect(r.counted.electiveOutside).toBe(1)
    expect(r.totalCounted).toBe(4)
  })

  it('免修不增加學分，必修缺口照算', () => {
    const p = { ...withList, waivers: [{ key: 'ECO1001|303 10100' }] }
    const r = evaluate([], p)
    expect(r.counted.major).toBe(0)
    expect(r.gaps.major).toBe(50)
  })
})

describe('雙主修與輔系只算該系課程', () => {
  const minor: Program = { id: 'p1', kind: '輔系', name: '乙系', deptPrefix: '666', requirements: { total: 20 } }
  const courses = [c('系訂必修', 6), c('限本系選修', 9), c('一般選修', 12), c('通識', 6), c('外文', 3)]

  it('輔系總學分只含必修與系內課，不含系外、通識、共同', () => {
    const r = evaluate(courses, minor)
    expect(r.totalCounted).toBe(15)
    expect(r.gaps.total).toBe(5)
  })

  it('雙主修同樣只算該系課程', () => {
    const dm: Program = { ...minor, kind: '雙主修', requirements: { major: 10, total: 10 } }
    const r = evaluate(courses, dm)
    expect(r.totalCounted).toBe(15)
    expect(r.gaps.major).toBe(4)
  })
})

describe('evaluateAll：輔系學分不計入本系畢業學分', () => {
  const main: Program = { id: 'm', kind: '主修', name: '甲系', deptPrefix: '900', requirements: { total: 128, elective: 30 } }
  const minor: Program = { id: 'n', kind: '輔系', name: '乙系', deptPrefix: '666', requirements: { total: 6 } }
  const dm: Program = { ...minor, id: 'd', kind: '雙主修', requirements: { total: 6 } }

  const course = (id: string, semester: string, credits: number, cats: Record<string, Category>): Course => ({
    id, name: id, credits, semester, grade: 'A', overridden: false,
    assignments: Object.entries(cats).map(([programId, category]) => ({ programId, category })),
  })

  const courses = [
    course('b1', '113-1', 3, { m: '一般選修', n: '限本系選修', d: '限本系選修' }),
    course('b2', '113-2', 3, { m: '一般選修', n: '限本系選修', d: '限本系選修' }),
    course('b3', '114-1', 3, { m: '一般選修', n: '限本系選修', d: '限本系選修' }),
    // 本系必修，即使也是乙系的課，也不得兼充輔系
    course('shared', '113-1', 3, { m: '系訂必修', n: '限本系選修', d: '限本系選修' }),
  ]

  it('依學期先後分給輔系，湊滿門檻為止', () => {
    const r = evaluateAll(courses, [main, minor])
    expect(r.get('n')!.totalCounted).toBe(6)
    expect(r.get('n')!.gaps.total).toBe(0)
  })

  it('分給輔系的課從主修扣除，多出來的仍算主修選修', () => {
    const r = evaluateAll(courses, [main, minor])
    expect(r.get('m')!.counted.elective).toBe(3) // 只剩 b3
    expect(r.get('m')!.counted.major).toBe(3)
  })

  it('本系系訂必修不會被分給輔系', () => {
    const allocated = evaluateAll(courses, [main, minor]).get('n')!
    expect(allocated.taken['限本系選修']).toBe(6) // b1 + b2，不含 shared
  })

  it('雙主修的課仍計入主修選修', () => {
    const r = evaluateAll(courses, [main, dm])
    expect(r.get('m')!.counted.elective).toBe(9)
    expect(r.get('d')!.totalCounted).toBe(12)
  })
})

describe('輔系有選課範圍時只採計範圍內的課', () => {
  const main: Program = { id: 'm', kind: '主修', name: '甲系', deptPrefix: '900', requirements: { total: 128 } }
  const minor: Program = {
    id: 'n', kind: '輔系', name: '乙系', deptPrefix: '666', requirements: { total: 6 }, requiredMode: 'pick',
    requiredCourses: [{ code: 'Y1', identifier: '666 10000', name: '乙必修', credits: 3, scope: '限本系課程' }],
  }
  const mk = (id: string, cats: Record<string, Category>): Course => ({
    id, name: id, credits: 3, semester: '113-1', grade: 'A', overridden: false,
    assignments: Object.entries(cats).map(([programId, category]) => ({ programId, category })),
  })

  it('範圍外的乙系課不算輔系，留給主修', () => {
    const courses = [mk('inPool', { m: '一般選修', n: '系訂必修' }), mk('outPool', { m: '一般選修', n: '限本系選修' })]
    const r = evaluateAll(courses, [main, minor])
    expect(r.get('n')!.totalCounted).toBe(3)
    expect(r.get('m')!.counted.elective).toBe(3)
  })
})

describe('學分學程', () => {
  const main: Program = { id: 'm', kind: '主修', name: '甲系', deptPrefix: '900', requirements: { total: 128, elective: 30 } }
  const prog: Program = {
    id: 'p', kind: '學程', name: '編造學程', deptPrefix: '', requirements: { total: 15 }, requiredMode: 'pick',
    requiredCourses: [
      { code: '', identifier: '777 U0100', name: '學程核心', credits: 3, scope: '不限本院(系)課程', group: '核心' },
      { code: '', identifier: '', name: '只有課名的課', credits: 3, scope: '不限本院(系)課程', group: '應用' },
    ],
  }
  const byId: Course = {
    id: 'a', name: '改過名的核心', credits: 3, semester: '114-1', grade: 'A', overridden: false,
    identifier: '777 U0100', assignments: [],
  }
  const byName: Course = {
    id: 'b', name: '只有課名的課', credits: 3, semester: '114-2', grade: 'A', overridden: false,
    identifier: '888 10000', assignments: [],
  }
  const other: Course = { ...byName, id: 'c', name: '無關的課', identifier: '999 10000' }

  it('清單內的課（識別碼或課名相符）才算學程學分，且不從主修扣除', async () => {
    const { reclassifyAll } = await import('./courses.js')
    const courses = reclassifyAll([byId, byName, other], [main, prog])
    const r = evaluateAll(courses, [main, prog])
    expect(r.get('p')!.totalCounted).toBe(6)
    expect(r.get('m')!.counted.elective).toBe(9)
  })
})
