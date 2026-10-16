import type { Settings } from '@/types'
import { db } from './schema'

// ──────────────────────────────────────────────────────────────
// Settings (KV) — 원본 crud.py get_settings / save_settings
// ──────────────────────────────────────────────────────────────

/** 저장값(문자열) → 숫자/문자열 (원본: "." 포함이면 float, 아니면 int, 실패 시 문자열) */
function parseSettingValue(val: string): number | string {
  if (val.trim() === '') return val
  const n = Number(val)
  if (Number.isNaN(n)) return val
  return val.includes('.') ? n : (Number.isInteger(n) ? n : val)
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const out: Record<string, number | string> = {}
  for (const { key, value } of rows) out[key] = parseSettingValue(value)
  return out as Settings
}

export async function saveSettings(data: Record<string, unknown>): Promise<void> {
  await db.transaction('rw', 'settings', async () => {
    for (const [key, val] of Object.entries(data)) {
      await db.settings.put({ key, value: String(val) })
    }
  })
}
