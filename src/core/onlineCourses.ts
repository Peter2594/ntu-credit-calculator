/**
 * 線上課程學分採計（MOOCs）。依「國立臺灣大學學生修習線上課程學分採計要點」：
 * 限採計為選修或通識科目、合計至多 6 學分，成績不計入學期與畢業 GPA；
 * 畢業學系所開授者不得採計為通識學分，入學後已修過的同名課程也不得採計。
 *
 * 課程清單取自數位學習中心歷年開放採計列表（107-2 至 115 學年寒假）。
 * 學分數各學期曾調整（如毒道之處 109-2 由 1 改 2），實際以成績單為準，這裡只用來辨認課程。
 */
export type OnlineCourse = {
  /** 課程識別碼，如 N0100600；早期學期的列表沒有公布識別碼 */
  identifier?: string
  /** 課程編號，如 Online0007 */
  code?: string
  name: string
  /** 通識領域，跨領域寫在一起（如 A78） */
  domain: string
  /** 開課教師所屬學系的識別碼前三碼，用來判斷「畢業學系所開授」；共教中心、研究所等沒有對應學系時留空 */
  deptPrefix?: string
}

export const ONLINE_COURSES: OnlineCourse[] = [
  { identifier: 'N0100000', code: 'Online0001', name: '活用希臘哲學', domain: 'A4', deptPrefix: '104' },
  { identifier: 'N0100200', code: 'Online0003', name: '實驗經濟學', domain: 'A56', deptPrefix: '303' },
  { identifier: 'N0100500', code: 'Online0006', name: '唐詩新思路', domain: 'A1', deptPrefix: '101' },
  { identifier: 'N0100600', code: 'Online0007', name: '用 Python 做商管程式設計', domain: 'A6', deptPrefix: '705' },
  { identifier: 'N0100700', code: 'Online0008', name: '頑想學概率：機率', domain: 'A6', deptPrefix: '901' },
  { identifier: 'N0100800', code: 'Online0009', name: '東亞儒家：人文精神', domain: 'A4' },
  { identifier: 'N0100900', code: 'Online0010', name: '毒道之處：食品安全', domain: 'A78' },
  { identifier: 'N0101000', code: 'Online0011', name: '東坡詞', domain: 'A1', deptPrefix: '101' },
  { identifier: 'N0101100', code: 'Online0012', name: '東亞儒學：孟子', domain: 'A34' },
  { identifier: 'N0101200', code: 'Online0013', name: '聚焦臺灣法律：經濟、社會與民主', domain: 'A5', deptPrefix: 'A01' },
  { identifier: 'N0101300', code: 'Online0014', name: '作業研究：模型與演算法', domain: 'A6', deptPrefix: '705' },
  // 數位學習中心的歷年列表沒有公布識別碼，以課名比對
  { name: '普通物理學：電磁學、光學及近代物理', domain: 'A7', deptPrefix: '202' },
]

const squash = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()
const byIdentifier = new Map(ONLINE_COURSES.flatMap((c) => (c.identifier ? [[squash(c.identifier), c] as const] : [])))
const byCode = new Map(ONLINE_COURSES.flatMap((c) => (c.code ? [[squash(c.code), c] as const] : [])))
const byName = new Map(ONLINE_COURSES.map((c) => [squash(c.name), c] as const))

/** 這門課是不是線上採計課程。成績單上的寫法不一，識別碼、課號、課名都比對。 */
export function onlineCourseOf(course: { identifier?: string; code?: string; name: string }): OnlineCourse | undefined {
  return byIdentifier.get(squash(course.identifier)) ??
    byCode.get(squash(course.code)) ??
    byName.get(squash(course.name))
}

/** 線上課程採計上限（要點第四條） */
export const ONLINE_CAP = 6
