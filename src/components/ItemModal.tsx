'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { minusItem, perDayOf, plusItem, useCandidates } from '@/lib/actions'
import NodeMap from './NodeMap'
import SpotInfo from './SpotInfo'
import { fmt, ItemIcon, Modal, qty } from './ui'

/** แผนที่ของไอเทมเดียว: ทุกจุดที่ผลิต (วงฟ้า = ยังไม่ลง · วงส้ม = ในแผน) + ＋/− · กดจุดดูข้อมูล (ดูอย่างเดียว) */
export default function ItemModal({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const app = useApp()
  const { game, spots, derived, state, produced, values } = app
  const cands = useCandidates()
  const item = game.item(itemId)
  const [sel, setSel] = useState<number | null>(null)
  const planPzk = useMemo(() => new Set(state.picks.map((p) => p.pzk)), [state.picks])

  const list = useMemo(
    () =>
      [...spots.values()]
        .filter((s) => s.items.some((i) => i.id === itemId && !i.lucky))
        .map((s) => {
          const inPlan = planPzk.has(s.pzk)
          const c = inPlan ? null : cands.get(s.pzk)
          const shown = c?.spot ?? s
          return { s: shown, inPlan, cost: c?.cost, perDay: perDayOf(shown, itemId), income: shown.income }
        })
        .sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || b.income / Math.max(b.cost ?? b.s.cp, 0.5) - a.income / Math.max(a.cost ?? a.s.cp, 0.5)),
    [spots, itemId, planPzk, cands],
  )
  const parents = [...new Set(list.map((x) => x.s.parentId))]
  const rings = useMemo(
    () =>
      parents.map((id) => {
        const here = list.filter((x) => x.s.parentId === id)
        const n = here.filter((x) => x.inPlan).length
        return { id, inPlan: n > 0, label: here.length > 1 ? `${n}/${here.length}` : undefined }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list],
  )
  const selList = sel ? list.filter((x) => x.s.parentId === sel) : []
  // ส้ม = node ในแผนที่ผลิตไอเทมนี้ · เทา = เครือข่ายแผนส่วนอื่น (ให้วงของไอเทมนี้เด่น)
  const itemPlanParents = useMemo(() => rings.filter((r) => r.inPlan).map((r) => r.id), [rings])
  const otherNet = useMemo(() => derived.networkIds.filter((id) => !itemPlanParents.includes(id)), [derived.networkIds, itemPlanParents])
  const plan = produced.get(itemId)
  const v = values.get(itemId)

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <div className="flex flex-wrap items-center gap-3">
          <ItemIcon id={itemId} size={32} />
          <span>{item.name}</span>
          <span className="text-xs font-normal text-neutral-400">
            {fmt(v?.price ?? item.price)}/ชิ้น {v?.label ? `· ${v.label}` : '· ขายดิบ'}
          </span>
          <span className="text-sm font-normal text-amber-200">{plan ? `ในแผน ${qty(plan.perDay)} ชิ้น/วัน` : ''}</span>
          <span className="flex items-center gap-1">
            <button className="btn px-3" disabled={!plan} onClick={() => minusItem(app, itemId)}>
              −
            </button>
            <span className="w-6 text-center">{list.filter((x) => x.inPlan).length}</span>
            <button className="btn-primary px-3" onClick={() => plusItem(app, itemId)}>
              ＋
            </button>
          </span>
          <span className="text-xs font-normal text-neutral-400">
            CP {derived.cpUsed}/{state.settings.cpTotal} · {fmt(derived.incomePerDay)}/วัน
          </span>
        </div>
      }
    >
      <div className="flex h-[75vh] min-h-0">
        <div className="relative min-w-0 flex-1">
          <NodeMap
            nodes={game.mainNodes}
            baseIds={game.baseIds}
            workerTownIds={game.workerTownIds}
            workerIds={itemPlanParents}
            passIds={otherNet}
            rings={rings}
            selectedId={sel}
            fitIds={parents}
            onNodeClick={(id) => setSel(id)}
            tooltip={(id) => {
              const here = list.filter((x) => x.s.parentId === id)
              const n = game.node.get(id)!
              return `<b>${n.name}</b> · ${n.cp} CP${here.map((x) => `<br/>• ${x.s.name}: ${qty(x.perDay)}/วัน${x.inPlan ? ' ◀ ในแผน' : ''}`).join('')}`
            }}
          />
        </div>
        <div className="w-96 shrink-0 overflow-auto border-l border-neutral-800 p-3 text-sm">
          {sel && selList.length > 0 ? (
            <div className="space-y-3">
              <button className="text-xs text-sky-300" onClick={() => setSel(null)}>
                ← กลับไปรายการทุกจุด
              </button>
              {selList.map((x) => (
                <SpotInfo key={x.s.pzk} spot={x.s} inPlan={x.inPlan} cost={x.cost} highlight={itemId} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-neutral-500">ทุกจุดที่ผลิต ({list.length}) · เรียงในแผนก่อน แล้วรายได้/CP ส่วนเพิ่ม · กดดูข้อมูล</div>
              {list.map((x) => (
                <button
                  key={x.s.pzk}
                  onClick={() => setSel(x.s.parentId)}
                  className={`block w-full rounded border px-2 py-1.5 text-left hover:bg-neutral-800 ${x.inPlan ? 'border-amber-700 bg-amber-950/30' : 'border-neutral-800'}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {x.inPlan && '⭐ '}
                      {x.s.parentName} · {x.s.name}
                    </span>
                    <span className="shrink-0 text-neutral-300">{x.s.dataMissing ? '—' : `${qty(x.perDay)}/วัน`}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {x.s.dataMissing ? (
                      <span className="text-amber-300">⚠ ไม่มีข้อมูลดรอป</span>
                    ) : (
                      <>
                        {fmt(x.income)}/วัน ·{' '}
                        {x.inPlan ? 'อยู่ในแผน' : x.cost !== undefined ? `${x.cost} CP → ${fmt(x.income / Math.max(x.cost, 0.5))}/CP` : 'เชื่อมไม่ถึง'}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
