import { useEffect, useState } from 'react'
import { load, save, type AppState } from '../core/storage'
import { reclassifyAll } from '../core/courses'

/**
 * 載入時修正舊存檔。
 *
 * 早期版本帶入官方資料時只套了其中一個國文方案（6＋12 或 3＋15），
 * 通識超過該方案的部分會被誤丟。補成合併上限：國文 6、通識 15、合計 18。
 */
function migrate(state: AppState): AppState {
  const programs = state.programs.map((p) => {
    const r = p.requirements
    const onePlan = r.chinese !== undefined && r.genEd !== undefined && r.chinese + r.genEd === 18
    if (!p.source || r.chineseGenEd !== undefined || !onePlan) return p
    return { ...p, requirements: { ...r, chinese: 6, genEd: 15, chineseGenEd: 18 } }
  })
  // 分類規則會隨版本修正，未手動覆寫的課每次載入都重新歸類
  return { programs, courses: reclassifyAll(state.courses, programs) }
}

/** localStorage 在私密視窗或被封鎖時可能拋錯，讀寫失敗就只留在記憶體。 */
function safeLoad(): AppState {
  try {
    return migrate(load(window.localStorage))
  } catch {
    return { programs: [], courses: [] }
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(safeLoad)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    try {
      save(state, window.localStorage)
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }, [state])

  return { state, setState, saveFailed }
}
