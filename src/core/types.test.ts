import { describe, it, expect } from 'vitest'
import { CATEGORIES, type Course, type Requirements } from './types.js'

describe('types', () => {
  it('CATEGORIES 涵蓋全部八個歸類', () => {
    expect(CATEGORIES).toEqual([
      '系訂必修', '限本系選修', '一般選修',
      '國文', '外文', '通識', '體育', '不計入',
    ])
  })

  it('Requirements 有國文／外文／通識的分項門檻', () => {
    // 溢出規則對這三類的處理方式不同（國文與通識丟棄、外文進選修），
    // 沒有分項門檻就無法區分溢出來源。
    const r: Requirements = { common: 24, chinese: 6, foreign: 6, genEd: 12 }
    expect(r.chinese! + r.foreign! + r.genEd!).toBe(r.common)
  })

  it('Course 的 assignments 是陣列，可同時歸屬多個學程', () => {
    const c: Course = {
      id: 'c1',
      name: '測試課',
      credits: 3,
      semester: '115-1',
      assignments: [
        { programId: 'p1', category: '一般選修' },
        { programId: 'p2', category: '系訂必修' },
      ],
      overridden: false,
    }
    expect(c.assignments).toHaveLength(2)
  })
})
