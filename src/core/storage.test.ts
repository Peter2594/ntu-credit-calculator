import { describe, it, expect } from 'vitest'
import { save, load, STORAGE_KEY, type StorageLike, type AppState } from './storage.js'
import type { Program } from './types.js'

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial }
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v },
  }
}

const program: Program = {
  id: 'p1', kind: '主修', name: '測試系', deptPrefix: '900',
  requirements: { total: 128, major: 50 },
}

const state: AppState = {
  programs: [program],
  courses: [{
    id: 'c1', name: '課', credits: 3, semester: '114-1',
    assignments: [{ programId: 'p1', category: '系訂必修' }],
    overridden: false,
  }],
}

describe('storage', () => {
  it('存檔後讀回相同內容', () => {
    const s = memoryStorage()
    save(state, s)
    expect(load(s)).toEqual(state)
  })

  it('沒有存檔時回傳空狀態', () => {
    expect(load(memoryStorage())).toEqual({ programs: [], courses: [] })
  })

  it('存檔損毀時回傳空狀態而不是拋錯', () => {
    expect(load(memoryStorage({ [STORAGE_KEY]: '{壞掉的 json' })))
      .toEqual({ programs: [], courses: [] })
  })
})
