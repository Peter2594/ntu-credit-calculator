import { CATEGORIES, type Category, type Course, type Program } from './types.js'
import { requiredKey } from './courses.js'

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

export type Evaluation = {
  taken: Tally
  /** electiveOutside：選修合計扣掉系內選修，含必修抵免與外文超修的溢出 */
  counted: {
    major: number; electiveInMajor: number; electiveOutside: number
    elective: number; common: number
  }
  totalTaken: number
  totalCounted: number
  gaps: {
    major: number; electiveInMajor: number
    elective: number; common: number; total: number
  }
  pe: { taken: number; required: number; gap: number }
}

const capped = (value: number, limit?: number) =>
  limit === undefined ? value : Math.min(value, limit)
const overflow = (value: number, limit?: number) =>
  limit === undefined ? 0 : Math.max(0, value - limit)
const gap = (value: number, limit?: number) =>
  limit === undefined ? 0 : Math.max(0, limit - value)

function waiverSurplus(courses: Course[], program: Program): number {
  const byId = new Map(courses.map((c) => [c.id, c]))
  const required = new Map((program.requiredCourses ?? []).map((r) => [requiredKey(r), r]))
  return (program.waivers ?? []).reduce((sum, w) => {
    const course = w.courseId ? byId.get(w.courseId) : undefined
    const target = required.get(w.key)
    const countsAsMajor = course?.assignments.some((a) => a.programId === program.id && a.category === '系訂必修')
    return course && target && countsAsMajor ? sum + Math.max(0, course.credits - target.credits) : sum
  }, 0)
}

export function evaluate(courses: Course[], program: Program): Evaluation {
  const taken = tally(courses, program.id)
  const req = program.requirements

  // 抵免課學分多於被抵的必修時，差額依規定計入一般選修（如 4 學分抵 3 學分，餘 1）
  const surplus = waiverSurplus(courses, program)
  const majorTaken = taken['系訂必修'] - surplus

  // 規則 4：系訂必修超修溢出到一般選修
  const major = capped(majorTaken, req.major)
  const majorOverflow = overflow(majorTaken, req.major) + surplus

  // 規則 1、2：國文與通識超修的部分丟棄
  // 規則 3：外文超修的部分計入選修（與前兩者相反）
  const chinese = capped(taken['國文'], req.chinese)
  const genEd = capped(taken['通識'], req.genEd)
  const foreign = capped(taken['外文'], req.foreign)
  const foreignOverflow = overflow(taken['外文'], req.foreign)
  const commonRaw = taken['國文'] + taken['外文'] + taken['通識']
  const common = capped(capped(chinese + genEd, req.chineseGenEd) + foreign, req.common)

  // 規則 5：限本系選修是下限，超修仍計入選修合計
  const electiveInMajor = taken['限本系選修']
  const electiveRaw =
    electiveInMajor + taken['一般選修'] + majorOverflow + foreignOverflow
  const elective = capped(electiveRaw, req.elective)

  const totalCounted = major + elective + common
  const totalTaken =
    taken['系訂必修'] + taken['限本系選修'] + taken['一般選修'] + commonRaw

  return {
    taken,
    counted: {
      major, electiveInMajor, elective, common,
      electiveOutside: Math.max(0, elective - Math.min(electiveInMajor, elective)),
    },
    totalTaken,
    totalCounted,
    gaps: {
      major: gap(major, req.major),
      electiveInMajor: gap(electiveInMajor, req.electiveInMajor),
      elective: gap(elective, req.elective),
      common: gap(common, req.common),
      total: gap(totalCounted, req.total),
    },
    pe: {
      taken: taken['體育'],
      required: req.pe ?? 0,
      gap: gap(taken['體育'], req.pe),
    },
  }
}
