import type { Category, Course, Program } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 識別碼前三碼即開課單位代碼，格式不一但位置固定。 */
export function deptPrefixOf(identifier?: string): string {
  return identifier ? identifier.slice(0, 3).toUpperCase() : ''
}

const WITHDRAWN = '停修'
/** 不及格沒有拿到學分。 */
const FAILED = new Set(['F', 'X', '不通過'])

/** 學程的本系前綴，可用逗號列出多個（系與所常分屬不同前綴）。 */
export function deptPrefixesOf(program: Program): string[] {
  return program.deptPrefix.split(/[,，\s]+/).map((p) => p.trim().toUpperCase()).filter(Boolean)
}

const squash = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()

/** 對照系訂必修科目表。認可範圍不限本系時，他系開的同名課也算。 */
export function isRequiredCourse(course: ParsedCourse, program: Program): boolean {
  const code = squash(course.code)
  const identifier = squash(course.identifier)
  return (program.requiredCourses ?? []).some((r) =>
    (code !== '' && squash(r.code) === code) ||
    (identifier !== '' && squash(r.identifier) === identifier) ||
    (!r.scope.includes('限本系') && r.name === course.name),
  )
}

/**
 * 本系開的通識課。依規定「若為畢業學系所開授，仍不得採計為通識學分」，
 * 但各系實務不一，工具先算通識、由介面提醒使用者確認。
 */
export function isOwnDeptGenEd(course: ParsedCourse, program: Program): boolean {
  return !!course.genEdDomain && deptPrefixesOf(program).includes(deptPrefixOf(course.identifier))
}

export function classify(course: ParsedCourse, program: Program): Category {
  const prefix = deptPrefixOf(course.identifier)
  const code = course.code ?? ''
  const ownDept = deptPrefixesOf(program).includes(prefix)

  if (course.grade === WITHDRAWN) return '不計入'
  if (course.grade && FAILED.has(course.grade)) return '不計入'
  if (isRequiredCourse(course, program)) return '系訂必修'
  // 有星號的是「經認可為通識的專業課」，本系開授者不得採計通識，但可計入系內選修
  if (course.genEdDomain?.endsWith('*') && ownDept) return '限本系選修'
  if (course.genEdDomain) return '通識'
  if (prefix === '101' || code.startsWith('CHIN')) return '國文'
  if (prefix === '102' || code.startsWith('FL')) return '外文'
  if (prefix === '002' || code.startsWith('PE')) return '體育'
  // 服務學習自 114 學年度起不計入畢業總學分。115 起入學者可計選修至多 2 學分，
  // 但那取決於入學年度，工具不猜 —— 由使用者手動覆寫。
  if (code.startsWith('StuAct') || course.name.includes('服務學習')) return '不計入'
  // 成績單沒有必選修欄位。猜錯必修會讓使用者誤以為已達標，
  // 代價高於猜錯選修，因此保守預設為選修，由使用者勾選必修。
  if (ownDept) return '限本系選修'
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
