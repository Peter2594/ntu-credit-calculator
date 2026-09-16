import { CATEGORIES, type Category, type Course } from './types.js'

export type Tally = Record<Category, number>

function emptyTally(): Tally {
  return Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Tally
}

/** 按歸類加總某一學程的學分，未套任何上限。 */
export function tally(courses: Course[], programId: string): Tally {
  const result = emptyTally()
  for (const course of courses) {
    for (const a of course.assignments) {
      if (a.programId === programId) result[a.category] += course.credits
    }
  }
  return result
}
