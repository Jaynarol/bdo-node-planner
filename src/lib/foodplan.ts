/**
 * อาหารราชวังที่เลือกทำ (⭐) เทียบกับของที่จุดในแผนผลิตได้จริง:
 *   แต่ละจานส่งได้กี่กล่อง/วัน · คอขวด · ถึงโควต้าไหม · ต้องปลูก/ซื้ออะไรเองวันละเท่าไร
 * ของ node ที่หลายจานใช้ร่วม แบ่งให้จานที่ได้เพิ่ม/กล่องสูงกว่าก่อน · โควต้าแบ่งเท่าๆ กันให้วนครบทุกจาน
 * วัตถุดิบที่ปลูกได้ ผู้ใช้เลือก: ตาม node (จำกัด) / ปลูกเอง (ไม่จำกัด) / ปลูกชั้นหนึ่ง (นับหลายหน่วย หรือแลกลง 1:4)
 */
import type { Produced } from './app'
import type { Game, Item } from './data'
import type { Spot } from './econ'
import { evaluateDishes, imperialCfg, type DishEval, type Source } from './imperial'
import type { AppState } from './state'

export interface DishPlan {
  dish: DishEval
  /** กล่อง/วันสูงสุดที่ของ node ในแผนรองรับ (Infinity = ปลูก/เก็บเองได้หมด) */
  cratesPerDay: number
  share: number
  limit?: { item: Item; supply: number; needPerCrate: number }
  nodeReq: { item: Item; perCrate: number; supply: number }[]
  /** จุดที่ยังไม่อยู่ในแผน ที่ให้วัตถุดิบคอขวด */
  suggest: { pzk: number; name: string; perDay: number; cp: number }[]
}

export interface Need {
  item: Item
  source: Source
  perDay: number
  premium?: { direct: number; exchanged: number }
  alts?: string[]
  fromNode: number
}

export interface Growable {
  item: Item
  supply: number
  mode: 'node' | 'grow' | 'premium'
  hasNode: boolean
  premiumName?: string
}

export function buildFoodPlan(game: Game, state: AppState, spots: Map<number, Spot>, produced: Map<number, Produced>) {
  const cfg = imperialCfg(state)
  const item = game.item
  const chosen = state.imperial.chosen
  const chosenIds = new Set(chosen.map((c) => c.id))
  const standbyIds = new Set(chosen.filter((c) => c.standby).map((c) => c.id))
  const all = evaluateDishes(game, spots.values(), cfg)
  const evaluated = all.filter((d) => chosenIds.has(d.id) && !d.blocked)
  const dishes = evaluated.filter((d) => !standbyIds.has(d.id))
  const altDishes = evaluated.filter((d) => standbyIds.has(d.id))
  const supply = new Map([...produced].map(([id, p]) => [id, p.perDay]))
  const planPzk = new Set([...produced.values()].flatMap((p) => p.spots.map((s) => s.pzk)))
  const left = new Map(supply)
  const grow = new Set(state.imperial.growOwn)
  const premium = new Set(state.imperial.growPremium)
  const plotYield = state.settings.plotYield

  const premiumOf = (id: number): Item | undefined => {
    const n = item(id).name
    if (/ชั้นหนึ่ง$/.test(n)) return item(id)
    const pid = game.idByName.get(n.replace(/\s*ระดับสูง$/, '').trim() + 'ชั้นหนึ่ง')
    return pid ? item(pid) : undefined
  }
  const premiumSlot = (d: DishEval, id: number) => {
    const slot = d.slots.find((sl) => sl.options.some((o) => o.id === id))
    const best = slot?.options.reduce((a, b) => (b.value > a.value ? b : a))
    return slot && best && best.value > 1 ? { slot, best } : null
  }

  const growable = new Map<number, Growable>()
  for (const d of evaluated)
    for (const r of d.req) {
      if (!r.farmable || growable.has(r.id)) continue
      const hasNode = r.source === 'node'
      const pr = premiumOf(r.id)
      const mode = premium.has(r.id) && pr ? 'premium' : !hasNode || grow.has(r.id) ? 'grow' : 'node'
      growable.set(r.id, { item: item(r.id), supply: supply.get(r.id) ?? 0, mode, hasNode, premiumName: pr?.name })
    }

  const toPlan = (d: DishEval, consume = true): DishPlan => {
    const nodeReq = d.req
      .filter((r) => r.source === 'node' && !grow.has(r.id) && !premium.has(r.id))
      .map((r) => ({ item: item(r.id), perCrate: r.perCrate, supply: Math.max(0, left.get(r.id) ?? 0) }))
    let crates = Infinity
    let limit: DishPlan['limit']
    for (const r of nodeReq) {
      const c = r.supply / r.perCrate
      if (c < crates) {
        crates = c
        limit = { item: r.item, supply: r.supply, needPerCrate: r.perCrate }
      }
    }
    if (consume && Number.isFinite(crates)) for (const r of nodeReq) left.set(r.item.id, (left.get(r.item.id) ?? 0) - crates * r.perCrate)
    const suggest = limit
      ? [...spots.values()]
          .filter((e) => !planPzk.has(e.pzk) && !e.dataMissing)
          .map((e) => ({ e, it: e.items.find((i) => !i.lucky && i.id === limit!.item.id) }))
          .filter((x) => x.it)
          .map((x) => ({
            pzk: x.e.pzk,
            name: `${x.e.parentName} · ${x.e.name}`,
            perDay: (x.e.sp.giant ? x.it!.qtyGi : x.it!.qty) * x.e.cyclesDaily,
            cp: x.e.cp,
          }))
          .sort((a, b) => b.perDay - a.perDay)
          .slice(0, 4)
      : []
    return { dish: d, cratesPerDay: crates, share: 0, limit, nodeReq, suggest }
  }
  const plans = [...dishes].sort((a, b) => b.profit - a.profit).map((d) => toPlan(d))
  const sustainable = plans.reduce((s, p) => s + p.cratesPerDay, 0)
  let remaining = state.settings.quota
  for (let guard = 0; guard < 20 && remaining > 0.01; guard++) {
    const open = plans.filter((p) => p.share < p.cratesPerDay - 1e-9)
    if (!open.length) break
    const t = remaining / open.length
    for (const p of open) {
      const give = Math.min(t, p.cratesPerDay - p.share)
      p.share += give
      remaining -= give
    }
  }

  const computeNeeds = (list: DishPlan[]) => {
    const needs = new Map<number, Need>()
    for (const p of list)
      for (const r of p.dish.req) {
        if (r.source === 'node' && !grow.has(r.id) && !premium.has(r.id)) continue
        const ps = premium.has(r.id) ? premiumSlot(p.dish, r.id) : null
        const pr = premium.has(r.id) && !ps ? premiumOf(r.id) : undefined
        if (pr) {
          const n = needs.get(-pr.id) ?? { item: pr, source: 'farm' as Source, perDay: 0, fromNode: 0, premium: { direct: 0, exchanged: 0 } }
          const amt = (r.perCrate * p.share) / 4
          n.perDay += amt
          n.premium!.exchanged += amt
          needs.set(-pr.id, n)
          continue
        }
        if (ps) {
          const direct = Math.ceil(ps.slot.qty / ps.best.value)
          const viaExchange = ps.slot.qty / 4
          const perCraft = Math.min(direct, viaExchange)
          const crafts = p.share / p.dish.cratesPerCook
          const n = needs.get(-ps.best.id) ?? { item: item(ps.best.id), source: 'farm' as Source, perDay: 0, fromNode: 0, premium: { direct: 0, exchanged: 0 } }
          n.perDay += crafts * perCraft
          if (viaExchange < direct) n.premium!.exchanged += crafts * perCraft
          else n.premium!.direct += crafts * perCraft
          needs.set(-ps.best.id, n)
          continue
        }
        const n = needs.get(r.id) ?? {
          item: item(r.id),
          source: r.source === 'node' ? ('farm' as Source) : r.source,
          perDay: 0,
          alts: r.alts,
          fromNode: r.source === 'node' ? (supply.get(r.id) ?? 0) : 0,
        }
        n.perDay += r.perCrate * p.share
        needs.set(r.id, n)
      }
    const ORDER: Source[] = ['self', 'farm', 'npc', 'market']
    return [...needs.values()].filter((n) => n.perDay >= 0.05).sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source) || b.perDay - a.perDay)
  }
  const needs = computeNeeds(plans).filter((n) => n.perDay >= 0.5)
  const alternatives = [...altDishes]
    .sort((a, b) => b.profit - a.profit)
    .map((d) => {
      const p = toPlan(d, false)
      return { plan: p, perCrate: computeNeeds([{ ...p, share: 1 }]) }
    })

  return {
    all,
    plans,
    quota: state.settings.quota,
    sustainable,
    delivered: plans.reduce((s, p) => s + p.share, 0),
    payoutPerDay: plans.reduce((s, p) => s + p.share * p.dish.payout, 0),
    gainPerDay: plans.reduce((s, p) => s + p.share * p.dish.profit, 0),
    clicksPerDay: plans.reduce((s, p) => s + p.share * p.dish.actionsPerCrate, 0),
    needs,
    growable: [...growable.values()],
    plotYield,
    premiumPerDay: needs.filter((n) => n.premium).reduce((s, n) => s + n.perDay, 0),
    alternatives,
    grown: new Set([...grow, ...premium]),
  }
}
export type FoodPlan = ReturnType<typeof buildFoodPlan>
