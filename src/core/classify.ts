import type { Category, Course, Program } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 識別碼前三碼即開課單位代碼，格式不一但位置固定。 */
export function deptPrefixOf(identifier?: string): string {
  return identifier ? identifier.slice(0, 3) : ''
}

const WITHDRAWN = '停修'

export function classify(course: ParsedCourse, program: Program): Category {
  const prefix = deptPrefixOf(course.identifier)
  const code = course.code ?? ''

  if (course.grade === WITHDRAWN) return '不計入'
  if (course.genEdDomain) return '通識'
  if (prefix === '101' || code.startsWith('CHIN')) return '國文'
  if (prefix === '102' || code.startsWith('FL')) return '外文'
  if (prefix === '002' || code.startsWith('PE')) return '體育'
  // 服務學習自 114 學年度起不計入畢業總學分。115 起入學者可計選修至多 2 學分，
  // 但那取決於入學年度，工具不猜 —— 由使用者手動覆寫。
  if (code.startsWith('StuAct') || course.name.includes('服務學習')) return '不計入'
  // 成績單沒有必選修欄位。猜錯必修會讓使用者誤以為已達標，
  // 代價高於猜錯選修，因此保守預設為選修，由使用者勾選必修。
  if (prefix === program.deptPrefix) return '限本系選修'
  return '一般選修'
}

/**
 * 為某一學程填上歸類。已覆寫（overridden）的課保留使用者的判斷，
 * 因為抵免屬系辦裁量，自動規則永遠猜不到。
 */
export function applyClassification(course: Course, program: Program): Course {
  const existing = course.assignments.find((a) => a.programId === program.id)
  if (existing && course.overridden) return course

  const others = course.assignments.filter((a) => a.programId !== program.id)
  return {
    ...course,
    assignments: [...others, { programId: program.id, category: classify(course, program) }],
  }
}
