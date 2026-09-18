import { describe, it, expect } from 'vitest'
import { parseTranscript, parseGradeRows } from './parser.js'
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

  it('英語授課課號有 E 後接字母（EU、EM）的格式也認得', () => {
    const text = [
      '115-1', 'EEE5028', '943EU0300', '3', '邏輯合成與驗證', 'A', '❮',
      '115-1', 'SOC7134', '325EM7810', '3', '氣候變遷與社會', 'B+', '❮',
      '115-1', 'LS1007', 'B01E101B1', '06', '2', '普通生物學乙上', 'A-', '❮',
      '115-1', 'CSIE3110', '902E43500', '01', '3', '自動機與形式語言', 'A', '❮',
    ].join('\n')
    expect(parseTranscript(text).map((c) => [c.identifier, c.name, c.credits])).toEqual([
      ['943EU0300', '邏輯合成與驗證', 3],
      ['325EM7810', '氣候變遷與社會', 3],
      ['B01E101B1', '普通生物學乙上', 2],
      ['902E43500', '自動機與形式語言', 3],
    ])
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

describe('parseTranscript：手機複製的格式', () => {
  const expected = [
    { semester: '113-1', code: 'LANG1001', identifier: '102 83300', credits: 3, name: '英文一', grade: 'A+' },
    { semester: '113-1', code: 'WEB1001', identifier: '900 U3960', credits: 3, name: 'Web APP開發', grade: 'A' },
    { semester: '113-2', code: 'GE1001', identifier: 'H01 02000', credits: 2, name: '藝術鑑賞', grade: '通過' },
  ]
  const pick = (text: string) =>
    parseTranscript(text).map(({ semester, code, identifier, credits, name, grade }) => ({ semester, code, identifier, credits, name, grade }))

  it('整列在同一行、以 Tab 分隔', () => {
    const text = [
      '學年期\t課號\t課程識別碼\t班次\t學分\t課程名稱\t成績',
      '113-1\tLANG1001\t102 83300\t15\t3\t英文一\tA+',
      '113-1\tWEB1001\t900 U3960\t01\t3\tWeb APP開發\tA',
      '113-2\tGE1001\tH01 02000\tA1\t2\t藝術鑑賞\t通過',
      '平均成績：\t4.00\t實得學分數為：\t8',
    ].join('\n')
    expect(pick(text)).toEqual(expected)
  })

  it('整列在同一行、以空格分隔（識別碼中間的空格也被打散）', () => {
    const text = [
      '學年期 課號 課程識別碼 班次 學分 課程名稱 成績',
      '113-1 LANG1001 102 83300 15 3 英文一 A+',
      '113-1 WEB1001 900 U3960 01 3 Web APP開發 A',
      '平均成績： 4.00 實得學分數為： 6',
      '113-2 GE1001 H01 02000 A1 2 藝術鑑賞 通過',
    ].join('\n')
    expect(pick(text)).toEqual(expected)
  })

  it('每個欄位帶標籤', () => {
    const text = [
      '學年期：113-1', '課號：LANG1001', '課程識別碼：102 83300', '班次：15', '學分：3', '課程名稱：英文一', '成績：A+',
      '學年期：113-1', '課號：WEB1001', '課程識別碼：900 U3960', '班次：01', '學分：3', '課程名稱：Web APP開發', '成績：A',
      '學年期：113-2', '課號：GE1001', '課程識別碼：H01 02000', '通識領域：A1', '學分：2', '課程名稱：藝術鑑賞', '成績：通過',
    ].join('\n')
    expect(pick(text)).toEqual(expected)
  })

  it('不斷行空白與 Windows 換行也能處理', () => {
    const text = '113-1\r\nLANG1001\r\n102\u00a083300\r\n15\r\n3\r\n英文一\r\nA+\r\n'
    expect(pick(text)).toEqual([expected[0]])
  })
})

describe('parseGradeRows：手機版頁面只有學期、領域、課名、成績', () => {
  const MOBILE = [
    '113-1', '編造體育課', 'A+', '❮',
    '113-1', '編造服務課', '通過', '❮',
    '113-1', 'A5*', '編造專業通識', '通過', '❮',
    '113-1', 'A6', '☆編造 程式課', 'A+',
  ].join('\n')

  it('完整格式解析不到課程', () => {
    expect(parseTranscript(MOBILE)).toEqual([])
  })

  it('讀出學期、課名、成績與通識領域', () => {
    expect(parseGradeRows(MOBILE)).toEqual([
      { semester: '113-1', name: '編造體育課', grade: 'A+' },
      { semester: '113-1', name: '編造服務課', grade: '通過' },
      { semester: '113-1', name: '編造專業通識', grade: '通過', genEdDomain: 'A5*' },
      { semester: '113-1', name: '☆編造 程式課', grade: 'A+', genEdDomain: 'A6' },
    ])
  })

  it('完整格式的成績單不會被當成手機版', () => {
    expect(parseGradeRows(SYNTHETIC_TRANSCRIPT)).toEqual([])
  })
})

describe('parseTranscript：瀏覽器複製時夾帶的特殊字元與課號寫法', () => {
  const row = (identifier: string, code = 'MAJ1001') =>
    ['113-1', code, identifier, '3', '編造課', 'A', '❮'].join('\n')

  it('識別碼中間是零寬空白、窄空白、en space 時也認得', () => {
    for (const sep of ['\u200b', '\u2002', '\u2009', '\u202f', '\u00a0 ']) {
      const [c] = parseTranscript(row(`900${sep}10100`))
      expect(c?.identifier?.replace(/\s+/g, ' ')).toBe('900 10100')
    }
  })

  it('課號含 & 也讀得到（如 MD&PH5011）', () => {
    expect(parseTranscript(row('405 51400', 'MD&PH5011'))[0]?.code).toBe('MD&PH5011')
  })

  it('跨領域通識的寫法（A58* 表示 A5、A8）', () => {
    const text = ['114-1', 'GE1001', '207 10100', '12', 'A58*', '3', '編造通識', 'A+', '❮'].join('\n')
    expect(parseTranscript(text)[0]).toMatchObject({ genEdDomain: 'A58*', credits: 3 })
  })
})
