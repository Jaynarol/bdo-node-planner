'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { useCandidates } from '@/lib/actions'
import { autoFill, derivePlan, reroute } from '@/lib/plan'
import NodeMap from '@/components/NodeMap'
import SpotInfo from '@/components/SpotInfo'
import SummaryBar from '@/components/SummaryBar'
import SummaryModal from '@/components/SummaryModal'
import { fmt } from '@/components/ui'

/** หน้าแผนที่: เครือข่ายทั้งแผน · กด node หลัก → แถบข้างเพิ่ม/ถอดจุดย่อย + ตั้งคนงาน · ✨ เติมอัตโนมัติ · 🔁 จัดเส้นใหม่ */
export default function MapPage() {
  const app = useApp()
  const { game, derived, state, spots, ctx } = app
  const cands = useCandidates()
  const [sel, setSel] = useState<number | null>(null)
  const [target, setTarget] = useState<string>('')
  const [summary, setSummary] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const planPzk = useMemo(() => new Set(state.picks.map((p) => p.pzk)), [state.picks])

  const counts = useMemo(() => {
    const m: Record<number, number> = {}
    for (const s of derived.spots) m[s.parentId] = (m[s.parentId] ?? 0) + 1
    return m
  }, [derived.spots])

  const fill = () => {
    const t = Number(target || state.settings.cpTotal)
    if (!(t > derived.cpUsed)) return setMsg(`แผนใช้ ${derived.cpUsed} CP แล้ว — ใส่เป้าที่มากกว่านี้`)
    const picks = autoFill(ctx, state.picks, Math.min(t, state.settings.cpTotal), state.settings.minPerCp)
    const d = derivePlan(ctx, picks)
    app.setPicks(picks)
    app.setLastAdd(null)
    setMsg(`✨ เพิ่ม ${picks.length - state.picks.length} จุด · CP ${derived.cpUsed} → ${d.cpUsed} · รายได้ +${fmt(d.incomePerDay - derived.incomePerDay)}/วัน`)
  }
  const doReroute = () => {
    const r = reroute(ctx, state.picks)
    if (r.after.cpUsed < r.before.cpUsed || r.after.incomePerDay > r.before.incomePerDay * 1.001) {
      app.setPicks(r.picks)
      setMsg(`🔁 จัดเส้นใหม่: CP ${r.before.cpUsed} → ${r.after.cpUsed} · รายได้ ${fmt(r.before.incomePerDay)} → ${fmt(r.after.incomePerDay)}/วัน`)
    } else setMsg('🔁 เส้นปัจจุบันดีที่สุดแล้ว (จากที่ลองเรียงหลายแบบ)')
  }
  const clear = () => {
    if (!confirm('ล้างแผนทั้งหมด? (ตั้งค่า/อาหารราชวังที่เลือกไม่หาย)')) return
    app.setPicks([])
    app.setLastAdd(null)
  }

  const selNode = sel ? game.node.get(sel) : null
  const selSpots = sel ? (game.pzByParent.get(sel) ?? []).map((pzk) => spots.get(pzk)).filter((s) => !!s) : []
  const inNet = sel ? derived.networkIds.includes(sel) : false

  return (
    <div className="flex h-[calc(100vh-45px)] flex-col">
      <SummaryBar>
        <span className="flex items-center gap-1">
          <input
            className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            placeholder={String(state.settings.cpTotal)}
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))}
            title="เติมจนแผนใช้ CP ถึงเท่านี้"
          />
          <button className="btn-primary" onClick={fill} title="เติมจุดคุ้มสุดต่อจากแผนเดิม จนถึง CP ที่ใส่ (ไม่ลบของเดิม)">
            ✨ เติมถึง CP นี้
          </button>
        </span>
        <button className="btn" onClick={doReroute} disabled={!state.picks.length}>
          🔁 จัดเส้นใหม่
        </button>
        <button className="btn" onClick={() => setSummary(true)} disabled={!state.picks.length}>
          📋 สรุป
        </button>
        <button className="btn" onClick={clear} disabled={!state.picks.length}>
          🗑 ล้างแผน
        </button>
      </SummaryBar>
      {msg && (
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-1 text-sm text-sky-200">
          {msg}
          <button className="text-neutral-500" onClick={() => setMsg(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <NodeMap
            nodes={game.mainNodes}
            baseIds={game.baseIds}
            workerTownIds={game.workerTownIds}
            workerIds={derived.workerNodeIds}
            passIds={derived.passThroughIds}
            counts={counts}
            selectedId={sel}
            onNodeClick={setSel}
            tooltip={(id) => {
              const n = game.node.get(id)!
              const here = (game.pzByParent.get(id) ?? []).map((pzk) => spots.get(pzk)).filter((s) => !!s)
              const base = game.baseIds.has(id) ? (game.workerTownIds.has(id) ? ' (เมืองฟรี)' : ' (ฐานฟรี · ไม่มีคนงาน — ต้องส่งจากเมืองอื่น)') : ''
              return (
                `<b>${n.name}</b> · ${n.cp} CP${base}` +
                here.map((s) => `<br/>• ${s.name}: ${s.dataMissing ? 'ไม่มีข้อมูลดรอป' : fmt(s.income) + '/วัน'}${planPzk.has(s.pzk) ? ' ◀ ในแผน' : ''}`).join('')
              )
            }}
          />
          <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-black/70 px-2 py-1 text-[11px] text-neutral-300">
            🟠 จุดทำงาน · ⚪ ทางผ่าน · 🔵 เมือง · เลข = จำนวนคนงาน · กด node ดูจุดย่อย
          </div>
        </div>
        {selNode && (
          <aside className="w-96 shrink-0 space-y-2 overflow-auto border-l border-neutral-800 bg-neutral-950 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{selNode.name}</div>
                <div className="text-xs text-neutral-400">
                  {selNode.cp} CP · {game.baseIds.has(selNode.id) ? 'เมืองฟรี' : inNet ? (counts[selNode.id] ? 'จุดทำงานในแผน' : 'ทางผ่านในแผน') : 'ยังไม่อยู่ในแผน'}
                </div>
              </div>
              <button className="btn" onClick={() => setSel(null)}>
                ✕
              </button>
            </div>
            {selSpots.length === 0 && <div className="text-xs text-neutral-500">node นี้ไม่มีจุดผลผลิต — ระบบเชื่อมเป็นทางผ่านให้เองเมื่อจำเป็น</div>}
            {selSpots.map((s) => (
              <SpotInfo key={s.pzk} spot={planPzk.has(s.pzk) ? s : (cands.get(s.pzk)?.spot ?? s)} inPlan={planPzk.has(s.pzk)} cost={cands.get(s.pzk)?.cost} editable />
            ))}
          </aside>
        )}
      </div>
      {summary && <SummaryModal onClose={() => setSummary(false)} />}
    </div>
  )
}
