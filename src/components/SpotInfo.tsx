'use client'
import { useApp } from '@/lib/app'
import { addPick, removePick } from '@/lib/actions'
import type { Spot } from '@/lib/econ'
import type { Pick, WorkerChoice } from '@/lib/state'
import { fmt, ItemIcon, qty } from './ui'

const WORKER_LABEL: Record<WorkerChoice, string> = { goblin: 'Goblin', giant: 'ยักษ์' }

/**
 * ข้อมูลจุดผลผลิต — modal ไอเทม: ดูอย่างเดียว · หน้าแผนที่ (editable): เพิ่ม/ถอด + สายคนงาน/ความเร็ว
 */
export default function SpotInfo({
  spot: s,
  inPlan,
  cost,
  highlight,
  editable,
}: {
  spot: Spot
  inPlan: boolean
  /** CP ส่วนเพิ่มถ้าเพิ่มตอนนี้ */
  cost?: number
  highlight?: number
  editable?: boolean
}) {
  const app = useApp()
  const { game, state } = app
  const pick = state.picks.find((p) => p.pzk === s.pzk)
  const town = game.node.get(s.townId)?.name ?? '?'
  const setPick = (patch: Partial<Pick>) =>
    app.setPicks(state.picks.map((p) => (p.pzk === s.pzk ? Object.fromEntries(Object.entries({ ...p, ...patch }).filter(([, v]) => v !== undefined)) as unknown as Pick : p)))
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  return (
    <div className={`rounded border p-2 text-xs ${inPlan ? 'border-amber-700 bg-amber-950/20' : 'border-neutral-800'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {inPlan && '⭐ '}
            {s.name} <span className="text-neutral-400">· {s.cp} CP</span>
          </div>
          <div className="text-neutral-400">{s.parentName}</div>
        </div>
        {editable &&
          (inPlan ? (
            <button className="btn" onClick={() => removePick(app, s.pzk)}>
              − ถอด
            </button>
          ) : (
            <button className="btn-primary" disabled={s.dataMissing} onClick={() => addPick(app, { pzk: s.pzk })}>
              ＋ เพิ่ม
            </button>
          ))}
      </div>
      {s.dataMissing && <div className="mt-1 text-amber-300">⚠ ชุดข้อมูลยังไม่มีอัตราดรอปจุดนี้ (รู้แค่ชนิดของ) — รายได้คิดเป็น 0</div>}
      <div className="mt-1.5 space-y-0.5">
        {s.items.map((it) => (
          <div key={`${it.id}-${it.lucky}`} className={`flex items-center gap-1.5 ${it.lucky ? 'text-neutral-500' : ''} ${highlight === it.id ? 'text-sky-200' : ''}`}>
            <ItemIcon id={it.id} size={18} title={it.name} />
            <span className="min-w-0 flex-1 truncate">
              {it.name}
              {it.lucky && ' ✦'}
            </span>
            {!it.lucky && (
              <span className="shrink-0">
                {qty((s.sp.giant ? it.qtyGi : it.qty) * s.cyclesDaily)}/วัน × {fmt(it.price)}
              </span>
            )}
          </div>
        ))}
        {s.items.some((i) => i.lucky) && <div className="text-[10px] text-neutral-500">✦ ของโชค — ไม่นับในรายได้/จำนวน</div>}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-neutral-300">
        <span>
          คนงานจาก <b>{town}</b>
        </span>
        <span>ระยะ {s.dist.toLocaleString()}</span>
        <span>
          {WORKER_LABEL[s.worker]} {s.locked ? '(ล็อก)' : '(ออโต้)'} · {qty(s.cyclesDaily)} รอบ/วัน
        </span>
        <span>
          รายได้ <b className="text-amber-300">{fmt(s.income)}</b>/วัน
        </span>
        <span className="text-neutral-500">
          Goblin {fmt(s.incomeGoblin)} · ยักษ์ {fmt(s.incomeGiant)}
        </span>
        {!inPlan && cost !== undefined && (
          <span>
            ลงตอนนี้ {cost} CP → <b>{fmt(s.income / Math.max(cost, 0.5))}/CP</b>
          </span>
        )}
      </div>
      {editable && inPlan && pick && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-2">
          <select
            className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5"
            value={pick.worker ?? ''}
            onChange={(e) => setPick({ worker: (e.target.value || undefined) as WorkerChoice | undefined })}
          >
            <option value="">ออโต้ (แนะนำ {WORKER_LABEL[s.recommended]})</option>
            <option value="goblin">Goblin</option>
            <option value="giant">ยักษ์</option>
          </select>
          <label>
            เร็วงาน{' '}
            <input
              className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1"
              placeholder={String(state.settings.workers[s.worker].wspd)}
              value={pick.wspd ?? ''}
              onChange={(e) => setPick({ wspd: num(e.target.value) })}
            />
          </label>
          <label>
            เดิน{' '}
            <input
              className="w-12 rounded border border-neutral-700 bg-neutral-900 px-1"
              placeholder={String(state.settings.workers[s.worker].mspd)}
              value={pick.mspd ?? ''}
              onChange={(e) => setPick({ mspd: num(e.target.value) })}
            />
          </label>
        </div>
      )}
    </div>
  )
}
