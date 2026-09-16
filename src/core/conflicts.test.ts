import { describe, it, expect } from 'vitest'
import { findConflicts } from './conflicts.js'
import type { Course, Slot } from './types.js'

const c = (id: string, semester: string, slots: Slot[]): Course => ({
  id, name: id, credits: 3, semester,
  assignments: [], overridden: false, slots,
})

describe('findConflicts', () => {
  it('同一天節次重疊算衝堂', () => {
    const a = c('a', '115-1', [{ day: 1, periods: ['2', '3', '4'] }])
    const b = c('b', '115-1', [{ day: 1, periods: ['4', '5'] }])
    const found = findConflicts([a, b])
    expect(found).toHaveLength(1)
    expect(found[0]!.periods).toEqual(['4'])
    expect(found[0]!.day).toBe(1)
  })

  it('同一天但節次不重疊不算衝堂', () => {
    const a = c('a', '115-1', [{ day: 1, periods: ['2', '3'] }])
    const b = c('b', '115-1', [{ day: 1, periods: ['7', '8'] }])
    expect(findConflicts([a, b])).toEqual([])
  })

  it('不同天不算衝堂', () => {
    const a = c('a', '115-1', [{ day: 1, periods: ['2'] }])
    const b = c('b', '115-1', [{ day: 2, periods: ['2'] }])
    expect(findConflicts([a, b])).toEqual([])
  })

  it('不同學期不算衝堂', () => {
    const a = c('a', '115-1', [{ day: 1, periods: ['2'] }])
    const b = c('b', '115-2', [{ day: 1, periods: ['2'] }])
    expect(findConflicts([a, b])).toEqual([])
  })

  it('沒有時段的課不參與比對', () => {
    const a = c('a', '115-1', [])
    const b = c('b', '115-1', [{ day: 1, periods: ['2'] }])
    expect(findConflicts([a, b])).toEqual([])
  })

  it('一門課有多個時段時全部比對', () => {
    const a = c('a', '115-1', [
      { day: 1, periods: ['2'] },
      { day: 4, periods: ['5', '6'] },
    ])
    const b = c('b', '115-1', [{ day: 4, periods: ['6', '7'] }])
    const found = findConflicts([a, b])
    expect(found).toHaveLength(1)
    expect(found[0]!.day).toBe(4)
    expect(found[0]!.periods).toEqual(['6'])
  })

  it('A–D 夜間節次也能比對', () => {
    const a = c('a', '115-1', [{ day: 1, periods: ['A', 'B', 'C', 'D'] }])
    const b = c('b', '115-1', [{ day: 1, periods: ['C'] }])
    expect(findConflicts([a, b])[0]!.periods).toEqual(['C'])
  })
})
