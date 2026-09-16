import { CATEGORIES, type Category, type Course, type Program } from '../../core/types'
import { categoryLabel } from '../constants'
import { Info } from './Progress'

/** 新增課程時的分類：空字串代表依識別碼自動判斷。 */
export type CategoryChoice = Category | ''

const CHOICES = CATEGORIES.filter((c) => c !== '不計入')

export function CategoryField({ value, onChange }: { value: CategoryChoice; onChange(v: CategoryChoice): void }) {
  return (
    <label className="field">
      <span className="field-label">
        分類
        <Info text="自動會依識別碼與必修清單判斷；手動選的分類不會被自動規則改掉" />
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value as CategoryChoice)}>
        <option value="">自動判斷</option>
        {CHOICES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
    </label>
  )
}

/** 手動指定分類時套用到每個學程並標記覆寫；自動則留給 reclassifyAll。 */
export function withChoice(course: Course, choice: CategoryChoice, programs: Program[]): Course {
  if (!choice) return course
  return { ...course, overridden: true, assignments: programs.map((p) => ({ programId: p.id, category: choice })) }
}
