import { describe, it, expect } from 'vitest'
import { computeGpa, gradePoint } from './gpa.js'
import type { Category, Course } from './types.js'

const c = (grade: string, credits: number, semester = '114-1', category: Category = '一般選修'): Course => ({
  id: Math.random().toString(36).slice(2), name: 'x', credits, semester, grade,
  assignments: [{ programId: 'p1', category }], overridden: false,
})

describe('gradePoint', () => {
  it('台大 4.3 制', () => {
    expect(gradePoint('A+', 'ntu')).toBe(4.3)
    expect(gradePoint('A-', 'ntu')).toBe(3.7)
    expect(gradePoint('C', 'ntu')).toBe(2.0)
    expect(gradePoint('F', 'ntu')).toBe(0)
  })

  it('美制 4.0 只有 A+ 改為 4.0', () => {
    expect(gradePoint('A+', 'us')).toBe(4.0)
    expect(gradePoint('A', 'us')).toBe(4.0)
    expect(gradePoint('B+', 'us')).toBe(3.3)
  })

  it('通過、停修、抵免等不列入計分', () => {
    for (const g of ['通過', '不通過', '停修', '抵免', '免修', '']) expect(gradePoint(g, 'ntu')).toBeNull()
  })
})

describe('computeGpa', () => {
  const courses = [
    c('A+', 3, '113-1', '系訂必修'),
    c('B+', 2, '113-1'),
    c('通過', 4, '113-1'),
    c('A', 3, '113-2', '限本系選修'),
    c('停修', 3, '113-2'),
    c('F', 1, '113-2'),
    { ...c('A', 3, '115-1'), grade: undefined }, // 課表裡還沒成績的課
  ]
  const r = computeGpa(courses, 'p1')

  it('以學分加權，只算有等第的課', () => {
    // (4.3*3 + 3.3*2 + 4.0*3 + 0*1) / 9
    expect(r.overall.credits).toBe(9)
    expect(r.overall.ntu).toBeCloseTo(31.5 / 9, 5)
    expect(r.overall.us).toBeCloseTo((4.0 * 3 + 3.3 * 2 + 4.0 * 3) / 9, 5)
  })

  it('實得學分含通過，不含停修與不及格', () => {
    expect(r.earnedCredits).toBe(12) // 3 + 2 + 4 + 3
  })

  it('本系 GPA 只算系訂必修與系內選修', () => {
    expect(r.major.credits).toBe(6)
    expect(r.major.ntu).toBeCloseTo((4.3 * 3 + 4.0 * 3) / 6, 5)
  })

  it('每學期各自計算，依學期排序', () => {
    expect(r.semesters.map((s) => [s.semester, s.credits])).toEqual([['113-1', 5], ['113-2', 4]])
    expect(r.semesters[0]!.ntu).toBeCloseTo((4.3 * 3 + 3.3 * 2) / 5, 5)
  })

  it('沒有計分課程時 GPA 為 null', () => {
    expect(computeGpa([c('通過', 3)], 'p1').overall.ntu).toBeNull()
  })
})
