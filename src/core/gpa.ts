import type { Course } from './types.js'

export type GpaScale = 'ntu' | 'us'

/** 台大 4.3 制。美制 4.0 只把 A+ 壓到 4.0，其餘相同。 */
const NTU_POINTS: Record<string, number> = {
  'A+': 4.3, A: 4.0, 'A-': 3.7,
  'B+': 3.3, B: 3.0, 'B-': 2.7,
  'C+': 2.3, C: 2.0, 'C-': 1.7,
  D: 1.0, E: 0, F: 0, X: 0,
}

/** 沒拿到學分的成績。 */
const NO_CREDIT = new Set(['停修', '不通過', 'E', 'F', 'X'])

/** 等第成績的點數；通過、停修、抵免等不列入計分的回傳 null。 */
export function gradePoint(grade: string | undefined, scale: GpaScale): number | null {
  if (!grade) return null
  const point = NTU_POINTS[grade]
  if (point === undefined) return null
  return scale === 'us' ? Math.min(point, 4.0) : point
}

export type GpaSummary = { credits: number; ntu: number | null; us: number | null }

function summarize(courses: Course[]): GpaSummary {
  let credits = 0
  let ntu = 0
  let us = 0
  for (const c of courses) {
    const p = gradePoint(c.grade, 'ntu')
    if (p === null || c.credits <= 0) continue
    credits += c.credits
    ntu += p * c.credits
    us += gradePoint(c.grade, 'us')! * c.credits
  }
  return credits === 0
    ? { credits: 0, ntu: null, us: null }
    : { credits, ntu: ntu / credits, us: us / credits }
}

export type GpaReport = {
  overall: GpaSummary
  /** 本系 GPA：在指定學程被歸為系訂必修或系內選修的課 */
  major: GpaSummary
  semesters: (GpaSummary & { semester: string })[]
  /** 實得學分：有成績且及格（含通過、抵免），不含停修與不及格 */
  earnedCredits: number
}

export function computeGpa(courses: Course[], programId?: string): GpaReport {
  const graded = courses.filter((c) => c.grade)
  const inMajor = graded.filter((c) =>
    c.assignments.some((a) => a.programId === programId && (a.category === '系訂必修' || a.category === '限本系選修')),
  )

  const bySemester = new Map<string, Course[]>()
  for (const c of graded) bySemester.set(c.semester, [...(bySemester.get(c.semester) ?? []), c])
  const semesters = [...bySemester.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semester, list]) => ({ semester, ...summarize(list) }))
    .filter((s) => s.credits > 0)

  return {
    overall: summarize(graded),
    major: summarize(inMajor),
    semesters,
    earnedCredits: graded.filter((c) => !NO_CREDIT.has(c.grade!)).reduce((s, c) => s + c.credits, 0),
  }
}
