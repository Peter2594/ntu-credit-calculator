/**
 * 解析台大教務處「轉系、輔系及雙主修相關規定查詢」（reg227.aca.ntu.edu.tw）的結果頁。
 *
 * 輔系頁有必修科目、選修科目、最低修習學分總數；雙主修頁只有申請資訊，
 * 因為雙主修依辦法須修畢加修學系全部系訂必修與指定選修。
 * 科目欄多為文字說明（如「詳見系網」「系訂必修中任選 24 學分」），不是課程清單。
 */
import type { RequiredCourse } from './types.js'

export type RulePage = {
  quota?: number
  eligibility?: string
  required?: string
  electives?: string
  minCredits?: number
  note?: string
}

const FIELDS: Record<string, keyof RulePage> = {
  招收名額: 'quota',
  申請資格: 'eligibility',
  必修科目: 'required',
  選修科目: 'electives',
  最低修習學分總數: 'minCredits',
  備註: 'note',
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' }

function cellText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp);/g, (_, k: string) => ENTITIES[k] ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function parseRulePage(html: string): RulePage | null {
  const rows = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)]
  if (!rows.some((m) => cellText(m[1]!) === '系所名稱')) return null

  const page: RulePage = {}
  for (const m of rows) {
    const key = FIELDS[cellText(m[1]!)]
    const value = cellText(m[2]!)
    if (!key || !value) continue
    if (key === 'quota' || key === 'minCredits') {
      const n = Number(value.match(/\d+/)?.[0])
      if (Number.isFinite(n)) page[key] = n
    } else {
      page[key] = value
    }
  }
  return page
}

/**
 * 輔系的選課範圍。教務處只公告文字說明；說明提到「系訂必修」「專業必修」時
 * （如「系訂必修科目中任選 24 學分」），以該系系訂必修清單為範圍，否則無法推定。
 */
export function minorPool(
  rules: RulePage | undefined,
  requiredCourses: RequiredCourse[],
  deptPrefixes: string[] = [],
): RequiredCourse[] {
  const text = `${rules?.required ?? ''} ${rules?.electives ?? ''}`
  if (!/(系訂|專業)必修/.test(text)) return []
  // 「本系開授之專業必修」不含外系開的必修（如微積分）
  if (/開授/.test(text) && deptPrefixes.length > 0) {
    return requiredCourses.filter((c) => deptPrefixes.includes(c.identifier.slice(0, 3)))
  }
  return requiredCourses
}
