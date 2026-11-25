import type { Category, Course, Program, RequiredCourse } from './types.js'
import type { ParsedCourse } from './parser.js'
import { COMM_COURSES, FRESHMAN_COURSES } from './generalCourses.js'
import { onlineCourseOf } from './onlineCourses.js'

/** 識別碼前三碼即開課單位代碼，格式不一但位置固定。 */
export function deptPrefixOf(identifier?: string): string {
  return identifier ? identifier.slice(0, 3).toUpperCase() : ''
}

const WITHDRAWN = '停修'
// 共同必修有時掛在其他單位的識別碼下（共教中心開的健康體適能、各系自開的大一英文班），只能靠課名認
const PE_NAME = /健康體適能|專項運動|專項體育/
const FOREIGN_NAME = /^(英文\s*[(（]|英文[一二]|大一英文|大一外文)/
const COMM = new Set(COMM_COURSES.map(([id]) => id))
const FRESHMAN_IDS = new Set(FRESHMAN_COURSES.map(([id]) => id))
const squashId = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()

/**
 * 溝通表達與職涯發展課程（原基本能力課程）。成績單的通識領域欄標示為 B，
 * 沒有標示時以課程網歷年開課清單的識別碼辨認。
 */
export function isCommCourse(course: ParsedCourse): boolean {
  return course.genEdDomain === 'B' || COMM.has(squashId(course.identifier))
}

/**
 * 共同教育中心的新生專題、新生講座。系上自己開、課名含「新生專題」的課（如「資管新生專題」）不算，
 * 所以只認清單上的識別碼，或課名以「新生專題」「新生講座」開頭的課。
 */
export function freshmanKind(course: ParsedCourse): 'seminar' | 'lecture' | undefined {
  const listed = FRESHMAN_IDS.has(squashId(course.identifier))
  const named = /^新生(專題|講座)/.test(course.name)
  if (!listed && !named) return undefined
  return course.name.includes('講座') ? 'lecture' : 'seminar'
}
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

/** 臺大系統跨校課程與暑期班的識別碼：大寫字母接五位數字 */
const ALLIANCE = /^[A-Z]{3,4}\d{5}$/

/** 臺大暑期班（識別碼以 SC 開頭，如 SCN 20440） */
export function isSummerSession(course: ParsedCourse): boolean {
  const id = squashId(course.identifier)
  return ALLIANCE.test(id) && id.startsWith('SC')
}

/**
 * 臺灣大學系統跨校課程（臺師大、臺科大）。依臺大校際選課規定：
 * 通識由共同教育中心認列、體育認列選修體育、軍訓不計入，其餘是否計入畢業學分由所屬系所審核。
 */
export function isCrossSchool(course: ParsedCourse): boolean {
  return ALLIANCE.test(squashId(course.identifier)) && !isSummerSession(course)
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
  const online = onlineCourseOf(course)
  const domain = course.genEdDomain ?? online?.domain
  return program.creditRules?.ownGenEdToElective === undefined &&
    !!domain && !domain.endsWith('*') &&
    deptPrefixesOf(program).includes(online?.deptPrefix ?? deptPrefixOf(course.identifier))
}

/** 需要看整份成績單才知道的資訊，由 reclassifyAll 提供 */
export type ClassifyContext = {
  halfYear?: boolean
  /** 線上課程的同名課在校內已經修過，依要點第六點不得採計 */
  duplicateOnline?: boolean
}

export function classify(course: ParsedCourse, program: Program, context: ClassifyContext = {}): Category {
  // 線上採計課程的通識領域與開課學系來自數位學習中心的清單，成績單上不一定有這兩欄
  const online = onlineCourseOf(course)
  const prefix = online?.deptPrefix ?? deptPrefixOf(course.identifier)
  const genEdDomain = course.genEdDomain ?? online?.domain
  const code = course.code ?? ''
  const ownDept = deptPrefixesOf(program).includes(prefix)

  if (course.grade === WITHDRAWN) return '不計入'
  if (course.grade && FAILED.has(course.grade)) return '不計入'
  const rules = program.creditRules ?? {}
  if (context.halfYear && rules.halfYearCounts === false) return '不計入'
  // 入學後已修過同名課程者，線上課程不得辦理採計
  if (online && context.duplicateOnline) return '不計入'
  if (isRequiredCourse(course, program)) return '系訂必修'
  // 有星號的是「經認可為通識的專業課」，本系開授者不得採計通識，但可計入系內選修
  if (genEdDomain?.endsWith('*') && ownDept) return '限本系選修'
  // 本系開的一般通識不得採計通識；系上寫明是否計入選修
  if (genEdDomain && ownDept && rules.ownGenEdToElective !== undefined) {
    return rules.ownGenEdToElective ? '限本系選修' : '不計入'
  }
  // 線上課程只能採計通識或選修，本系開授時不得計通識
  if (online && ownDept) return '限本系選修'
  // 體育的班次可能是 A1、A2，會被讀成通識領域，所以先認體育
  if (prefix === '002' || code.startsWith('PE') || PE_NAME.test(course.name)) return '體育'
  if (genEdDomain) return '通識'
  // 新生專題、新生講座是否納入畢業學分由各系決定；擇一計入在 engine 處理
  const freshman = freshmanKind(course)
  if (freshman && rules.freshman) {
    const counts = rules.freshman === 'both' || rules.freshman === 'one' || rules.freshman === freshman
    if (!counts) return '不計入'
  }
  if (prefix === '101' || code.startsWith('CHIN')) return '國文'
  if (prefix === '102' || code.startsWith('FL') || FOREIGN_NAME.test(course.name)) return '外文'
  // 服務學習自 114 學年度起不計入畢業總學分。115 起入學者可計選修至多 2 學分，
  // 但那取決於入學年度，工具不猜 —— 由使用者手動覆寫。
  if (code.startsWith('StuAct') || course.name.includes('服務學習')) return '不計入'
  // 溝通表達與職涯發展課程可充抵通識（上限在 engine）；畢業學系開授者不得採計，改算系內選修
  if (isCommCourse(course) && !ownDept) return '通識'
  // 成績單沒有必選修欄位。猜錯必修會讓使用者誤以為已達標，
  // 代價高於猜錯選修，因此保守預設為選修，由使用者勾選必修。
  if (ownDept) return '限本系選修'
  return '一般選修'
}

/**
 * 為某一學程填上歸類。已覆寫（overridden）的課保留使用者的判斷，
 * 因為抵免屬系辦裁量，自動規則永遠猜不到。
 */
export function applyClassification(course: Course, program: Program, context: ClassifyContext = {}): Course {
  const existing = course.assignments.find((a) => a.programId === program.id)
  if (existing && course.overridden) return course

  const others = course.assignments.filter((a) => a.programId !== program.id)
  return {
    ...course,
    assignments: [...others, { programId: program.id, category: classify(course, program, context) }],
  }
}
