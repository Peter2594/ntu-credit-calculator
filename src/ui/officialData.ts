import type { ChinesePlan } from '../core/curri'
import type { RulePage } from '../core/regrules'
import type { CreditRules, Program, RequiredCourse, Requirements } from '../core/types'
import { designatedDomains } from '../core/genEd'

export type OfficialDept = {
  code: string
  name: string
  deptPrefix: string
  requirements: Requirements
  chinesePlans: ChinesePlan[]
  /** 備註寫明的超修、本系通識與新生課程採計規定（舊資料沒有） */
  creditRules?: CreditRules
  requiredCourses: RequiredCourse[]
  /** 教務處公告的輔系、雙主修規定；科目多為文字說明 */
  minor?: RulePage
  doubleMajor?: RulePage
}

export type OfficialYear = { year: string; fetchedAt: string; departments: OfficialDept[] }

const BASE = `${import.meta.env.BASE_URL}data/requirements`
const cache = new Map<string, Promise<unknown>>()

function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    // 失敗時不留在快取，下次可以重試
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url) as Promise<T>
}

export const loadYears = () => getJson<{ years: string[] }>(`${BASE}/index.json`).then((d) => d.years)
export const loadYear = (year: string) => getJson<OfficialYear>(`${BASE}/${year}.json`)

export function officialPageUrl(year: string, code: string): string {
  return `https://curri.aca.ntu.edu.tw/NTUVoxCourse/index.php/uquery/tc?DPRNDPT=${code}&QPYEAR=${year}`
}

/** 主修的採計規定：系上備註＋共同教育中心公告的指定通識領域 */
export function creditRulesFor(dept: OfficialDept): CreditRules {
  const domains = designatedDomains(dept.code)
  return { ...dept.creditRules, ...(domains ? { genEdDomains: domains } : {}) }
}

/**
 * 早期帶入的主修沒有採計規定，官方資料更新後也可能變動；有變化時補上。
 * 沒有任何變動時回傳 null。
 */
export function refreshMainRules(programs: Program[], years: Map<string, OfficialYear>): Program[] | null {
  let changed = false
  const next = programs.map((p) => {
    if (p.kind !== '主修' || !p.source || (p.source.kind ?? '主修') !== '主修') return p
    const dept = years.get(p.source.year)?.departments.find((d) => d.code === p.source!.deptCode)
    if (!dept) return p
    const rules = creditRulesFor(dept)
    if (JSON.stringify(rules) === JSON.stringify(p.creditRules ?? {})) return p
    changed = true
    return { ...p, creditRules: rules }
  })
  return changed ? next : null
}
