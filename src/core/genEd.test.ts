import { describe, it, expect } from 'vitest'
import { designatedDomains } from './genEd.js'

describe('designatedDomains：各院系指定通識領域', () => {
  it('依學系代碼查表，分組的系共用同一組', () => {
    expect(designatedDomains('7050')).toEqual(['A1', 'A2', 'A3', 'A4', 'A7', 'A8'])
    expect(designatedDomains('3022')).toEqual(['A1', 'A2', 'A3', 'A7', 'A8'])
    expect(designatedDomains('60800')).toEqual(['A1', 'A2', 'A3', 'A4', 'A5'])
  })

  it('國際學生班與表上沒有的學位學程不套用', () => {
    expect(designatedDomains('1011')).toBeUndefined()
    expect(designatedDomains('H060')).toBeUndefined()
  })
})

describe('domainsOf：跨領域通識', () => {
  it('A58* 表示 A5 與 A8，星號與單一領域照常', async () => {
    const { domainsOf } = await import('./genEd.js')
    expect(domainsOf('A58*')).toEqual(['A5', 'A8'])
    expect(domainsOf('A1')).toEqual(['A1'])
    expect(domainsOf('A6*')).toEqual(['A6'])
  })
})
