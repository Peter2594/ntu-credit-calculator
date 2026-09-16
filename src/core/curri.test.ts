import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRequirementPage, parseRequiredCourses } from './curri.js'

// 台大必修課程查詢系統的公開頁面（資管系 115 學年度），不含個人資料
const tc = readFileSync(new URL('./fixtures/curri-tc-7050-115.html', import.meta.url), 'utf8')
const cou = readFileSync(new URL('./fixtures/curri-cou-7050-115.html', import.meta.url), 'utf8')

describe('parseRequirementPage', () => {
  const r = parseRequirementPage(tc)!

  it('讀出合計列與畢業總學分', () => {
    expect(r.requirements).toMatchObject({ total: 134, major: 58, common: 24, elective: 52 })
  })

  it('從備註抓出限本系選修、外文、體育', () => {
    expect(r.requirements).toMatchObject({ electiveInMajor: 21, foreign: 6, pe: 4 })
  })

  it('讀出各年級的系訂必修學分，用來決定要抓哪幾個年級', () => {
    expect(r.majorByGrade).toEqual([27, 18, 11, 2, 0, 0, 0])
  })

  it('偵測到國文兩種方案', () => {
    expect(r.chinesePlans).toEqual([
      { chinese: 6, genEd: 12 },
      { chinese: 3, genEd: 15 },
    ])
  })

  it('找不到表格時回傳 null 而非亂猜', () => {
    expect(parseRequirementPage('<html>系統維護中</html>')).toBeNull()
  })
})

describe('parseRequiredCourses', () => {
  const courses = parseRequiredCourses(cou)

  it('解析出每一門系訂必修', () => {
    expect(courses).toHaveLength(11)
    expect(courses).toContainEqual({
      code: 'IM1003', identifier: '705 10300', name: '程式設計', credits: 3, scope: '限本系課程',
    })
  })

  it('跨系必修保留原開課單位的識別碼', () => {
    expect(courses).toContainEqual(expect.objectContaining({
      code: 'MATH4006', identifier: '201 49810', name: '微積分1', credits: 2,
    }))
  })

  it('學分加總等於應修學分表上該年級的必修學分', () => {
    // 頁面預設只列一年級；一年級上下學期合計 14 + 13
    const total = courses.filter((c) => !c.group).reduce((s, c) => s + c.credits, 0)
    expect(total).toBe(parseRequirementPage(tc)!.majorByGrade[0])
  })
})
