import { applyClassification } from './classify.js'
import type { Category, Course, Program } from './types.js'
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
