import { describe, it, expect } from 'vitest'
import {
  courseKey, mergeImported, reclassifyAll, setCategory,
  resetCategory, removeProgram,
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
