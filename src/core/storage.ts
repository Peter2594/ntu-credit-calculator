import type { Course, Program } from './types.js'

export const STORAGE_KEY = 'ntu-credit-calculator/v1'

export type AppState = { programs: Program[]; courses: Course[] }

/** 結構型別，不用 DOM 的 Storage —— core 不載入 DOM lib。
 *  瀏覽器的 localStorage 天然符合這個形狀。 */
export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const EMPTY: AppState = { programs: [], courses: [] }

export function save(state: AppState, storage: StorageLike): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** 讀不到或解析失敗時回傳空狀態 —— 使用者的資料只在瀏覽器裡，
 *  清過站台資料或換瀏覽器都會是空的，這不是錯誤情況。 */
export function load(storage: StorageLike): AppState {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return { ...EMPTY }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      programs: parsed.programs ?? [],
      courses: parsed.courses ?? [],
    }
  } catch {
    return { ...EMPTY }
  }
}
