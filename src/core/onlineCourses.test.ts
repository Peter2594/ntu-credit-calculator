import { describe, it, expect } from 'vitest'
import { onlineCourseOf } from './onlineCourses.js'

describe('onlineCourseOf', () => {
  it('識別碼、課號、課名都認得', () => {
    expect(onlineCourseOf({ identifier: 'N0100600', name: 'x' })?.domain).toBe('A6')
    expect(onlineCourseOf({ code: 'Online0008', name: 'x' })?.name).toBe('頑想學概率：機率')
    expect(onlineCourseOf({ name: '唐詩新思路' })?.identifier).toBe('N0100500')
  })

  it('識別碼中間有空白也認得；一般課程不會被誤判', () => {
    expect(onlineCourseOf({ identifier: 'N01 00900', name: 'x' })?.domain).toBe('A78')
    expect(onlineCourseOf({ identifier: '705 10300', name: '程式設計' })).toBeUndefined()
  })
})
