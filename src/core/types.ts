export const CATEGORIES = [
  '系訂必修', '限本系選修', '一般選修',
  '國文', '外文', '通識', '體育', '不計入',
] as const

export type Category = (typeof CATEGORIES)[number]

export type Requirements = {
  total?: number
  major?: number
  common?: number          // 國文＋外文＋通識 的合計上限
  chinese?: number         // 國文個別門檻
  foreign?: number         // 外文個別門檻
  genEd?: number           // 通識個別門檻
  /** 國文＋通識合計上限。國文 6＋通識 12 與 國文 3＋通識 15 兩方案其實是同一條：
   *  國文至多 6、通識至多 15、兩者合計至多 18，不必讓學生選方案。 */
  chineseGenEd?: number
  elective?: number
  electiveInMajor?: number
  pe?: number
}

export type ProgramKind = '主修' | '雙主修' | '輔系'

/** 系訂必修科目表的一列，來自台大必修課程查詢系統。 */
export type RequiredCourse = {
  code: string          // 課號，如 IM1003
  identifier: string    // 課程識別碼，如 705 10300
  name: string
  credits: number
  group?: string        // 群組別：有值表示「數門擇一」類的群修
  scope: string         // 必修認可範圍，如「限本系課程」「不限本院(系)課程」
}

export type Program = {
  id: string
  kind: ProgramKind
  name: string
  /** 識別碼前三碼，多個以逗號分隔（如系與所：705,725）。 */
  deptPrefix: string
  requirements: Requirements
  requiredCourses?: RequiredCourse[]
  /**
   * 系訂必修的抵免與免修，key 為 requiredKey（課號|識別碼）。
   * 有 courseId 表示用那門課抵；沒有則為免修。
   */
  waivers?: { key: string; courseId?: string }[]
  /** 門檻從官方資料帶入時記下來源，方便使用者核對。 */
  source?: { year: string; deptCode: string }
}

export type Slot = {
  day: 1 | 2 | 3 | 4 | 5
  periods: string[]
  room?: string
}

export type Assignment = { programId: string; category: Category }

export type Course = {
  id: string
  name: string
  code?: string
  identifier?: string
  credits: number
  grade?: string
  semester: string
  genEdDomain?: string
  assignments: Assignment[]
  overridden: boolean
  slots?: Slot[]
}
