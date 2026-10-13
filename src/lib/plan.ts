/**
 * แผน = ลำดับจุดผลผลิตที่เลือก (picks) → เครือข่ายคำนวณใหม่ทุกครั้ง:
 *   จุดแรกเชื่อมจากเมือง จุดถัดไปเชื่อมจากเครือข่ายที่มีแล้วด้วยเส้น CP ถูกสุด
 *   (หรือยอมจ่ายเพิ่มเพื่อต่อไปเมืองที่ใกล้กว่า ถ้ารายได้ที่เพิ่ม ≥ λ ต่อ CP — คนงานเดินได้เฉพาะตามเส้น)
 *   แล้วรอบสองลองต่อกลุ่มเครือข่ายเข้าเมืองที่ใกล้กว่า โดยคิดรายได้ที่เพิ่มของทุกจุดที่ได้ประโยชน์
 * คนงานมาจากเมืองมีคนงานที่ใกล้สุดในกลุ่มเครือข่ายเดียวกับ node แม่ (เมืองไม่มีคนงาน เช่น เบล์รันดีล เดินผ่านได้แต่ส่งคนไม่ได้)
 */
import type { Game } from './data'
import { relocate, type Spot } from './econ'
import type { Pick, WorkerProfiles } from './state'

export interface GraphNode {
  id: number
  cp: number
  conn: number[]
  base: boolean
  workerTown: boolean
}

export type Graph = Map<number, GraphNode>

export function buildGraph(game: Game): Graph {
  return new Map(
    game.mainNodes.map((n) => [
      n.id,
      { id: n.id, cp: n.cp, conn: n.conn, base: game.baseIds.has(n.id), workerTown: game.workerTownIds.has(n.id) && game.baseIds.has(n.id) },
    ]),
  )
}

/** ยอม CP เพิ่ม 1 แต้มเพื่อต่อเมืองที่ใกล้กว่า ถ้ารายได้เพิ่ม ≥ เท่านี้/วัน (เมื่อไม่ได้ตั้งมูลค่าขั้นต่ำ/CP) */
export const DEFAULT_WALK_LAMBDA = 1_000_000

const sourcesOf = (g: Graph) => new Set([...g.values()].filter((n) => n.base && n.workerTown).map((n) => n.id))
const basesOf = (g: Graph) => new Set([...g.values()].filter((n) => n.base).map((n) => n.id))

/** multi-source Dijkstra: ระยะ = ผลรวม CP ของ node ที่ยังไม่ active ตลอดทาง · node active เดินผ่านฟรี */
export function dijkstra(g: Graph, active: Set<number>, sources: Iterable<number> = active) {
  const dist = new Map<number, number>()
  const prev = new Map<number, number>()
  const heap: [number, number][] = []
  const push = (it: [number, number]) => {
    heap.push(it)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  for (const id of sources) {
    dist.set(id, 0)
    push([0, id])
  }
  while (heap.length) {
    const [d, u] = pop()
    if (d > (dist.get(u) ?? Infinity)) continue
    for (const v of g.get(u)?.conn ?? []) {
      const vn = g.get(v)
      if (!vn) continue
      const nd = d + (active.has(v) ? 0 : vn.cp)
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
        push([nd, v])
      }
    }
  }
  return { dist, prev }
}

/** กลุ่ม node ที่เดินถึงกันผ่าน node ใน set */
export function components(g: Graph, set: Set<number>): Map<number, number> {
  const comp = new Map<number, number>()
  let c = 0
  for (const start of set) {
    if (comp.has(start)) continue
    c++
    const stack = [start]
    comp.set(start, c)
    while (stack.length) {
      const u = stack.pop()!
      for (const v of g.get(u)?.conn ?? [])
        if (set.has(v) && !comp.has(v)) {
          comp.set(v, c)
          stack.push(v)
        }
    }
  }
  return comp
}

export interface DerivedPick {
  pzk: number
  parentId: number
  /** CP ส่วนเพิ่มตอนลงจุดนี้ (ทางเชื่อม + จุดเอง) */
  cost: number
  pathIds: number[]
  unreachable?: boolean
}

export interface DerivedPlan {
  perPick: DerivedPick[]
  /** จุดในแผน คิดเมืองจริง/คนงาน/รายได้แล้ว */
  spots: Spot[]
  /** node หลักในเครือข่ายแผน (ไม่รวมเมืองฟรี) */
  networkIds: number[]
  workerNodeIds: number[]
  passThroughIds: number[]
  cpUsed: number
  incomePerDay: number
  townLinks: { toTownId: number; cost: number; gain: number; pathIds: number[] }[]
  /** สถานะเครือข่ายสุดท้าย — ใช้คิดต้นทุนจุดถัดไป */
  active: Set<number>
}

export interface PlanCtx {
  game: Game
  graph: Graph
  spots: Map<number, Spot>
  profiles: WorkerProfiles
  /** λ: รายได้/วันที่ยอมแลกกับ 1 CP */
  lambda: number
  /** งบ CP — รอบต่อเมืองใกล้กว่าจะไม่เกินนี้ */
  budget: number
}

export function derivePlan(ctx: PlanCtx, picks: Pick[]): DerivedPlan {
  const { graph, spots, profiles, lambda } = ctx
  const bases = basesOf(graph)
  const workerTowns = sourcesOf(graph)
  const active = sourcesOf(graph)
  const perPick: DerivedPick[] = []
  const pickOf = new Map(picks.map((p) => [p.pzk, p]))
  let cpUsed = 0

  const incomeAt = (pzk: number, town: { townId: number; dist: number }) =>
    relocate(spots.get(pzk)!, town, profiles, pickOf.get(pzk)).income

  let compCache: { comp: Map<number, number>; members: Map<number, number[]> } | null = null
  for (const pick of picks) {
    const e = spots.get(pick.pzk)
    if (!e) continue
    // node แม่อยู่ในเครือข่ายแล้ว (จุดพี่น้อง) — จ่ายแค่ค่าจุด · เรื่องเมืองที่ใกล้กว่าให้รอบสองจัดการ
    if (active.has(e.parentId)) {
      cpUsed += e.cp
      perPick.push({ pzk: pick.pzk, parentId: e.parentId, cost: e.cp, pathIds: [] })
      continue
    }
    if (!compCache) {
      const c = components(graph, new Set([...active, ...bases]))
      const m = new Map<number, number[]>()
      for (const [id, x] of c) m.set(x, [...(m.get(x) ?? []), id])
      compCache = { comp: c, members: m }
    }
    const { comp, members } = compCache

    const option = (sources: Iterable<number>) => {
      const srcSet = new Set(sources)
      const { dist, prev } = dijkstra(graph, active, srcSet)
      const pathCost = dist.get(e.parentId)
      if (pathCost === undefined) return null
      const pathIds: number[] = []
      const merged = new Set<number>()
      let cur: number | undefined = e.parentId
      while (cur !== undefined) {
        const cc = comp.get(cur)
        if (cc !== undefined) merged.add(cc)
        if (!active.has(cur)) pathIds.push(cur)
        if (srcSet.has(cur)) break
        cur = prev.get(cur)
      }
      const town = e.towns.find((t) => workerTowns.has(t.townId) && merged.has(comp.get(t.townId) ?? -1))
      if (!town) return null
      const income = incomeAt(e.pzk, town)
      const cost = pathCost + e.cp
      return { pathIds: pathIds.reverse(), cost, town, merged, score: income - lambda * cost }
    }

    let best = option(active)
    if (!best) {
      perPick.push({ pzk: pick.pzk, parentId: e.parentId, cost: 0, pathIds: [], unreachable: true })
      continue
    }
    const tried = new Set(best.merged)
    for (const t of e.towns) {
      if (t.dist >= best.town.dist) break
      const c = comp.get(t.townId)
      if (!workerTowns.has(t.townId) || c === undefined || tried.has(c)) continue
      tried.add(c)
      const alt = option(members.get(c) ?? [])
      if (alt && alt.score > best.score) best = alt
    }
    for (const id of best.pathIds) active.add(id)
    if (best.pathIds.length) compCache = null
    cpUsed += best.cost
    perPick.push({ pzk: pick.pzk, parentId: e.parentId, cost: best.cost, pathIds: best.pathIds.filter((id) => !bases.has(id)) })
  }

  // รอบสอง: ต่อกลุ่มเครือข่ายเข้าเมืองที่ใกล้กว่า — รวมรายได้ที่เพิ่มของทุกจุดที่ได้ประโยชน์
  const placed = perPick.filter((x) => !x.unreachable)
  const townLinks: DerivedPlan['townLinks'] = []
  for (let iter = 0; iter < 25; iter++) {
    const comp = components(graph, new Set([...active, ...bases]))
    const nearest = (pzk: number, comps: Set<number>) =>
      spots.get(pzk)!.towns.find((t) => workerTowns.has(t.townId) && comps.has(comp.get(t.townId) ?? -1))
    const pairs = new Map<string, { from: number; to: number; townId: number }>()
    for (const x of placed) {
      const pc = comp.get(x.parentId)
      if (pc === undefined) continue
      const curTown = nearest(x.pzk, new Set([pc]))
      for (const t of spots.get(x.pzk)!.towns) {
        if (curTown && t.dist >= curTown.dist) break
        const tc = comp.get(t.townId)
        if (!workerTowns.has(t.townId) || tc === undefined || tc === pc) continue
        pairs.set(`${pc}>${tc}`, { from: pc, to: tc, townId: t.townId })
      }
    }
    let best: { pathIds: number[]; cost: number; gain: number; townId: number } | null = null
    for (const pr of pairs.values()) {
      const src = [...comp].filter(([, c]) => c === pr.to).map(([id]) => id)
      const { dist, prev } = dijkstra(graph, active, src)
      let end: number | undefined
      let endCost = Infinity
      for (const [id, c] of comp)
        if (c === pr.from && (dist.get(id) ?? Infinity) < endCost) {
          end = id
          endCost = dist.get(id)!
        }
      if (end === undefined || cpUsed + endCost > ctx.budget) continue
      const pathIds: number[] = []
      const merged = new Set([pr.from, pr.to])
      const srcSet = new Set(src)
      let cur: number | undefined = end
      while (cur !== undefined && !srcSet.has(cur)) {
        const cc = comp.get(cur)
        if (cc !== undefined) merged.add(cc)
        if (!active.has(cur)) pathIds.push(cur)
        cur = prev.get(cur)
      }
      let gain = 0
      for (const x of placed) {
        const pc = comp.get(x.parentId)
        if (pc === undefined || !merged.has(pc)) continue
        const before = nearest(x.pzk, new Set([pc]))
        const after = nearest(x.pzk, merged)
        if (before && after && after.dist < before.dist) gain += incomeAt(x.pzk, after) - incomeAt(x.pzk, before)
      }
      const score = gain - lambda * endCost
      if (score > 0 && (!best || score > best.gain - lambda * best.cost)) best = { pathIds, cost: endCost, gain, townId: pr.townId }
    }
    if (!best) break
    for (const id of best.pathIds) active.add(id)
    cpUsed += best.cost
    townLinks.push({ toTownId: best.townId, cost: best.cost, gain: best.gain, pathIds: best.pathIds.filter((id) => !bases.has(id)) })
  }

  // เมืองจริงของทุกจุด = เมืองมีคนงานใกล้สุดในกลุ่มเดียวกับ node แม่
  const comp = components(graph, new Set([...active, ...bases]))
  const planSpots: Spot[] = []
  for (const x of placed) {
    const e = spots.get(x.pzk)!
    const t = e.towns.find((t) => workerTowns.has(t.townId) && comp.get(t.townId) === comp.get(x.parentId))
    planSpots.push(t ? relocate(e, t, profiles, pickOf.get(x.pzk)) : e)
  }
  const workerNodeIds = new Set(placed.map((x) => x.parentId))
  const networkIds = [...active].filter((id) => !bases.has(id))
  return {
    perPick,
    spots: planSpots,
    networkIds,
    workerNodeIds: [...workerNodeIds],
    passThroughIds: networkIds.filter((id) => !workerNodeIds.has(id)),
    cpUsed,
    incomePerDay: planSpots.reduce((s, x) => s + x.income, 0),
    townLinks,
    active,
  }
}

export interface Candidate {
  spot: Spot
  /** CP ส่วนเพิ่ม (ทาง + จุด) ถ้าลงตอนนี้ */
  cost: number
  pathCost: number
  /** รายได้ตามเมืองที่จะได้จริงหลังเชื่อม */
  income: number
  pathIds: number[]
}

/**
 * ต้นทุน/รายได้ของจุดที่ยังไม่อยู่ในแผน ถ้าเพิ่มตอนนี้ (เชื่อมเส้นถูกสุดจากเครือข่ายปัจจุบัน)
 * คืนฟังก์ชันประเมิน — Dijkstra ครั้งเดียวใช้ได้ทุกจุด
 */
export function candidateEvaluator(ctx: PlanCtx, derived: { active: Set<number> }, picks: Pick[]) {
  const { graph, profiles } = ctx
  const bases = basesOf(graph)
  const workerTowns = sourcesOf(graph)
  const active = derived.active
  const comp = components(graph, new Set([...active, ...bases]))
  const { dist, prev } = dijkstra(graph, active)
  const pickOf = new Map(picks.map((p) => [p.pzk, p]))
  const pathOf = (parentId: number) => {
    const ids: number[] = []
    const merged = new Set<number>()
    let cur: number | undefined = parentId
    while (cur !== undefined) {
      const cc = comp.get(cur)
      if (cc !== undefined) merged.add(cc)
      if (active.has(cur)) break
      ids.push(cur)
      cur = prev.get(cur)
    }
    return { ids: ids.reverse(), merged }
  }
  return (spot: Spot, pathShared = false): Candidate | null => {
    const pathCost = dist.get(spot.parentId)
    if (pathCost === undefined) return null
    const { ids, merged } = pathOf(spot.parentId)
    const t = spot.towns.find((t) => workerTowns.has(t.townId) && merged.has(comp.get(t.townId) ?? -1))
    const s = t ? relocate(spot, t, profiles, pickOf.get(spot.pzk)) : spot
    const pc = pathShared ? 0 : pathCost
    return { spot: s, cost: pc + spot.cp, pathCost, income: s.income, pathIds: ids.filter((id) => !bases.has(id)) }
  }
}

/**
 * ＋ ของไอเทม: จุดที่ผลิตไอเทมนี้ ซึ่งให้ (รายได้รวม ÷ CP ส่วนเพิ่ม) สูงสุด
 * คิดเป็นชุดต่อ node แม่ (จุดของไอเทมนี้หลายจุดใน node เดียวกันจ่ายค่าทางครั้งเดียว) แล้วลงจุดแรกของชุด
 */
export function bestSpotForItem(ctx: PlanCtx, derived: DerivedPlan, picks: Pick[], itemId: number): Candidate | null {
  const evalC = candidateEvaluator(ctx, derived, picks)
  const taken = new Set(picks.map((p) => p.pzk))
  const byParent = new Map<number, Candidate[]>()
  for (const s of ctx.spots.values()) {
    if (taken.has(s.pzk) || s.dataMissing) continue
    if (!s.items.some((i) => i.id === itemId && !i.lucky && i.qty > 0)) continue
    const c = evalC(s)
    if (c && c.income > 0) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), c])
  }
  let best: { c: Candidate; score: number } | null = null
  for (const list of byParent.values()) {
    list.sort((a, b) => b.income / Math.max(b.spot.cp, 0.5) - a.income / Math.max(a.spot.cp, 0.5))
    let income = 0
    let cost = list[0].pathCost
    for (const c of list) {
      income += c.income
      cost += c.spot.cp
      const score = income / Math.max(cost, 0.5)
      if (!best || score > best.score) best = { c: list[0], score }
    }
  }
  return best?.c ?? null
}

/**
 * ✨ เติมอัตโนมัติจนแผนใช้ CP ถึง target — ต่อยอดจากจุดที่เลือกไว้ (ไม่ลบของเดิม)
 * ทุกรอบเลือกชุดจุดของ node แม่เดียวกันที่ (รายได้ ÷ CP ส่วนเพิ่ม) สูงสุด · ข้ามจุดที่ไม่มีข้อมูลดรอป
 */
export function autoFill(ctx: PlanCtx, picks: Pick[], target: number, minPerCp: number): Pick[] {
  let cur = [...picks]
  const start = derivePlan(ctx, cur)
  // เดินแบบเพิ่มทีละชุด (ไม่คิดแผนใหม่ทั้งก้อนทุกรอบ — ช้า) แล้วค่อยคิดเต็มตอนจบ
  const active = new Set(start.active)
  let used = start.cpUsed
  const taken = new Set(cur.map((p) => p.pzk))
  const added: Pick[] = []
  for (let guard = 0; guard < 400; guard++) {
    const remaining = target - used
    if (remaining <= 0) break
    const evalC = candidateEvaluator(ctx, { active }, cur)
    const byParent = new Map<number, Candidate[]>()
    for (const s of ctx.spots.values()) {
      if (taken.has(s.pzk) || s.dataMissing) continue
      const c = evalC(s)
      if (c && c.income > 0) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), c])
    }
    let best: { list: Candidate[]; cost: number; score: number } | null = null
    for (const list of byParent.values()) {
      list.sort((a, b) => b.income / Math.max(b.spot.cp, 0.5) - a.income / Math.max(a.spot.cp, 0.5))
      let income = 0
      let cost = list[0].pathCost
      for (let k = 0; k < list.length; k++) {
        income += list[k].income
        cost += list[k].spot.cp
        if (cost > remaining) break
        const score = income / Math.max(cost, 0.5)
        if (score < minPerCp) continue
        if (!best || score > best.score) best = { list: list.slice(0, k + 1), cost, score }
      }
    }
    if (!best) break
    for (const id of best.list[0].pathIds) active.add(id)
    active.add(best.list[0].spot.parentId)
    used += best.cost
    for (const c of best.list) {
      taken.add(c.spot.pzk)
      added.push({ pzk: c.spot.pzk })
    }
    cur = [...cur, ...best.list.map((c) => ({ pzk: c.spot.pzk }))]
  }
  // คิดเต็ม (เลือกเส้น/เมืองจริง) — ถ้าเกินเป้า ถอดจุดท้ายสุดที่เพิ่งเติมออกจนไม่เกิน
  let derived = derivePlan(ctx, cur)
  while (added.length && derived.cpUsed > target) {
    const last = added.pop()!
    cur = cur.filter((p) => p.pzk !== last.pzk)
    derived = derivePlan(ctx, cur)
  }
  return cur
}

/**
 * 🔁 จัดเส้นใหม่: ลองเรียงลำดับการเชื่อมหลายแบบ แล้วเอาแบบที่ใช้ CP น้อยสุด (เท่ากัน → รายได้มากกว่า)
 * จุดในแผนเหมือนเดิมทุกจุด เปลี่ยนแค่ลำดับ → เส้นทางผ่าน
 */
export function reroute(ctx: PlanCtx, picks: Pick[]): { picks: Pick[]; before: DerivedPlan; after: DerivedPlan } {
  const before = derivePlan(ctx, picks)
  const near = (p: Pick) => ctx.spots.get(p.pzk)?.towns[0]?.dist ?? Infinity
  const inc = (p: Pick) => ctx.spots.get(p.pzk)?.income ?? 0
  const variants: Pick[][] = [
    [...picks].sort((a, b) => inc(b) - inc(a)),
    [...picks].sort((a, b) => near(a) - near(b)),
    primOrder(ctx, picks),
  ]
  let best = { picks, d: before }
  for (const v of variants) {
    const d = derivePlan(ctx, v)
    if (d.cpUsed < best.d.cpUsed - 1e-9 || (Math.abs(d.cpUsed - best.d.cpUsed) < 1e-9 && d.incomePerDay > best.d.incomePerDay * 1.001))
      best = { picks: v, d }
  }
  return { picks: best.picks, before, after: best.d }
}

/** เรียงแบบ Prim: ทุกรอบเอาจุดที่ node แม่ต่อจากเครือข่ายปัจจุบันได้ถูกสุดก่อน */
function primOrder(ctx: PlanCtx, picks: Pick[]): Pick[] {
  const active = sourcesOf(ctx.graph)
  const left = [...picks]
  const out: Pick[] = []
  while (left.length) {
    const { dist, prev } = dijkstra(ctx.graph, active)
    let bi = 0
    let bc = Infinity
    left.forEach((p, i) => {
      const s = ctx.spots.get(p.pzk)
      const c = s ? (dist.get(s.parentId) ?? Infinity) : Infinity
      if (c < bc) {
        bc = c
        bi = i
      }
    })
    const [p] = left.splice(bi, 1)
    out.push(p)
    const s = ctx.spots.get(p.pzk)
    let cur: number | undefined = s?.parentId
    while (cur !== undefined && !active.has(cur)) {
      active.add(cur)
      cur = prev.get(cur)
    }
  }
  return out
}
