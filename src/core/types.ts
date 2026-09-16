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
  elective?: number
  electiveInMajor?: number
  pe?: number
}

export type ProgramKind = '主修' | '雙主修' | '輔系'

export type Program = {
  id: string
  kind: ProgramKind
  name: string
  deptPrefix: string
  requirements: Requirements
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
