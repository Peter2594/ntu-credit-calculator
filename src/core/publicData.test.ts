import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { redactContacts } from './regrules.js'

/**
 * 這個 repo 是公開的，而且會部署成網站。官方來源（教務處的規定說明、各校的科目表 PDF）
 * 本來就附著承辦人姓名、信箱、電話與授課教師，抓取程式必須在存檔前拿掉。
 * 這組測試擋的是「抓取程式改壞了、個資又被 commit 進來」。
 */
const DATA = fileURLToPath(new URL('../../public/data/', import.meta.url))

const files = [
  ...readdirSync(DATA).filter((f) => f.endsWith('.json')).map((f) => join(DATA, f)),
  ...readdirSync(join(DATA, 'requirements')).filter((f) => f.endsWith('.json'))
    .map((f) => join(DATA, 'requirements', f)),
]

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /\(0\d\)\s?\d{7,8}|0\d-\d{7,8}|09\d{2}-?\d{6}|分機\s?\d+/
const STUDENT_ID = /\b[A-Za-z]\d{8}\b/

describe('公開資料不含個資', () => {
  it('找得到資料檔', () => {
    expect(files.length).toBeGreaterThanOrEqual(9)
  })

  it.each(files.map((f) => [f.slice(DATA.length), f] as const))('%s 沒有信箱', (_, path) => {
    const text = readFileSync(path, 'utf8')
    expect(EMAIL.exec(text)?.[0]).toBeUndefined()
  })

  it.each(files.map((f) => [f.slice(DATA.length), f] as const))('%s 沒有電話或分機', (_, path) => {
    const text = readFileSync(path, 'utf8')
    expect(PHONE.exec(text)?.[0]).toBeUndefined()
  })

  it.each(files.map((f) => [f.slice(DATA.length), f] as const))('%s 沒有學號', (_, path) => {
    const text = readFileSync(path, 'utf8')
    expect(STUDENT_ID.exec(text)?.[0]).toBeUndefined()
  })
})

describe('redactContacts', () => {
  it('拿掉信箱', () => {
    expect(redactContacts('請寄至 abc@ntu.edu.tw，逾期不受理'))
      .toBe('請寄至 〔承辦人信箱，見系所公告〕，逾期不受理')
  })

  it('拿掉夾在空白之間的承辦人姓名', () => {
    expect(redactContacts('繳交至生物產業傳播暨發展學系 劉宇誠 承辦人電子信箱：ycliou@ntu.edu.tw'))
      .toBe('繳交至生物產業傳播暨發展學系 承辦人電子信箱：〔承辦人信箱，見系所公告〕')
  })

  it('不會誤刪系名', () => {
    expect(redactContacts('由日文系承辦人確認')).toBe('由日文系承辦人確認')
  })

  it('沒有個資時原樣回傳', () => {
    expect(redactContacts('須修畢本系系訂必修學分。')).toBe('須修畢本系系訂必修學分。')
  })
})
