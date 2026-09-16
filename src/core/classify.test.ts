import { describe, it, expect } from 'vitest'
import { classify, deptPrefixOf, applyClassification, isOwnDeptGenEd } from './classify.js'
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

describe('不及格', () => {
  it('F、X、不通過的課不計入', () => {
    for (const grade of ['F', 'X', '不通過']) {
      expect(classify(course({ identifier: '900 10100', grade }), program)).toBe('不計入')
    }
  })

  it('通過仍照常歸類', () => {
    expect(classify(course({ identifier: '900 10100', grade: '通過' }), program)).toBe('限本系選修')
  })
})

describe('系訂必修清單', () => {
  const withList: Program = {
    ...program,
    deptPrefix: '900,925',
    requiredCourses: [
      { code: 'AAA1003', identifier: '900 10300', name: '本系核心一', credits: 3, scope: '限本系課程' },
      { code: 'MATH4006', identifier: '201 49810', name: '微積分1', credits: 2, scope: '不限本院(系)課程' },
    ],
  }

  it('課號或識別碼符合清單就是系訂必修', () => {
    expect(classify(course({ code: 'AAA1003', identifier: '900 10300' }), withList)).toBe('系訂必修')
    expect(classify(course({ code: 'MATH4006', identifier: '201 49810' }), withList)).toBe('系訂必修')
  })

  it('識別碼空格不同也認得', () => {
    expect(classify(course({ code: 'X', identifier: '90010300' }), withList)).toBe('系訂必修')
  })

  it('認可範圍不限本系時，他系同名課也算', () => {
    expect(classify(course({ code: 'MATH4106', identifier: '221 U1510', name: '微積分1' }), withList)).toBe('系訂必修')
  })

  it('限本系課程的必修，他系同名課不算', () => {
    expect(classify(course({ code: 'BBB1003', identifier: '666 10300', name: '本系核心一' }), withList)).toBe('一般選修')
  })

  it('必修清單優先於通識領域', () => {
    expect(classify(course({ code: 'AAA1003', identifier: '900 10300', genEdDomain: 'A8*' }), withList)).toBe('系訂必修')
  })

  it('多個本系前綴都算系內選修', () => {
    expect(classify(course({ identifier: '925 U0100' }), withList)).toBe('限本系選修')
  })
})

describe('系上開的通識課', () => {
  it('沒有星號的通識，即使是本系開的仍算通識', () => {
    expect(classify(course({ identifier: '900 00100', genEdDomain: 'A5' }), program)).toBe('通識')
  })

  it('有星號的專業通識課若為本系開授，不得採計通識，改算系內選修', () => {
    expect(classify(course({ identifier: '900 20100', genEdDomain: 'A5*' }), program)).toBe('限本系選修')
  })

  it('他系開的專業通識課照常算通識', () => {
    expect(classify(course({ identifier: '666 20100', genEdDomain: 'A5*' }), program)).toBe('通識')
  })

  it('isOwnDeptGenEd 標出需要使用者確認的課', () => {
    expect(isOwnDeptGenEd(course({ identifier: '900 00100', genEdDomain: 'A5' }), program)).toBe(true)
    expect(isOwnDeptGenEd(course({ identifier: '666 00100', genEdDomain: 'A5' }), program)).toBe(false)
    // 有星號的已經確定改算系內選修，不需要再問
    expect(isOwnDeptGenEd(course({ identifier: '900 20100', genEdDomain: 'A5*' }), program)).toBe(false)
  })
})
