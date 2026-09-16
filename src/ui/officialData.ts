import type { ChinesePlan } from '../core/curri'
import type { RequiredCourse, Requirements } from '../core/types'

export type OfficialDept = {
  code: string
  name: string
  deptPrefix: string
  requirements: Requirements
  chinesePlans: ChinesePlan[]
  requiredCourses: RequiredCourse[]
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
