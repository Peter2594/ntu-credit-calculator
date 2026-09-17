import { applyClassification, deptPrefixOf, deptPrefixesOf, matchesRequired } from './classify.js'
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
  /** done：已修過；planned：排在課表但還沒成績；waived：抵免或免修；missing：還沒修 */
  status: 'done' | 'planned' | 'waived' | 'missing'
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
  const byId = new Map(courses.map((c) => [c.id, c]))
  const waivers = new Map((program.waivers ?? []).map((w) => [w.key, w]))
  const used = new Set((program.waivers ?? []).flatMap((w) => (w.courseId ? [w.courseId] : [])))
  // 一門課只能滿足清單上的一項：同名的中英文班、課名比對常讓同一門課對到好幾項，重複計算會高估模組學分
  const consumed = new Set(used)

  const items = (program.requiredCourses ?? []).map((required): RequiredItem => {
    const waiver = waivers.get(requiredKey(required))
    if (waiver) {
      const substitute = waiver.courseId ? byId.get(waiver.courseId) : undefined
      // 抵免用的課被刪掉時，這門回到未修，而不是默默維持已抵免
      if (!waiver.courseId || substitute) {
        return { required, status: 'waived', ...(substitute ? { course: substitute } : {}) }
      }
    }
    const matches = counted.filter((c) => !consumed.has(c.id) && matchesRequired(c, required))
    const done = matches.find((c) => c.grade)
    const planned = matches.find((c) => !c.grade)
    const course = done ?? planned
    if (course) {
      used.add(course.id)
      consumed.add(course.id)
    }
    return { required, status: done ? 'done' : planned ? 'planned' : 'missing', ...(course ? { course } : {}) }
  })

  return {
    items,
    missingCredits: items.filter((i) => i.status === 'missing').reduce((s, i) => s + i.required.credits, 0),
    extras: counted.filter((c) => !used.has(c.id) && !(program.requiredCourses ?? []).some((r) => matchesRequired(c, r))),
  }
}

export type GroupResult = {
  name: string
  /** 修過（含已排課表、抵免）的學分與門數，未套上限 */
  credits: number
  count: number
  /** 套用「至多 N 門／N 學分」後可計入的學分 */
  countedCredits: number
  /** 最低門數或學分沒達到 */
  unmet: boolean
}

/** 學分學程各模組的進度。修過的課以成績單學分為準，清單學分可能是推估。 */
export function groupResults(courses: Course[], program: Program): GroupResult[] {
  const rules = program.requiredGroups ?? []
  if (rules.length === 0) return []
  const got = requiredProgress(courses, program).items.filter((i) => i.status !== 'missing')
  const creditsOf = (i: RequiredItem) => i.course?.credits ?? i.required.credits
  const sum = (list: RequiredItem[]) => list.reduce((s, i) => s + creditsOf(i), 0)

  return rules.map((rule) => {
    const list = got.filter((i) => i.required.group === rule.name)
    const credits = sum(list)
    const byCount = rule.maxCourses === undefined ? credits : sum(list.slice(0, rule.maxCourses))
    const countedCredits = rule.maxCredits === undefined ? byCount : Math.min(byCount, rule.maxCredits)
    const unmet = (rule.minCourses !== undefined && list.length < rule.minCourses) ||
      (rule.minCredits !== undefined && credits < rule.minCredits)
    return { name: rule.name, credits, count: list.length, countedCredits, unmet }
  })
}

/** 跨模組規定還沒達到的項目，回傳規定的說明文字。 */
export function unmetGroupRules(program: Program, groups: GroupResult[]): string[] {
  const byName = new Map(groups.map((g) => [g.name, g]))
  return (program.groupRules ?? []).filter((rule) => {
    const involved = rule.groups.map((name) => byName.get(name)).filter((g) => g !== undefined)
    const touched = involved.filter((g) => g.count > 0).length
    const courses = involved.reduce((s, g) => s + g.count, 0)
    const credits = involved.reduce((s, g) => s + g.countedCredits, 0)
    return (rule.minGroups !== undefined && touched < rule.minGroups) ||
      (rule.minCourses !== undefined && courses < rule.minCourses) ||
      (rule.minCredits !== undefined && credits < rule.minCredits)
  }).map((rule) => rule.label)
}

/**
 * 「至少 N 學分不屬於主系、加修學系及輔系之必修」這類規定還沒達到的項目。
 * 輔系清單是可選範圍而非必修，只有逐門列必修（all）的才算。
 * 使用者沒設定相關學系時無從判斷，不列為缺口。
 */
export function unmetOutsideRules(courses: Course[], program: Program, others: Program[]): string[] {
  const rules = program.outsideRules ?? []
  if (rules.length === 0) return []
  const taken = requiredProgress(courses, program).items.flatMap((i) =>
    i.status !== 'missing' && i.course ? [i.course] : [])

  return rules.filter((rule) => {
    const depts = others.filter((p) =>
      rule.mainOnly ? p.kind === '主修' : p.kind === '主修' || p.kind === '雙主修' || p.kind === '輔系')
    if (depts.length === 0) return false
    const inside = (course: Course) => rule.basis === '開設'
      ? depts.some((p) => deptPrefixesOf(p).includes(deptPrefixOf(course.identifier)))
      : depts.some((p) => p.requiredMode !== 'pick' &&
          course.assignments.some((a) => a.programId === p.id && a.category === '系訂必修'))
    const outside = taken.filter((course) => !inside(course))
    const outsideCredits = outside.reduce((s, course) => s + course.credits, 0)
    return (rule.minOutsideCredits !== undefined && outsideCredits < rule.minOutsideCredits) ||
      (rule.minOutsideCourses !== undefined && outside.length < rule.minOutsideCourses) ||
      (rule.maxInsideCourses !== undefined && taken.length - outside.length > rule.maxInsideCourses)
  }).map((rule) => rule.label)
}

export const requiredKey = (r: RequiredCourse) => `${r.code}|${r.identifier}`

/**
 * 系辦核可的抵免常常課號、課名都不同，自動比對永遠認不出來，由使用者指定。
 * 指定抵免課程時，那門課也一併改算系訂必修。
 */
export function waiveRequired(
  program: Program,
  courses: Course[],
  required: RequiredCourse,
  courseId?: string,
): { program: Program; courses: Course[] } {
  const key = requiredKey(required)
  const waivers = [...(program.waivers ?? []).filter((w) => w.key !== key), { key, ...(courseId ? { courseId } : {}) }]
  return {
    program: { ...program, waivers },
    courses: courseId
      ? courses.map((c) => (c.id === courseId ? setCategory(c, program.id, '系訂必修') : c))
      : courses,
  }
}

export function unwaiveRequired(program: Program, key: string): Program {
  return { ...program, waivers: (program.waivers ?? []).filter((w) => w.key !== key) }
}

const sameName = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

/** 以學期＋課名比對，更新已匯入課程的成績（手機版頁面只有這些欄位）。 */
export function updateGrades(
  courses: Course[],
  rows: { semester: string; name: string; grade: string }[],
): { courses: Course[]; updated: number; unmatched: string[] } {
  const next = [...courses]
  let updated = 0
  const unmatched: string[] = []
  for (const row of rows) {
    const at = next.findIndex((c) => c.semester === row.semester && sameName(c.name, row.name))
    if (at === -1) {
      unmatched.push(row.name)
      continue
    }
    next[at] = { ...next[at]!, grade: row.grade }
    updated++
  }
  return { courses: next, updated, unmatched }
}
