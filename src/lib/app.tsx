'use client'
/**
 * ศูนย์กลางของเว็บ: โหลดข้อมูลเกม + สถานะจาก localStorage แล้วคำนวณแผนให้ทุกหน้าใช้ร่วมกัน
 * แก้อะไรก็บันทึกอัตโนมัติ (ไม่มีปุ่มเซฟ)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadGame, type Game } from './data'
import { computeSpots, type Spot } from './econ'
import { buildGraph, DEFAULT_WALK_LAMBDA, derivePlan, type DerivedPlan, type PlanCtx } from './plan'
import { DEFAULT_STATE, loadState, saveState, type AppState, type Pick } from './state'
import { computeValues, type ItemValue } from './value'
import { computeTierPrices } from './tiers'

export interface Produced {
  itemId: number
  perDay: number
  spots: { pzk: number; perDay: number }[]
}

export interface LastAdd {
  pzk: number
  cost: number
  income: number
}

export interface App {
  game: Game
  state: AppState
  update: (fn: (s: AppState) => AppState) => void
  /** ทุกจุดผลผลิต (คิดเมืองตามเส้นแผนแล้วสำหรับจุดในแผน) */
  spots: Map<number, Spot>
  /** มูลค่าที่ใช้คิดรายได้ (หลังรวมราชวัง/แปรธาตุ ถ้าเปิดสวิตช์) */
  values: Map<number, ItemValue>
  /** มูลค่าแปรรูป/ดิบล้วน (ไม่รวมราชวัง/แปรธาตุ) */
  baseValues: Map<number, ItemValue>
  ctx: PlanCtx
  derived: DerivedPlan
  produced: Map<number, Produced>
  lastAdd: LastAdd | null
  setLastAdd: (x: LastAdd | null) => void
  setPicks: (picks: Pick[]) => void
}

const Ctx = createContext<App | null>(null)

export function useApp(): App {
  const a = useContext(Ctx)
  if (!a) throw new Error('useApp นอก AppProvider')
  return a
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<AppState>(DEFAULT_STATE)
  const [lastAdd, setLastAdd] = useState<LastAdd | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    setState(loadState())
    loaded.current = true
    loadGame().then(setGame, (e) => setError(String(e)))
  }, [])

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => {
      const n = fn(s)
      if (loaded.current) saveState(n)
      return n
    })
  }, [])
  const setPicks = useCallback((picks: Pick[]) => update((s) => ({ ...s, picks })), [update])

  const app = useMemo(() => (game ? compute(game, state) : null), [game, state])

  if (error) return <div className="p-6 text-amber-300">โหลดข้อมูลไม่สำเร็จ: {error}</div>
  if (!game || !app) return <div className="p-6 text-neutral-400">กำลังโหลดข้อมูลเกม…</div>
  return <Ctx.Provider value={{ game, state, update, lastAdd, setLastAdd, setPicks, ...app }}>{children}</Ctx.Provider>
}

const valueCache = new WeakMap<Game, Map<number, ItemValue>>()

function compute(game: Game, state: AppState) {
  const { settings } = state
  let baseValues = valueCache.get(game)
  if (!baseValues) {
    const ids = new Set<number>()
    for (const d of game.drops.values()) for (const id of Object.keys(d.unlucky ?? {})) ids.add(Number(id))
    baseValues = computeValues(game, ids)
    valueCache.set(game, baseValues)
  }
  const pickMap = new Map(state.picks.map((p) => [p.pzk, p]))
  const graph = buildGraph(game)
  const mkCtx = (spots: Spot[]): PlanCtx => ({
    game,
    graph,
    spots: new Map(spots.map((s) => [s.pzk, s])),
    profiles: settings.workers,
    lambda: settings.minPerCp > 0 ? settings.minPerCp : DEFAULT_WALK_LAMBDA,
    budget: settings.cpTotal,
  })

  let values = baseValues
  let ctx = mkCtx(computeSpots(game, values, settings.workers, pickMap))
  let derived = derivePlan(ctx, state.picks)
  if (settings.countTiers) {
    // ตีค่าขั้นบันได (ราชวัง/แปรธาตุที่เลือกทำ) จากของที่แผนรอบแรกผลิตได้ แล้วคิดแผนใหม่ด้วยมูลค่านั้น
    const tiers = computeTierPrices(game, state, ctx.spots, produce(derived.spots), baseValues)
    if (tiers.size) {
      values = new Map(baseValues)
      for (const [id, t] of tiers) if (t.price > (values.get(id)?.price ?? 0)) values.set(id, { price: t.price, label: t.label })
      ctx = mkCtx(computeSpots(game, values, settings.workers, pickMap))
      derived = derivePlan(ctx, state.picks)
    }
  }
  const spots = new Map(ctx.spots)
  for (const s of derived.spots) spots.set(s.pzk, s)
  return { spots, values, baseValues, ctx, derived, produced: produce(derived.spots) }
}

/** ของหลักที่แผนผลิตได้ต่อวัน รวมทุกจุด (ของโชคไม่นับ) */
export function produce(spots: Spot[]): Map<number, Produced> {
  const out = new Map<number, Produced>()
  for (const s of spots)
    for (const it of s.items) {
      if (it.lucky) continue
      const perDay = (s.sp.giant ? it.qtyGi : it.qty) * s.cyclesDaily
      if (perDay <= 0) continue
      const row = out.get(it.id) ?? { itemId: it.id, perDay: 0, spots: [] }
      row.perDay += perDay
      row.spots.push({ pzk: s.pzk, perDay })
      out.set(it.id, row)
    }
  return out
}
