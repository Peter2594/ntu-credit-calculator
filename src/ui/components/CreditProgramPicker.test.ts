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
})
