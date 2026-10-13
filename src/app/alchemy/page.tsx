'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { buildAlchemy, type InputSource } from '@/lib/alchemy'
import { fmt, ItemIcon, qty, Sells } from '@/components/ui'

const SRC: Record<InputSource, string> = { node: '🌾 node', npc: '🏪 NPC', market: '📈 ตลาด', craft: '⚗ ทำเอง/ซื้อ' }

/** แปรธาตุจากของ node — สูตรที่มีกำไร · ⭐ เลือกทำ = ของ node ในสูตรได้ตีค่าแปรธาตุ (เมื่อเปิดสวิตช์ในตั้งค่า) */
export default function AlchemyPage() {
  const { game, state, update, spots, produced } = useApp()
  const rows = useMemo(() => buildAlchemy(game, spots, produced, state.alchemy.chosen), [game, spots, produced, state.alchemy.chosen])
  const [onlyPlan, setOnlyPlan] = useState(false)
  const toggle = (id: number) =>
    update((s) => ({
      ...s,
      alchemy: { chosen: s.alchemy.chosen.includes(id) ? s.alchemy.chosen.filter((x) => x !== id) : [...s.alchemy.chosen, id] },
    }))
  const shown = rows.filter((r) => !onlyPlan || r.craftsPerDay > 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">⚗ แปรธาตุ</h1>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyPlan} onChange={(e) => setOnlyPlan(e.target.checked)} /> เฉพาะที่ของจากแผนทำได้
        </label>
      </div>
      <p className="text-xs text-neutral-500">
        กำไร/ครั้ง = ขายผลผลิต − วัตถุดิบทุกตัวตามราคาตลาด/NPC (ของ node ก็คิดราคาขาย) · จำนวนออกกลางช่วงของสูตร · ทำได้/วัน = จากของที่จุดในแผนผลิต ·
        เรียง: เลือกแล้ว → หาวัตถุดิบได้ → ขายได้ ≥50/วัน → กำไร/วัน
        {!state.settings.countTiers && <span className="text-amber-300"> · สวิตช์ "นับมูลค่าราชวัง/แปรธาตุ" ปิดอยู่ (หน้าตั้งค่า)</span>}
      </p>
      {shown.map((r) => (
        <div key={r.id} className={`card space-y-2 p-3 ${r.chosen ? 'border-amber-700' : ''} ${r.available ? '' : 'opacity-70'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <ItemIcon id={r.product.id} size={36} title={r.product.name} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.product.name}</div>
              <div className="text-xs text-neutral-400">
                ได้ ~{r.yieldAvg}/ครั้ง · ขาย {fmt(r.product.price)} · <Sells i={r.product} />
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-amber-300">+{fmt(r.profit)}/ครั้ง</div>
              <div className="text-[11px] text-neutral-400">
                {r.craftsPerDay > 0 ? `ทำได้ ~${qty(r.craftsPerDay)} ครั้ง/วัน · +${fmt(r.profit * r.craftsPerDay)}/วัน` : 'แผนยังไม่มีของ node ในสูตร'}
              </div>
            </div>
            <button className={`chip ${r.chosen ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'text-neutral-400'}`} onClick={() => toggle(r.id)}>
              {r.chosen ? '⭐ เลือกทำ' : '☆ เลือกทำ'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {r.inputs.map((i) => (
              <span key={i.item.id} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${i.hard ? 'bg-amber-900/40 text-amber-200' : 'bg-neutral-800/70'}`}>
                <ItemIcon id={i.item.id} size={18} title={i.item.name} />
                {i.item.name} ×{qty(i.qty)}
                <span className="text-neutral-500">
                  {SRC[i.source]}
                  {i.source === 'node' && ` ${qty(i.supply)}/วัน`}
                  {i.hard && ' ⚠ตลาดหมด'}
                  {r.limitBy?.id === i.item.id && r.craftsPerDay > 0 && ' ← คอขวด'}
                </span>
              </span>
            ))}
          </div>
          <div className="text-[11px] text-neutral-500">
            ของ node ในสูตรนี้มีค่า:{' '}
            {r.nodeValue
              .map((v) => {
                const it = r.inputs.find((i) => i.item.id === v.id)!
                return `${it.item.name} ${fmt(v.value)}/ชิ้น (ขายดิบ ${fmt(it.unit)}, ×${(v.value / (it.unit || 1)).toFixed(1)})`
              })
              .join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}
