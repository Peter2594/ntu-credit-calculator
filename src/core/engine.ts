import { CATEGORIES, type Category, type Course, type Program } from './types.js'
import { groupResults, requiredKey, type GroupResult } from './courses.js'

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
    /** 學分學程最低門數或學分還沒達到的模組 */
    groups: string[]
  }
  /** 學分學程各模組的進度（沒有模組規定時為空） */
  groups: GroupResult[]
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

  // 雙主修、輔系只看該系開的課；共同必修、通識、系外選修都在主修那邊採計
  const isMain = program.kind === '主修'
  const deptOnly = taken['系訂必修'] + taken['限本系選修']
  // 學分學程的模組有「至多採計 N 學分／N 門」時，超出部分不計入學程學分
  const groups = program.requiredMode === 'pick' ? groupResults(courses, program) : []
  const groupExcess = groups.reduce((s, g) => s + (g.credits - g.countedCredits), 0)
  const totalCounted = isMain ? major + elective + common : Math.max(0, deptOnly - groupExcess)
  const totalTaken = isMain
    ? taken['系訂必修'] + taken['限本系選修'] + taken['一般選修'] + commonRaw
    : deptOnly

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
      groups: groups.filter((g) => g.unmet).map((g) => g.name),
    },
    groups,
    pe: {
      taken: taken['體育'],
      required: req.pe ?? 0,
      gap: gap(taken['體育'], req.pe),
    },
  }
}

const categoryOf = (course: Course, programId: string) =>
  course.assignments.find((a) => a.programId === programId)?.category

/**
 * 決定哪些課算進輔系。依台大輔系辦法：輔系學分不計入本學系最低畢業學分，
 * 本學系系訂必修也不得兼充輔系科目。依學期先後分配，湊滿輔系門檻即停，
 * 多修的該系課程仍留給主修當選修。
 */
function allocateMinors(courses: Course[], programs: Program[]): Map<string, Set<string>> {
  const main = programs.find((p) => p.kind === '主修')
  const taken = new Set<string>()
  const result = new Map<string, Set<string>>()

  for (const minor of programs.filter((p) => p.kind === '輔系')) {
    const target = minor.requirements.total ?? Infinity
    const ids = new Set<string>()
    let sum = 0
    // 有公告選課範圍時只採計範圍內的課（被歸為系訂必修者）
    const counts: string[] = minor.requiredMode === 'pick' ? ['系訂必修'] : ['系訂必修', '限本系選修']
    const eligible = courses
      .filter((c) => !taken.has(c.id))
      .filter((c) => counts.includes(categoryOf(c, minor.id) ?? ''))
      .filter((c) => !main || categoryOf(c, main.id) !== '系訂必修')
      .sort((a, b) => a.semester.localeCompare(b.semester))

    for (const c of eligible) {
      if (sum >= target) break
      ids.add(c.id)
      taken.add(c.id)
      sum += c.credits
    }
    result.set(minor.id, ids)
  }
  return result
}

/** 同時評估所有學程，處理學程之間的學分歸屬（輔系學分不重複計入主修）。 */
export function evaluateAll(courses: Course[], programs: Program[]): Map<string, Evaluation> {
  const minors = allocateMinors(courses, programs)
  const toMinor = new Set([...minors.values()].flatMap((s) => [...s]))

  return new Map(programs.map((p) => {
    const own = p.kind === '輔系'
      ? courses.filter((c) => minors.get(p.id)!.has(c.id))
      : courses.filter((c) => !toMinor.has(c.id))
    return [p.id, evaluate(own, p)]
  }))
}
