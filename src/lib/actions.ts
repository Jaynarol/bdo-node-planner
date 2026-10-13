'use client'
/** คำสั่งแก้แผนที่ทุกหน้าใช้ร่วมกัน (＋/− ไอเทม, เพิ่ม/ถอดจุด) + ข้อมูลรายไอเทม */
import { useMemo } from 'react'
import { useApp, type App } from './app'
import type { Spot } from './econ'
import { bestSpotForItem, candidateEvaluator, derivePlan, type Candidate } from './plan'
import type { Pick } from './state'

export type Category = 'ore' | 'wood' | 'farm' | 'dig' | 'gather' | 'fish' | 'other'
export const CATEGORY_LABEL: Record<Category, string> = {
  ore: '⛏ แร่',
  wood: '🪓 ไม้',
  farm: '🌾 ฟาร์ม',
  dig: '🪨 ขุด',
  gather: '🌿 รวบรวม',
  fish: '🐟 ปลาแห้ง',
  other: '📦 อื่นๆ',
}
export function spotCategory(name: string): Category {
  if (/ขุดแร่/.test(name)) return 'ore'
  if (/ตัดไม้/.test(name)) return 'wood'
  if (/ลานตากปลา/.test(name)) return 'fish'
  if (/^ขุด|เหมืองหิน/.test(name)) return 'dig'
  if (/รวบรวม/.test(name)) return 'gather'
  if (/ปลูก|เพาะ|ผลิต(?!กรรม)/.test(name)) return 'farm'
  return 'other'
}

export interface CatalogItem {
  id: number
  category: Category
  /** จุดที่ผลิตไอเทมนี้ (ของหลัก) */
  pzks: number[]
  /** ทุกจุดไม่มีข้อมูลดรอป */
  allMissing: boolean
}

/** ไอเทมทุกตัวที่คนงานเก็บได้ (ของหลัก) */
export function useCatalog(): CatalogItem[] {
  const { game, ctx } = useApp()
  return useMemo(() => {
    const m = new Map<number, { pzks: number[]; best: { cat: Category; qty: number }; missing: boolean }>()
    for (const s of ctx.spots.values())
      for (const it of s.items) {
        if (it.lucky) continue
        const row = m.get(it.id) ?? { pzks: [], best: { cat: spotCategory(s.name), qty: -1 }, missing: true }
        row.pzks.push(s.pzk)
        if (it.qty > row.best.qty) row.best = { cat: spotCategory(s.name), qty: it.qty }
        if (!s.dataMissing) row.missing = false
        m.set(it.id, row)
      }
    return [...m].map(([id, r]) => ({ id, category: r.best.cat, pzks: r.pzks, allMissing: r.missing }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, ctx.spots])
}

/** ต้นทุน/รายได้ของทุกจุดที่ยังไม่อยู่ในแผน ถ้าเพิ่มตอนนี้ */
export function useCandidates(): Map<number, Candidate> {
  const { ctx, derived, state } = useApp()
  return useMemo(() => {
    const evalC = candidateEvaluator(ctx, derived, state.picks)
    const taken = new Set(state.picks.map((p) => p.pzk))
    const out = new Map<number, Candidate>()
    for (const s of ctx.spots.values()) {
      if (taken.has(s.pzk)) continue
      const c = evalC(s)
      if (c) out.set(s.pzk, c)
    }
    return out
  }, [ctx, derived, state.picks])
}

export function perDayOf(s: Spot, itemId: number) {
  const it = s.items.find((i) => i.id === itemId && !i.lucky)
  return it ? (s.sp.giant ? it.qtyGi : it.qty) * s.cyclesDaily : 0
}

/** เพิ่มจุดเข้าแผน แล้วจำ "จุดล่าสุด" ไว้โชว์เงิน/CP */
export function addPick(app: App, pick: Pick) {
  if (app.state.picks.some((p) => p.pzk === pick.pzk)) return
  const before = app.derived
  const picks = [...app.state.picks, pick]
  const after = derivePlan(app.ctx, picks)
  app.setPicks(picks)
  app.setLastAdd({ pzk: pick.pzk, cost: after.cpUsed - before.cpUsed, income: after.incomePerDay - before.incomePerDay })
}

export function removePick(app: App, pzk: number) {
  app.setPicks(app.state.picks.filter((p) => p.pzk !== pzk))
  if (app.lastAdd?.pzk === pzk) app.setLastAdd(null)
}

/** ＋ ไอเทม: เพิ่มจุดที่คุ้มสุด (รายได้รวม ÷ CP ส่วนเพิ่ม รวมทาง) ที่ผลิตไอเทมนี้ */
export function plusItem(app: App, itemId: number): Candidate | null {
  const c = bestSpotForItem(app.ctx, app.derived, app.state.picks, itemId)
  if (c) addPick(app, { pzk: c.spot.pzk })
  return c
}

/** − ไอเทม: ถอดจุดล่าสุดในแผนที่ผลิตไอเทมนี้ (ทางผ่านที่ไม่มีใครใช้หายเอง) */
export function minusItem(app: App, itemId: number) {
  const picks = app.state.picks
  for (let i = picks.length - 1; i >= 0; i--) {
    const s = app.spots.get(picks[i].pzk)
    if (s && s.items.some((it) => it.id === itemId && !it.lucky)) {
      removePick(app, picks[i].pzk)
      return
    }
  }
}

/** ล้าง: ถอดทุกจุดในแผนที่ผลิตไอเทมนี้ทันที */
export function clearItem(app: App, itemId: number) {
  const drop = new Set(
    app.state.picks.filter((p) => app.spots.get(p.pzk)?.items.some((it) => it.id === itemId && !it.lucky)).map((p) => p.pzk),
  )
  app.setPicks(app.state.picks.filter((p) => !drop.has(p.pzk)))
  if (app.lastAdd && drop.has(app.lastAdd.pzk)) app.setLastAdd(null)
}
