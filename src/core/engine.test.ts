import { describe, it, expect } from 'vitest'
import { tally } from './engine.js'
import type { Course, Category } from './types.js'

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
