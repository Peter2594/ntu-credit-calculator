import { describe, it, expect } from 'vitest'
import { parseTranscript } from './parser.js'
import { SYNTHETIC_TRANSCRIPT } from './fixtures/transcript.js'

describe('parseTranscript', () => {
  const courses = parseTranscript(SYNTHETIC_TRANSCRIPT)

  it('解析出全部 13 筆紀錄', () => {
    expect(courses).toHaveLength(13)
  })

  it('沒有班次也沒有通識領域時仍正確對位', () => {
    const c = courses.find((x) => x.code === 'MAJ1002')!
    expect(c).toMatchObject({
      semester: '114-1',
      code: 'MAJ1002',
      identifier: '900 10200',
      credits: 3,
      name: '本系核心二',
      grade: 'A-',
    })
    expect(c.genEdDomain).toBeUndefined()
  })

  it('同時有班次與通識領域時抓得到領域', () => {
    const c = courses.find((x) => x.code === 'GE1001')!
    expect(c.genEdDomain).toBe('A1')
    expect(c.credits).toBe(2)
    expect(c.name).toBe('藝術鑑賞')
  })

  it('有班次但沒有通識領域時不會把班次當成領域', () => {
    const c = courses.find((x) => x.code === 'MAJ1001')!
    expect(c.genEdDomain).toBeUndefined()
    expect(c.credits).toBe(3)
    expect(c.name).toBe('本系核心一')
  })

  it('保留非字母成績', () => {
    expect(courses.find((x) => x.code === 'ECON1001')!.grade).toBe('通過')
    expect(courses.find((x) => x.code === 'DROP1001')!.grade).toBe('停修')
  })

  it('空字串回傳空陣列', () => {
    expect(parseTranscript('')).toEqual([])
  })
})
