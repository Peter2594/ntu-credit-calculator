import { describe, it, expect } from 'vitest'
import type { Program } from '../../core/types'
import { refreshCreditPrograms } from './CreditProgramPicker'

describe('refreshCreditPrograms', () => {
  const saved: Program = {
    id: 'a', kind: '學程', name: '編造學程', deptPrefix: '', requirements: { total: 12 }, requiredMode: 'pick',
    requiredCourses: [], requiredNote: '舊規定', waivers: [{ key: '|100 00001' }],
    source: { year: '學程', deptCode: 'P999', kind: '學程' },
  }
  const data = [{
    code: 'P999', name: '編造學程', total: 15, rules: '新規定',
    groups: [{ name: '甲' }], groupRules: [{ label: '至少修 1 個領域', groups: ['甲'], minGroups: 1 }],
    courses: [{ identifier: '100 00001', name: '編造課', credits: 3, group: '甲' }],
  }]

  it('換成新的清單與門檻，保留抵免紀錄', () => {
    const [p] = refreshCreditPrograms([saved], data)!
    expect(p).toMatchObject({ requirements: { total: 15 }, requiredNote: '新規定', waivers: saved.waivers })
    expect(p!.requiredCourses).toHaveLength(1)
    expect(p!.groupRules).toEqual(data[0]!.groupRules)
  })

  it('已是最新時回傳 null，不是學程的不動', () => {
    const fresh = refreshCreditPrograms([saved], data)!
    expect(refreshCreditPrograms(fresh, data)).toBeNull()
    expect(refreshCreditPrograms([{ ...saved, kind: '主修', source: undefined }], data)).toBeNull()
  })

  it('規定沒寫總學分時保留使用者自填的', () => {
    const [p] = refreshCreditPrograms([saved], [{ ...data[0]!, total: null }])!
    expect(p!.requirements).toEqual({ total: 12 })
  })

  it('學程分成多個方案後被歸到預設方案時，標記請使用者確認', () => {
    const plans = [
      { ...data[0]!, name: '編造學程（甲方案）' },
      { ...data[0]!, code: 'P999B', name: '編造學程（乙方案）' },
    ]
    const [p] = refreshCreditPrograms([saved], plans)!
    expect(p).toMatchObject({ name: '編造學程（甲方案）', planUnconfirmed: true })
  })

  it('只有一個方案、或名稱沒變時不標記', () => {
    expect(refreshCreditPrograms([saved], data)![0]!.planUnconfirmed).toBeUndefined()
    const renamed = [{ ...data[0]!, name: '編造學程（新名稱）' }]
    expect(refreshCreditPrograms([saved], renamed)![0]!.planUnconfirmed).toBeUndefined()
  })
})
