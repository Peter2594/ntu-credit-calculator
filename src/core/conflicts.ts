import type { Course, Slot } from './types.js'

export type Conflict = {
  a: Course
  b: Course
  day: Slot['day']
  periods: string[]
}

/** 找出同一學期內時段重疊的課程配對。節次以字串比對，'10' 與 'A' 都適用。 */
export function findConflicts(courses: Course[]): Conflict[] {
  const conflicts: Conflict[] = []

  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i]!
      const b = courses[j]!
      if (a.semester !== b.semester) continue

      for (const sa of a.slots ?? []) {
        for (const sb of b.slots ?? []) {
          if (sa.day !== sb.day) continue
          const shared = sa.periods.filter((p) => sb.periods.includes(p))
          if (shared.length > 0) {
            conflicts.push({ a, b, day: sa.day, periods: shared })
          }
        }
      }
    }
  }

  return conflicts
}
