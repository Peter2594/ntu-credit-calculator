import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRulePage, minorPool } from './regrules.js'

// 台大教務處「轉系、輔系及雙主修相關規定查詢」公開頁面，不含個人資料
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseRulePage', () => {
  it('輔系：讀出名額、最低學分與選修科目說明', () => {
    const r = parseRulePage(read('reg-minor-A010-115.html'))!
    expect(r.quota).toBe(20)
    expect(r.minCredits).toBe(24)
    expect(r.electives).toBe('114學年度本系系訂必修科目(63學分)中任選24學分')
    expect(r.required).toBeUndefined()
    expect(r.eligibility).toContain('前學年學業成績名次應達全班人數之前百分之五十')
    expect(r.eligibility).toContain('\n') // <br> 保留為換行
  })

  it('不收輔系的學系：名額 0、沒有最低學分', () => {
    const r = parseRulePage(read('reg-minor-7050-115.html'))!
    expect(r.quota).toBe(0)
    expect(r.minCredits).toBeUndefined()
    expect(r.eligibility).toBe('本系暫不接受輔系申請。')
  })

  it('雙主修頁沒有科目欄位，只有申請資訊', () => {
    const r = parseRulePage(read('reg-dm-7040-115.html'))!
    expect(r.quota).toBe(10)
    expect(r.minCredits).toBeUndefined()
    expect(r.eligibility).toContain('限臺大非管理學院之各學系學生申請')
  })

  it('查無資料的頁面回傳 null', () => {
    expect(parseRulePage('<html><body>查無資料</body></html>')).toBeNull()
  })
})

describe('minorPool', () => {
  const list = [{ code: 'X1', identifier: '900 10000', name: '甲', credits: 3, scope: '限本系課程' }]

  it('科目說明提到系訂必修或專業必修時，以系訂必修清單為選課範圍', () => {
    expect(minorPool({ electives: '114學年度本系系訂必修科目(63學分)中任選24學分' }, list)).toEqual(list)
    expect(minorPool({ required: '科目範圍為本系開授之專業必修科目。' }, list)).toEqual(list)
  })

  it('說明限定本系開授時，排除外系開的必修（如微積分）', () => {
    const mixed = [...list, { code: 'M1', identifier: '201 49810', name: '微積分1', credits: 2, scope: '不限本院(系)課程' }]
    expect(minorPool({ required: '科目範圍為本系開授之專業必修科目。' }, mixed, ['900', '920'])).toEqual(list)
    expect(minorPool({ electives: '本系系訂必修科目中任選24學分' }, mixed, ['900', '920'])).toEqual(mixed)
  })

  it('只寫詳見系網、或沒有說明時無法推定範圍', () => {
    expect(minorPool({ required: '詳見國企系網說明', electives: '無' }, list)).toEqual([])
    expect(minorPool(undefined, list)).toEqual([])
  })
})
