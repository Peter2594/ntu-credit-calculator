/**
 * 把 public/data/requirements/*.json 裡的承辦人姓名與信箱洗掉。
 *
 * 教務處的規定說明本來就附著承辦人聯絡方式，早期抓下來的資料把它們一併存進了公開 repo。
 * 解析端已經在 regrules.ts 的 cellText 擋掉，這支程式用同一個函式清理既有檔案。
 *
 * 用法：node scripts/redact-requirements.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redactContacts } from '../src/core/regrules.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'requirements')

const walk = (value: unknown): unknown => {
  if (typeof value === 'string') return redactContacts(value)
  if (Array.isArray(value)) return value.map(walk)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
  }
  return value
}

let changed = 0
for (const name of readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
  const path = join(DATA, name)
  const before = readFileSync(path, 'utf8')
  const after = JSON.stringify(walk(JSON.parse(before)))
  if (before === after) continue
  writeFileSync(path, after)
  console.log(`${name}: 已清理`)
  changed++
}
console.log(changed === 0 ? '沒有需要清理的檔案' : `清理了 ${changed} 個檔案`)
