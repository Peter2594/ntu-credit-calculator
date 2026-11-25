import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { classify } from './classify.js'
import type { Program } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 跨校科目表是從兩校公告的 PDF 抽出來的，這些檢查防止抽錯悄悄上線。 */
type Plan = {
  total: number | null
  mode?: 'all' | 'pick'
  listedCredits?: number
  closed?: string
  courses: { name: string; credits: number }[]
}
type School = {
  school: string
  year: string
  source: string
  note: string
  programs: ({ dept: string } & Partial<Record<'輔系' | '雙主修', Plan>>)[]
}

const { schools } = JSON.parse(
  readFileSync(new URL('../../public/data/alliance-programs.json', import.meta.url), 'utf8'),
) as { schools: School[] }

const ntust = schools.find((s) => s.school === '臺科大')!
const ntnu = schools.find((s) => s.school === '臺師大')!

describe('臺大系統跨校雙主修、輔系資料', () => {
  it('兩校都在，而且都有逐系科目表', () => {
    expect(schools.map((s) => s.school)).toEqual(['臺科大', '臺師大'])
    expect(ntust.programs.length).toBeGreaterThanOrEqual(19)
    expect(ntnu.programs.length).toBeGreaterThanOrEqual(36)
  })

  it('臺師大的學分落在該校辦法的範圍內（輔系 20–30、雙主修 40–50）', () => {
    for (const p of ntnu.programs) {
      if (p.輔系?.total) {
        expect(p.輔系.total).toBeGreaterThanOrEqual(20)
        expect(p.輔系.total).toBeLessThanOrEqual(30)
      }
      if (p.雙主修?.total) {
        expect(p.雙主修.total).toBeGreaterThanOrEqual(40)
        expect(p.雙主修.total).toBeLessThanOrEqual(50)
      }
    }
  })

  it('臺師大每個系都讀得到科目清單', () => {
    for (const p of ntnu.programs) {
      for (const plan of [p.輔系, p.雙主修]) {
        if (plan) expect(plan.courses.length).toBeGreaterThan(0)
      }
    }
  })

  it('學系名稱不重複', () => {
    for (const s of schools) {
      const depts = s.programs.map((p) => p.dept)
      expect(depts.length).toBe(new Set(depts).size)
    }
  })

  it.each(ntust.programs.map((p) => [p.dept, p] as const))('%s 的科目與學分合理', (_, p) => {
    for (const kind of ['輔系', '雙主修'] as const) {
      const plan = p[kind]
      if (!plan) continue
      for (const c of plan.courses) {
        expect(c.name.trim()).not.toBe('')
        expect(c.name).not.toMatch(/學分|。|，/)
        // 英語檢定這類 0 學分的門檻科目也在表上
        expect(c.credits).toBeGreaterThanOrEqual(0)
        expect(c.credits).toBeLessThanOrEqual(10)
      }
      // 停招的學程不會有完整科目表，其餘都該有學分總數
      if (!plan.closed) expect(plan.total === null || plan.total >= 18).toBe(true)
    }
  })

  it('輔系至少 20、雙主修至少 40 學分（臺科大辦法第五條）', () => {
    for (const p of ntust.programs) {
      if (p.輔系?.total) expect(p.輔系.total).toBeGreaterThanOrEqual(20)
      if (p.雙主修?.total && !p.雙主修.closed) expect(p.雙主修.total).toBeGreaterThanOrEqual(40)
    }
  })

  it('清單學分不足應修總數的才標成 all（表上是必修、其餘自由補足）', () => {
    for (const p of ntust.programs) {
      for (const plan of [p.輔系, p.雙主修]) {
        if (!plan?.mode || plan.total === null) continue
        const expected = (plan.listedCredits ?? 0) < plan.total ? 'all' : 'pick'
        expect(plan.mode).toBe(expected)
      }
    }
  })

  it('已停招的雙主修有標記', () => {
    const closed = ntust.programs.filter((p) => p.雙主修?.closed).map((p) => p.dept)
    expect(closed).toContain('科技管理學士學位學程')
    expect(closed).toContain('智慧財產權學士學位學程')
  })

  it('沒有把承辦人姓名、電話之類的個資抄進公開資料', () => {
    const raw = readFileSync(new URL('../../public/data/alliance-programs.json', import.meta.url), 'utf8')
    expect(raw).not.toMatch(/@[\w.-]+\.(?:tw|com|edu|org)/)
    expect(raw).not.toMatch(/\(0\d\)\s?\d{7,8}/)
  })
})

const course = (over: Partial<ParsedCourse>): ParsedCourse => ({
  name: 'x', credits: 3, semester: '114-1', ...over,
})

describe('跨校輔系有科目表時只採計表上的課', () => {
  const listed: Program = {
    id: 'm1', kind: '輔系', name: '臺科大資訊管理系', deptPrefix: '', crossSchool: '臺科大',
    requirements: { total: 24 },
    requiredMode: 'all',
    requiredCourses: [
      { code: '', identifier: '', name: '資料庫管理系統', credits: 3, scope: '不限本院(系)課程' },
    ],
  }

  it('表上的課算系訂必修', () => {
    expect(classify(course({ name: '資料庫管理系統', identifier: 'TBFB36027', grade: 'A' }), listed)).toBe('系訂必修')
  })

  it('清單只列必修時（all），該校其他課仍算系內選修，用來補足應修學分', () => {
    expect(classify(course({ name: '機械設計', identifier: 'TBFB36028', grade: 'A' }), listed)).toBe('限本系選修')
  })

  it('清單是一份可選範圍時（pick），清單外的課不算', () => {
    const menu: Program = { ...listed, requiredMode: 'pick' }
    expect(classify(course({ name: '機械設計', identifier: 'TBFB36028', grade: 'A' }), menu)).toBe('一般選修')
  })

  it('本校的同名課不會被算成跨校輔系的必修', () => {
    // 臺科大的科目表只有課名，沒有識別碼；不先確認學校，本校的「資料庫管理系統」會被當成必修
    expect(classify(course({ name: '資料庫管理系統', identifier: '705 10300', grade: 'A' }), listed)).toBe('一般選修')
  })

  it('沒有科目表時才退回以學校判斷', () => {
    const { requiredCourses, requiredMode, ...noList } = listed
    expect(classify(course({ name: '教育概論', identifier: 'TAAEC8015', grade: 'A' }),
      { ...noList, crossSchool: '臺師大', name: '臺師大教育系' })).toBe('限本系選修')
  })
})
