'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { addPick, clearItem, minusItem, perDayOf, plusItem, removePick, useCandidates } from '@/lib/actions'
import NodeMap from './NodeMap'
import SpotInfo from './SpotInfo'
import { nodeTooltip } from './tooltip'
import { fmt, ItemIcon, Modal, qty } from './ui'

/**
 * แผนที่ของไอเทมเดียว: ทุกจุดที่ผลิต (วงฟ้า = ยังไม่ลง · วงส้ม = ในแผน)
 * ＋/− ด้านบน = ระบบเลือกจุดให้ · กดการ์ดด้านข้าง = เลือก/ถอดจุดนั้นเอง · ⓘ หรือกดวงบนแผนที่ = ดูข้อมูล
 */
export default function ItemModal({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const app = useApp()
  const { game, spots, derived, state, produced, values } = app
  const cands = useCandidates()
  const item = game.item(itemId)
  const [sel, setSel] = useState<number | null>(null)
  const planPzk = useMemo(() => new Set(state.picks.map((p) => p.pzk)), [state.picks])

  // ลำดับการ์ดล็อกตั้งแต่เปิด (ในแผนก่อน แล้วรายได้/CP ส่วนเพิ่ม) — เลือก/ถอดแล้วการ์ดไม่กระโดด
  const [rank] = useState(() => {
    const rows = [...spots.values()]
      .filter((s) => s.items.some((i) => i.id === itemId && !i.lucky))
      .map((s) => {
        const c = planPzk.has(s.pzk) ? null : cands.get(s.pzk)
        return { pzk: s.pzk, inPlan: planPzk.has(s.pzk), score: (c?.spot ?? s).income / Math.max(c?.cost ?? s.cp, 0.5) }
      })
      .sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || b.score - a.score)
    return new Map(rows.map((r, i) => [r.pzk, i]))
  })
  const toggle = (pzk: number, inPlan: boolean) => (inPlan ? removePick(app, pzk) : addPick(app, { pzk }))
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
        .sort((a, b) => (rank.get(a.s.pzk) ?? 1e9) - (rank.get(b.s.pzk) ?? 1e9)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <button className="btn ml-1" disabled={!plan} onClick={() => clearItem(app, itemId)} title="ถอดทุกจุดของไอเทมนี้">
              ล้าง
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
            tooltip={(id) =>
              nodeTooltip(
                game,
                id,
                list.filter((x) => x.s.parentId === id).map((x) => ({ spot: x.s, inPlan: x.inPlan })),
                itemId,
              )
            }
          />
        </div>
        <div className="w-96 shrink-0 overflow-auto border-l border-neutral-800 p-3 text-sm">
          {sel && selList.length > 0 ? (
            <div className="space-y-3">
              <button className="text-xs text-sky-300" onClick={() => setSel(null)}>
                ← กลับไปรายการทุกจุด
              </button>
              {selList.map((x) => (
                <SpotInfo key={x.s.pzk} spot={x.s} inPlan={x.inPlan} cost={x.cost} highlight={itemId} editable />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-neutral-500">ทุกจุดที่ผลิต ({list.length}) · กดการ์ด = เลือก/ถอดจุดนั้นเอง · ⓘ = ดูข้อมูล</div>
              {list.map((x) => (
                <div
                  key={x.s.pzk}
                  role="button"
                  onClick={() => !x.s.dataMissing && toggle(x.s.pzk, x.inPlan)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-left hover:bg-neutral-800 ${x.inPlan ? 'border-amber-600 bg-amber-950/40' : 'border-neutral-800'} ${x.s.dataMissing ? 'cursor-not-allowed opacity-60' : ''}`}
                  title={x.inPlan ? 'กดเพื่อถอดจุดนี้' : 'กดเพื่อเลือกจุดนี้'}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${x.inPlan ? 'border-amber-400 bg-amber-500 text-black' : 'border-neutral-500'}`}>
                    {x.inPlan ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">
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
                  </div>
                  <button
                    className="shrink-0 rounded px-1.5 text-sky-300 hover:bg-neutral-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSel(x.s.parentId)
                    }}
                    title="ดูข้อมูล/ตำแหน่งบนแผนที่"
                  >
                    ⓘ
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
