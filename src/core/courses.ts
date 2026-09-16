import { applyClassification, matchesRequired } from './classify.js'
import type { Category, Course, Program, RequiredCourse } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 同一學期、同課號、同識別碼、同課名視為同一門課 —— 重複匯入時靠它比對。 */
export function courseKey(c: ParsedCourse): string {
  return [c.semester, c.code ?? '', c.identifier ?? '', c.name].join('|')
}

function classifyAll(course: Course, programs: Program[]): Course {
  return programs.reduce((acc, p) => applyClassification(acc, p), course)
}

/**
 * 把新貼上的成績併入既有課程。已存在的課更新成績與學分，
 * 但保留使用者的分類 —— 「之後相同課號自動沿用」。
 */
export function mergeImported(
  existing: Course[],
  parsed: ParsedCourse[],
  programs: Program[],
): Course[] {
  const result = [...existing]
  const index = new Map(result.map((c, i) => [c.id, i]))

  for (const p of parsed) {
    const id = courseKey(p)
    const at = index.get(id)
    if (at !== undefined) {
      const old = result[at]!
      result[at] = classifyAll({ ...old, ...p, id, assignments: old.assignments, overridden: old.overridden }, programs)
    } else {
      index.set(id, result.length)
      result.push(classifyAll({ ...p, id, assignments: [], overridden: false }, programs))
    }
  }
  return result
}

export function reclassifyAll(courses: Course[], programs: Program[]): Course[] {
  return courses.map((c) => classifyAll(c, programs))
}

/** 使用者手動指定分類。抵免屬系辦裁量，覆寫後自動規則不再改它。 */
export function setCategory(course: Course, programId: string, category: Category): Course {
  const others = course.assignments.filter((a) => a.programId !== programId)
  return { ...course, overridden: true, assignments: [...others, { programId, category }] }
}

export function resetCategory(course: Course, programs: Program[]): Course {
  return classifyAll({ ...course, overridden: false, assignments: [] }, programs)
}

export function removeProgram(courses: Course[], programId: string): Course[] {
  return courses.map((c) => ({
    ...c,
    assignments: c.assignments.filter((a) => a.programId !== programId),
  }))
}

export type RequiredItem = {
  required: RequiredCourse
  /** done：已修過；planned：排在課表但還沒成績；missing：還沒修 */
  status: 'done' | 'planned' | 'missing'
  course?: Course
}

export type RequiredProgress = {
  items: RequiredItem[]
  missingCredits: number
  /** 使用者手動算成系訂必修、但對不到清單的課，多半是抵免 */
  extras: Course[]
}

/** 逐門對照系訂必修清單。只有在該學程被歸為系訂必修的課才算數，停修、不及格不算。 */
export function requiredProgress(courses: Course[], program: Program): RequiredProgress {
  const counted = courses.filter((c) =>
    c.assignments.some((a) => a.programId === program.id && a.category === '系訂必修'),
  )
  const used = new Set<string>()

  const items = (program.requiredCourses ?? []).map((required): RequiredItem => {
    const matches = counted.filter((c) => matchesRequired(c, required))
    const done = matches.find((c) => c.grade)
    const planned = matches.find((c) => !c.grade)
    const course = done ?? planned
    if (course) used.add(course.id)
    return { required, status: done ? 'done' : planned ? 'planned' : 'missing', ...(course ? { course } : {}) }
  })

  return {
    items,
    missingCredits: items.filter((i) => i.status === 'missing').reduce((s, i) => s + i.required.credits, 0),
    extras: counted.filter((c) => !used.has(c.id) && !(program.requiredCourses ?? []).some((r) => matchesRequired(c, r))),
  }
}
