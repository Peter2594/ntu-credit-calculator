import { useEffect, useState } from 'react'
import { load, save, type AppState } from '../core/storage'

/** localStorage 在私密視窗或被封鎖時可能拋錯，讀寫失敗就只留在記憶體。 */
function safeLoad(): AppState {
  try {
    return load(window.localStorage)
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
