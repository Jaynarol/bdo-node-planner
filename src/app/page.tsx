'use client'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { CATEGORY_LABEL, clearItem, minusItem, perDayOf, plusItem, useCandidates, useCatalog, type Category } from '@/lib/actions'
import SummaryBar from '@/components/SummaryBar'
import ItemModal from '@/components/ItemModal'
import { fmt, ItemIcon, priceNote, qty, Sells } from '@/components/ui'

type Tab = 'all' | 'plan' | Category
type Sort = 'perCp' | 'value' | 'name'
const MODE_KEY = 'bdo-node-planner:sortMode'

/** หน้าผลผลิต: การ์ดไอเทม → กด ＋/− ลงจุดที่คุ้มสุดของไอเทมนั้น · กดการ์ดดูทุกจุดบนแผนที่ */
export default function ProducePage() {
  const app = useApp()
  const { game, values, produced, state, ctx } = app
  const catalog = useCatalog()
  const cands = useCandidates()
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<Sort>('perCp')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const rows = useMemo(() => {
    const planPzk = new Set(state.picks.map((p) => p.pzk))
    return catalog.map((c) => {
      let next: { pzk: number; perCp: number; perDay: number; cost: number; income: number } | null = null
      for (const pzk of c.pzks) {
        const cand = cands.get(pzk)
        if (!cand || cand.income <= 0 || cand.spot.dataMissing) continue
        const perCp = cand.income / Math.max(cand.cost, 0.5)
        if (!next || perCp > next.perCp)
          next = { pzk, perCp, perDay: perDayOf(cand.spot, c.id), cost: cand.cost, income: cand.income }
      }
      return {
        ...c,
        item: game.item(c.id),
        value: values.get(c.id),
        plan: produced.get(c.id),
        inPlan: c.pzks.filter((p) => planPzk.has(p)).length,
        /** จุดที่ลงได้จริง (ตัดจุดไม่มีข้อมูลดรอป) */
        avail: c.pzks.filter((p) => !ctx.spots.get(p)?.dataMissing).length,
        next,
      }
    })
  }, [catalog, cands, game, values, produced, state.picks, ctx.spots])

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length, plan: rows.filter((r) => r.inPlan).length }
    for (const r of rows) m[r.category] = (m[r.category] ?? 0) + 1
    return m
  }, [rows])

  // โหมดเรียง: auto = เรียงคุ้มสุดใหม่ทุกครั้งที่แผนเปลี่ยน (ค่าเริ่มต้น)
  // lock = ตรึงการ์ดไว้ที่เดิม (กด ＋/− ซ้ำตำแหน่งเดิมได้) — เรียงใหม่เฉพาะเปลี่ยนแท็บ/การเรียง/คำค้น หรือกด ↻
  const [mode, setModeState] = useState<'auto' | 'lock'>('auto')
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'lock') setModeState('lock')
    } catch {}
  }, [])
  const [order, setOrder] = useState<number[] | null>(null)
  const [resort, setResort] = useState(0)
  const computeOrder = () =>
    rows
      .filter((r) => (tab === 'all' ? true : tab === 'plan' ? r.inPlan > 0 : r.category === tab))
      .filter((r) => !q || r.item.name.includes(q.trim()))
      .sort((a, b) =>
        sort === 'name'
          ? a.item.name.localeCompare(b.item.name, 'th')
          : sort === 'value'
            ? (b.value?.price ?? 0) - (a.value?.price ?? 0)
            : (b.next?.perCp ?? -1) - (a.next?.perCp ?? -1),
      )
      .map((r) => r.id)
  useEffect(() => {
    setOrder(computeOrder())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sort, q, resort])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const shown = (mode === 'lock' && order ? order : computeOrder()).map((id) => byId.get(id)).filter((r) => !!r)
  const setMode = (m: 'auto' | 'lock') => {
    if (m === 'lock') setOrder(computeOrder()) // ตรึงตามลำดับที่เห็นอยู่ตอนนี้
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {}
  }

  const plus = (id: number) => {
    const c = plusItem(app, id)
    setMsg(c ? null : `${game.item(id).name}: ไม่มีจุดที่ลงเพิ่มได้แล้ว`)
  }

  return (
    <>
      <SummaryBar />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'plan', ...Object.keys(CATEGORY_LABEL)] as Tab[]).map((t) => (
            <button key={t} className={`chip ${tab === t ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'text-neutral-300'}`} onClick={() => setTab(t)}>
              {t === 'all' ? 'ทั้งหมด' : t === 'plan' ? '⭐ ในแผน' : CATEGORY_LABEL[t]} {counts[t] ?? 0}
            </button>
          ))}
          <span className="flex-1" />
          <input className="w-40 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm" placeholder="ค้นหาไอเทม" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex overflow-hidden rounded-md border border-neutral-700 text-sm">
            {(
              [
                ['auto', '⚡ เรียงคุ้มสุดอัตโนมัติ', 'เรียงใหม่ทันทีทุกครั้งที่แผนเปลี่ยน'],
                ['lock', '📌 ตรึงไอเทม', 'การ์ดอยู่ที่เดิมตอนกด ＋/− (กด ↻ เพื่อเรียงตามค่าล่าสุด)'],
              ] as const
            ).map(([m, label, tip]) => (
              <button
                key={m}
                title={tip}
                onClick={() => setMode(m)}
                className={`px-3 py-1 ${mode === m ? 'bg-amber-600 font-medium text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'lock' && (
            <button className="btn" onClick={() => setResort((x) => x + 1)} title="เรียงตามค่าล่าสุด แล้วตรึงต่อ">
              ↻ เรียงใหม่
            </button>
          )}
          <select className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="perCp">เรียง: จุดถัดไปคุ้ม/CP</option>
            <option value="value">เรียง: มูลค่า/ชิ้น</option>
            <option value="name">เรียง: ชื่อ</option>
          </select>
        </div>
        <div className="text-xs text-neutral-500">
          ＋ = ลงจุดที่ได้ (รายได้รวม ÷ CP ส่วนเพิ่ม รวมทางเชื่อม) สูงสุดที่ผลิตไอเทมนี้ · − = ถอดจุดล่าสุดของไอเทมนี้ · 🗺 ดูทุกจุด = แผนที่ของไอเทม (เลือกจุดเองได้) · ล้าง = ถอดทุกจุดของไอเทมนี้ ·{' '}
          {priceNote(game.marketAt)}
        </div>
        {msg && <div className="text-sm text-amber-300">{msg}</div>}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((r) => (
            <div key={r.id} className="card relative flex flex-col gap-2 overflow-hidden p-3" style={tint(r.inPlan, r.avail)}>
              <div className="flex items-start gap-2">
                <ItemIcon id={r.id} size={40} title={r.item.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.item.name}</div>
                  <div className="text-xs text-neutral-400">
                    {fmt(r.value?.price ?? r.item.price)}/ชิ้น{' '}
                    {r.value?.label ? <span className="text-sky-300">· {r.value.label}</span> : <span>· ขายดิบ</span>}
                  </div>
                  <div className="text-[11px]">
                    <Sells i={r.item} /> <span className="text-neutral-500">· {r.pzks.length} จุดบนแผนที่</span>
                  </div>
                </div>
              </div>
              <div className="text-xs">
                {r.plan ? (
                  <span className="text-amber-200">
                    ในแผน {r.inPlan} จุด · {qty(r.plan.perDay)} ชิ้น/วัน
                  </span>
                ) : (
                  <span className="text-neutral-500">ยังไม่มีในแผน</span>
                )}
              </div>
              <div className="text-xs text-neutral-400">
                {r.allMissing ? (
                  <span className="text-amber-300">⚠ ไม่มีข้อมูลดรอป — ไม่เลือกให้อัตโนมัติ</span>
                ) : r.next ? (
                  <>
                    ถัดไป: +{qty(r.next.perDay)}/วัน · {r.next.cost} CP · <b className="text-neutral-200">{fmt(r.next.perCp)}/CP</b>
                  </>
                ) : (
                  'ลงครบทุกจุดแล้ว'
                )}
              </div>
              {r.inPlan > 0 && (
                <div className="absolute inset-x-0 top-0 h-1 bg-neutral-800" title={`ลงแล้ว ${r.inPlan}/${r.avail} จุด`}>
                  <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, (r.inPlan / Math.max(r.avail, 1)) * 100)}%` }} />
                </div>
              )}
              <div className="mt-auto flex items-center gap-1">
                <button className="btn whitespace-nowrap border-sky-700 bg-sky-950/60 text-sky-200 hover:bg-sky-900" onClick={() => setOpen(r.id)} title="ดูทุกจุดที่ผลิตบนแผนที่ และเลือกจุดเอง">
                  🗺 ดูทุกจุด
                </button>
                <button className="btn" disabled={!r.inPlan} onClick={() => clearItem(app, r.id)} title="ถอดทุกจุดที่ผลิตไอเทมนี้ออกจากแผนทันที">
                  ล้าง
                </button>
                <span className="flex-1" />
                <button className="btn px-3" disabled={!r.inPlan} onClick={() => minusItem(app, r.id)} title="ถอดจุดล่าสุดของไอเทมนี้">
                  −
                </button>
                <span className="w-12 text-center font-semibold">
                  {r.inPlan}
                  <span className="text-xs font-normal text-neutral-500">/{r.avail}</span>
                </span>
                <button className="btn-primary px-3" disabled={!r.next} onClick={() => plus(r.id)} title="ลงจุดที่คุ้มสุดของไอเทมนี้">
                  ＋
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {open !== null && <ItemModal itemId={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/**
 * สีการ์ดตามสัดส่วนจุดที่ลงแล้ว (ลง ÷ จุดทั้งหมดที่ลงได้) — ยังไม่ลง = ปกติ · ยิ่งลงมากยิ่งอำพันเข้ม
 * ใช้อำพันโทนเดียวไล่ความเข้ม + แถบด้านบน (ไม่ใช้แดง-เขียว: ผู้ใช้ตาบอดสี)
 */
function tint(inPlan: number, avail: number): React.CSSProperties | undefined {
  if (!inPlan) return undefined
  const f = Math.min(1, inPlan / Math.max(avail, 1))
  return {
    backgroundColor: `rgba(245, 158, 11, ${0.07 + 0.25 * f})`,
    borderColor: `rgba(251, 191, 36, ${0.35 + 0.55 * f})`,
  }
}
