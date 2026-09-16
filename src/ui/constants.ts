import type { Slot } from '../core/types'

/** 台大節次與開始時間。 */
export const PERIODS: { id: string; time: string }[] = [
  { id: '1', time: '08:10' }, { id: '2', time: '09:10' }, { id: '3', time: '10:20' },
  { id: '4', time: '11:20' }, { id: '5', time: '12:20' }, { id: '6', time: '13:20' },
  { id: '7', time: '14:20' }, { id: '8', time: '15:30' }, { id: '9', time: '16:30' },
  { id: '10', time: '17:30' }, { id: 'A', time: '18:25' }, { id: 'B', time: '19:20' },
  { id: 'C', time: '20:25' }, { id: 'D', time: '21:20' },
]

export const DAYS: { id: Slot['day']; label: string }[] = [
  { id: 1, label: '一' }, { id: 2, label: '二' }, { id: 3, label: '三' },
  { id: 4, label: '四' }, { id: 5, label: '五' },
]

export const DAY_LABEL: Record<Slot['day'], string> = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五' }

export const SEMESTER_PATTERN = /^\d{3}-[12]$/

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/** 沒有成績的課視為尚未修畢（課表或試算加入的計畫課程）。 */
export const isPlanned = (c: { grade?: string }) => !c.grade

export function formatSlots(slots: Slot[] = []): string {
  return slots.map((s) => `${DAY_LABEL[s.day]} ${s.periods.join(',')}`).join('、')
}
