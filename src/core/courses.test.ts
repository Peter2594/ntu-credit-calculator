import { describe, it, expect } from 'vitest'
import {
  courseKey, mergeImported, reclassifyAll, setCategory, requiredProgress, requiredKey, waiveRequired, unwaiveRequired,
  resetCategory, removeProgram, updateGrades, halfYearOnly,
} from './courses.js'
import type { Course, Program } from './types.js'
import type { ParsedCourse } from './parser.js'

const p1: Program = { id: 'p1', kind: '主修', name: '甲系', deptPrefix: '900', requirements: {} }
const p2: Program = { id: 'p2', kind: '雙主修', name: '乙系', deptPrefix: '666', requirements: {} }

const parsed = (over: Partial<ParsedCourse> = {}): ParsedCourse => ({
  semester: '114-1', code: 'AAA1001', identifier: '900 10100',
  name: '甲系導論', credits: 3, grade: 'A', ...over,
})

describe('mergeImported', () => {
  it('新課程依每個學程自動歸類', () => {
    const [course] = mergeImported([], [parsed()], [p1, p2])
    expect(course!.id).toBe(courseKey(parsed()))
    expect(course!.assignments).toEqual([
      { programId: 'p1', category: '限本系選修' },
      { programId: 'p2', category: '一般選修' },
    ])
  })

  it('重複匯入同一門課時保留手動覆寫，但更新成績', () => {
    const first = mergeImported([], [parsed({ grade: '' })], [p1])
    const edited = first.map((c) => setCategory(c, 'p1', '系訂必修'))
    const again = mergeImported(edited, [parsed({ grade: 'A+' })], [p1])
    expect(again).toHaveLength(1)
    expect(again[0]!.grade).toBe('A+')
    expect(again[0]!.assignments).toEqual([{ programId: 'p1', category: '系訂必修' }])
  })

  it('不會動到手動新增的計畫課程', () => {
    const planned: Course = {
      id: 'manual', name: '計畫課', credits: 2, semester: '115-2',
      assignments: [], overridden: false,
    }
    const merged = mergeImported([planned], [parsed()], [p1])
    expect(merged.map((c) => c.id)).toEqual(['manual', courseKey(parsed())])
  })
})

describe('setCategory 與 resetCategory', () => {
  const base = mergeImported([], [parsed()], [p1, p2])[0]!

  it('手動改分類會標記覆寫，且只改指定學程', () => {
    const edited = setCategory(base, 'p1', '系訂必修')
    expect(edited.overridden).toBe(true)
    expect(edited.assignments).toContainEqual({ programId: 'p1', category: '系訂必修' })
    expect(edited.assignments).toContainEqual({ programId: 'p2', category: '一般選修' })
  })

  it('恢復自動會取消覆寫並重新歸類', () => {
    const edited = setCategory(base, 'p1', '系訂必修')
    const reset = resetCategory(edited, [p1, p2])
    expect(reset.overridden).toBe(false)
    expect(reset.assignments).toContainEqual({ programId: 'p1', category: '限本系選修' })
  })
})

describe('reclassifyAll 與 removeProgram', () => {
  it('新增學程後既有課程補上該學程的歸類', () => {
    const courses = mergeImported([], [parsed()], [p1])
    const result = reclassifyAll(courses, [p1, p2])
    expect(result[0]!.assignments).toContainEqual({ programId: 'p2', category: '一般選修' })
  })

  it('刪除學程時一併移除課程上的歸類', () => {
    const courses = mergeImported([], [parsed()], [p1, p2])
    const result = removeProgram(courses, 'p2')
    expect(result[0]!.assignments).toEqual([{ programId: 'p1', category: '限本系選修' }])
  })
})

describe('requiredProgress', () => {
  const listed: Program = {
    ...p1,
    requiredCourses: [
      { code: 'AAA1001', identifier: '900 10100', name: '甲系導論', credits: 3, scope: '限本系課程' },
      { code: 'AAA2001', identifier: '900 20100', name: '甲系進階', credits: 3, scope: '限本系課程' },
      { code: 'MATH4006', identifier: '201 49810', name: '微積分1', credits: 2, scope: '不限本院(系)課程' },
      { code: 'AAA3001', identifier: '900 30100', name: '甲系專題', credits: 2, scope: '限本系課程' },
    ],
  }

  const taken = mergeImported([], [
    parsed(),                                                         // 甲系導論 已修
    parsed({ code: 'AAA2001', identifier: '900 20100', name: '甲系進階', grade: '停修' }),
    parsed({ code: 'OTHER1', identifier: '777 10100', name: '替代課程', grade: 'A' }),
  ], [listed])
  const planned: Course = {
    id: 'plan', name: '微積分1', credits: 2, semester: '115-2',
    assignments: [], overridden: false,
  }
  const courses = reclassifyAll([
    ...taken.map((c) => (c.name === '替代課程' ? setCategory(c, 'p1', '系訂必修') : c)),
    planned,
  ], [listed])

  const r = requiredProgress(courses, listed)

  it('逐門標出已修、已排課表、還沒修', () => {
    expect(r.items.map((i) => [i.required.name, i.status])).toEqual([
      ['甲系導論', 'done'],
      ['甲系進階', 'missing'],   // 停修不算修過
      ['微積分1', 'planned'],
      ['甲系專題', 'missing'],
    ])
  })

  it('還沒修的學分合計', () => {
    expect(r.missingCredits).toBe(5)
  })

  it('手動算必修但不在清單上的課另外列出（多為抵免）', () => {
    expect(r.extras.map((c) => c.name)).toEqual(['替代課程'])
  })

  it('一門課同時對到清單上多項時只算一項（例如中英文班同名、課名比對）', () => {
    const program: Program = {
      id: 'x', kind: '學程', name: '某學程', deptPrefix: '', requirements: { total: 15 }, requiredMode: 'pick',
      requiredCourses: [
        { code: '', identifier: '724 M0310', name: '全球品牌管理', credits: 3, group: '應用', scope: '不限本院(系)課程' },
        { code: '', identifier: '724EM0310', name: '全球品牌管理', credits: 3, group: '應用', scope: '不限本院(系)課程' },
        { code: '', identifier: '', name: '全球品牌管理', credits: 3, group: '應用', scope: '不限本院(系)課程' },
      ],
    }
    const cs = reclassifyAll(mergeImported([], [
      parsed({ code: 'IB7095', identifier: '724 M0310', name: '全球品牌管理' }),
    ], [program]), [program])
    expect(requiredProgress(cs, program).items.map((i) => i.status)).toEqual(['done', 'missing', 'missing'])
  })
})

describe('抵免與免修', () => {
  const listed: Program = {
    ...p1,
    requiredCourses: [
      { code: 'AAA1001', identifier: '900 10100', name: '甲系導論', credits: 3, scope: '限本系課程' },
      { code: 'ACC1001', identifier: '800 10100', name: '會計原理', credits: 3, scope: '限本院課程' },
      { code: 'LAB1001', identifier: '900 10900', name: '實驗課', credits: 1, scope: '限本系課程' },
    ],
  }
  const [substitute] = mergeImported([], [
    parsed({ code: 'ACC9001', identifier: '801 10100', name: '替代會計', grade: 'A' }),
  ], [listed])
  const acc = listed.requiredCourses![1]!
  const lab = listed.requiredCourses![2]!

  it('指定一門課抵免：該課改算系訂必修，清單顯示已抵免', () => {
    const { program, courses } = waiveRequired(listed, [substitute!], acc, substitute!.id)
    expect(courses[0]!.assignments).toContainEqual({ programId: 'p1', category: '系訂必修' })
    expect(courses[0]!.overridden).toBe(true)

    const r = requiredProgress(courses, program)
    const item = r.items.find((i) => i.required.code === 'ACC1001')!
    expect(item.status).toBe('waived')
    expect(item.course?.name).toBe('替代會計')
    expect(r.extras).toEqual([])
    expect(r.missingCredits).toBe(4) // 甲系導論 3 + 實驗課 1
  })

  it('免修不需要指定課程', () => {
    const { program } = waiveRequired(listed, [], lab)
    const item = requiredProgress([], program).items.find((i) => i.required.code === 'LAB1001')!
    expect(item.status).toBe('waived')
    expect(item.course).toBeUndefined()
  })

  it('抵免的課被刪掉後，該門回到還沒修', () => {
    const { program } = waiveRequired(listed, [substitute!], acc, substitute!.id)
    const item = requiredProgress([], program).items.find((i) => i.required.code === 'ACC1001')!
    expect(item.status).toBe('missing')
  })

  it('取消抵免', () => {
    const { program, courses } = waiveRequired(listed, [substitute!], acc, substitute!.id)
    const undone = unwaiveRequired(program, requiredKey(acc))
    expect(requiredProgress(courses, undone).items.find((i) => i.required.code === 'ACC1001')!.status).toBe('missing')
  })
})

describe('updateGrades：用手機版內容更新已匯入課程的成績', () => {
  const existing = mergeImported([], [
    parsed({ semester: '114-2', name: '甲系導論', grade: '' }),
    parsed({ semester: '114-2', code: 'BBB1', identifier: '900 20000', name: '甲系 進階', grade: '' }),
  ], [p1])

  it('依學期與課名比對，課名空白差異不影響', () => {
    const r = updateGrades(existing, [
      { semester: '114-2', name: '甲系導論', grade: 'A' },
      { semester: '114-2', name: '甲系  進階', grade: 'B+' },
      { semester: '114-2', name: '沒匯入過的課', grade: 'A+' },
    ])
    expect(r.courses.map((c) => c.grade)).toEqual(['A', 'B+'])
    expect(r.updated).toBe(2)
    expect(r.unmatched).toEqual(['沒匯入過的課'])
  })
})

describe('halfYearOnly：全年課只修了上學期', () => {
  const p = (name: string, semester: string, grade?: string, identifier = '900 00001') =>
    ({ name, semester, credits: 3, identifier, ...(grade ? { grade } : {}) })

  it('下學期已有成績卻沒修「下」才算只修半年', () => {
    const upper = p('編造學上', '113-1', 'A')
    const later = p('其他課', '113-2', 'B', '900 00002')
    expect(halfYearOnly([upper, later]).has(upper)).toBe(true)
  })

  it('有修「下」（含排在課表還沒成績）、還沒到下學期、或是大一國文時不算', () => {
    const upper = p('編造學上', '113-1', 'A')
    expect(halfYearOnly([upper, p('編造學下', '113-2', 'A')]).size).toBe(0)
    expect(halfYearOnly([upper, p('編造學下', '113-2')]).size).toBe(0)
    expect(halfYearOnly([upper]).size).toBe(0)
    const chinese = p('大一國文上', '113-1', 'A', '101 00001')
    expect(halfYearOnly([chinese, p('其他課', '113-2', 'B', '900 00002')]).size).toBe(0)
  })

  it('下學期停修或不及格，上學期仍只算半年', () => {
    const upper = p('編造學上', '113-1', 'A')
    expect(halfYearOnly([upper, p('編造學下', '113-2', '停修')]).has(upper)).toBe(true)
  })
})
