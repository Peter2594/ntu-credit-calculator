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

describe('onlineCourseOf：不要把同名的實體課誤認為線上課程', () => {
  it('暑修的「用 Python 做商管程式設計」有自己的識別碼，不算線上課程', () => {
    expect(onlineCourseOf({ identifier: 'SCN 20440', code: 'SCGN2044', name: '用 Python 做商管程式設計' })).toBeUndefined()
  })

  it('沒有識別碼與課號時才用課名比對', () => {
    expect(onlineCourseOf({ name: '活用希臘哲學' })?.identifier).toBe('N0100000')
  })
})
