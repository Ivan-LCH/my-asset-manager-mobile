// 허브 섹션 저장 버튼 — 섹션마다 하나. 무엇이 저장되는지 버튼 문구로 분명히.
import { Save } from 'lucide-react'

export function SaveBar({ label, dirty, saving, error, onSave, disabled }: {
  label: string; dirty: boolean; saving: boolean; error?: boolean; onSave: () => void; disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2" data-save-bar>
      <button type="button" onClick={onSave} disabled={!dirty || saving || disabled}
        className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
        <Save className="w-4 h-4" />
        {saving ? '저장 중…' : `${label} 저장`}
      </button>
      <span className={dirty ? 'text-xs text-amber-300' : 'text-xs text-gray-500'}>{dirty ? '저장하지 않은 변경이 있어요' : '저장됨'}</span>
      {error && <span role="alert" className="text-xs text-red-300">저장하지 못했어요. 입력은 그대로 있으니 다시 눌러 주세요.</span>}
    </div>
  )
}
