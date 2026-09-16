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

describe('parseTranscript：整頁複製時夾雜標題與統計列', () => {
  // 編造資料，模擬 myNTU 整頁 Ctrl+A：表頭、學期統計列、分隔符號時有時無
  const NOISY = [
    '歷年成績', '學年期', '課號', '課程識別碼', '班次', '學分', '通識領域', '課程名稱', '成績',
    '113-1', 'LANG1001', '102 83300', '15', '3', '英文一', 'A+', '❮',
    'GE1001', 'H01 02000', 'A1', '2', '藝術鑑賞', 'A',
    '平均成績：', '4.15', '實得學分數為：', '5',
    '❮',
    '學期成績', '113-2', 'MAJ1001', '900E10100', '02', '3', '本系核心一', 'A-', '❮',
    'SPORT1001', 'H01 12400', '1', '健康體適能', '通過',
    '平均成績：', '3.70', '實得學分數為：', '4', '❮',
  ].join('\n')

  const courses = parseTranscript(NOISY)

  it('只解析出課程，不會把統計列當成課', () => {
    expect(courses.map((c) => c.name)).toEqual(['英文一', '藝術鑑賞', '本系核心一', '健康體適能'])
  })

  it('同一學期後續的課沿用最近的學期', () => {
    expect(courses.map((c) => c.semester)).toEqual(['113-1', '113-1', '113-2', '113-2'])
  })

  it('課號、識別碼、學分、成績都對位', () => {
    expect(courses[1]).toMatchObject({
      code: 'GE1001', identifier: 'H01 02000', credits: 2, grade: 'A', genEdDomain: 'A1',
    })
    expect(courses[2]).toMatchObject({ code: 'MAJ1001', identifier: '900E10100', credits: 3, grade: 'A-' })
    expect(courses[3]).toMatchObject({ code: 'SPORT1001', identifier: 'H01 12400', credits: 1, grade: '通過' })
  })

  it('統計列的數字不會被當成學分', () => {
    expect(courses.every((c) => c.credits <= 4)).toBe(true)
  })
})
