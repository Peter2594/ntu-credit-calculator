import type { Category, Course, Program, RequiredCourse } from './types.js'
import type { ParsedCourse } from './parser.js'

/** 識別碼前三碼即開課單位代碼，格式不一但位置固定。 */
export function deptPrefixOf(identifier?: string): string {
  return identifier ? identifier.slice(0, 3).toUpperCase() : ''
}

const WITHDRAWN = '停修'
// 共同必修有時掛在其他單位的識別碼下（共教中心開的健康體適能、各系自開的大一英文班），只能靠課名認
const PE_NAME = /健康體適能|專項運動/
const FOREIGN_NAME = /^(英文\s*[(（]|英文[一二]|大一英文|大一外文)/
export const FRESHMAN = /新生(專題|講座)/
/** 不及格沒有拿到學分。 */
const FAILED = new Set(['F', 'X', '不通過'])

/** 學程的本系前綴，可用逗號列出多個（系與所常分屬不同前綴）。 */
export function deptPrefixesOf(program: Program): string[] {
  return program.deptPrefix.split(/[,，\s]+/).map((p) => p.trim().toUpperCase()).filter(Boolean)
}

/**
 * 台大識別碼慣例：大學部第二碼為 0，同系研究所為 2（資管 705／725、資工 902／922）。
 * 研究所開的課也是本系開授，計入系內選修。
 */
export function withGraduatePrefix(prefix: string): string {
  return /^\d0\d$/.test(prefix) ? `${prefix},${prefix[0]}2${prefix[2]}` : prefix
}

const squash = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()

/** 這門課是否滿足某一門系訂必修。認可範圍不限本系時，他系開的同名課也算。 */
export function matchesRequired(course: ParsedCourse, r: RequiredCourse): boolean {
  const code = squash(course.code)
  const identifier = squash(course.identifier)
  return (code !== '' && squash(r.code) === code) ||
    (identifier !== '' && squash(r.identifier) === identifier) ||
    (!r.scope.includes('限本系') && r.name === course.name)
}

/**
 * 同 matchesRequired，但先依課號、識別碼、課名建索引，給一整份清單逐項比對時用。
 * 回傳的課依原本順序排列。
 */
export function requiredMatcher<T extends ParsedCourse>(courses: T[]): (r: RequiredCourse) => T[] {
  const order = new Map(courses.map((c, i) => [c, i]))
  const index = (key: (c: T) => string) => {
    const map = new Map<string, T[]>()
    for (const c of courses) {
      const k = key(c)
      if (k !== '') map.set(k, [...(map.get(k) ?? []), c])
    }
    return map
  }
  const byCode = index((c) => squash(c.code))
  const byIdentifier = index((c) => squash(c.identifier))
  const byName = index((c) => c.name)
  return (r) => {
    const found = new Set([
      ...(byCode.get(squash(r.code)) ?? []),
      ...(byIdentifier.get(squash(r.identifier)) ?? []),
      ...(r.scope.includes('限本系') ? [] : byName.get(r.name) ?? []),
    ])
    return [...found].sort((a, b) => order.get(a)! - order.get(b)!)
  }
}

export function isRequiredCourse(course: ParsedCourse, program: Program): boolean {
  return (program.requiredCourses ?? []).some((r) => matchesRequired(course, r))
}

/**
 * 本系開的一般通識課（無星號），而且系上沒寫明怎麼採計。依通識課程注意事項「畢業學系所開授之課程，
 * 不得採計為通識課程學分」；系上備註寫明計入或不計入選修時 classify 直接處理，
 * 沒寫時工具先算通識、由介面提醒使用者確認。
 */
export function isOwnDeptGenEd(course: ParsedCourse, program: Program): boolean {
  return program.creditRules?.ownGenEdToElective === undefined &&
    !!course.genEdDomain && !course.genEdDomain.endsWith('*') &&
    deptPrefixesOf(program).includes(deptPrefixOf(course.identifier))
}

export function classify(course: ParsedCourse, program: Program): Category {
  const prefix = deptPrefixOf(course.identifier)
  const code = course.code ?? ''
  const ownDept = deptPrefixesOf(program).includes(prefix)

  if (course.grade === WITHDRAWN) return '不計入'
  if (course.grade && FAILED.has(course.grade)) return '不計入'
  if (isRequiredCourse(course, program)) return '系訂必修'
  const rules = program.creditRules ?? {}
  // 有星號的是「經認可為通識的專業課」，本系開授者不得採計通識，但可計入系內選修
  if (course.genEdDomain?.endsWith('*') && ownDept) return '限本系選修'
  // 本系開的一般通識不得採計通識；系上寫明是否計入選修
  if (course.genEdDomain && ownDept && rules.ownGenEdToElective !== undefined) {
    return rules.ownGenEdToElective ? '限本系選修' : '不計入'
  }
  if (course.genEdDomain) return '通識'
  // 新生專題、新生講座是否納入畢業學分由各系決定；擇一計入在 engine 處理
  const freshman = FRESHMAN.exec(course.name)?.[1]
  if (freshman && rules.freshman) {
    const counts = rules.freshman === 'both' || rules.freshman === 'one' ||
      (freshman === '專題' ? rules.freshman === 'seminar' : rules.freshman === 'lecture')
    if (!counts) return '不計入'
  }
  if (prefix === '101' || code.startsWith('CHIN')) return '國文'
  if (prefix === '102' || code.startsWith('FL') || FOREIGN_NAME.test(course.name)) return '外文'
  if (prefix === '002' || code.startsWith('PE') || PE_NAME.test(course.name)) return '體育'
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
