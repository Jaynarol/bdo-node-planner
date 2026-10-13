/**
 * อาหารส่งกล่องราชวัง — ประเมินทุกจาน (ระดับลือชื่อ/เซียน) ว่าได้เพิ่มเท่าไรต่อกล่องเทียบขายของดิบ
 * เงินต่อกล่อง (ยืนยันกับในเกม): ราคาฐานกล่อง × (ตัวคูณ NPC 250% + โบนัสความชำนาญ%)
 * ต้นทุนวัตถุดิบ = มูลค่าที่ขายได้ถ้าไม่เอามาทำ (ของ node = มูลค่าที่ใช้คิดรายได้ · ร้าน NPC = ราคาร้าน · ที่เหลือ = ตลาด)
 * ไล่สูตรย่อยลึก 2 ขั้น · ของแถม (rare) ที่ส่งกล่องได้ = ได้กล่องเพิ่มจากวัตถุดิบชุดเดิม
 */
import { slotOptions, type Game, type Ing, type Recipe } from './data'
import type { Spot } from './econ'
import type { AppState } from './state'

export const BOX_NAMES = ['ฝึกฝน', 'เชี่ยวชาญ', 'คล่องแคล่ว', 'ช่างฝีมือ', 'ลือชื่อ', 'เซียน']

export interface ImperialCfg {
  cookMastery: number
  alchMastery: number
  priceMultPct: number
  tiers: 'master' | 'guru' | 'both'
  overrides: Record<string, boolean>
}
export const imperialCfg = (s: AppState): ImperialCfg => ({
  cookMastery: s.settings.cookMastery,
  alchMastery: s.settings.alchMastery,
  priceMultPct: s.settings.priceMultPct,
  tiers: s.settings.imperialTiers,
  overrides: s.imperial.overrides,
})

const TIER_BOXES = { master: [4], guru: [5], both: [4, 5] }

export function masteryRow(game: Game, kind: 'cook' | 'alch', mastery: number) {
  const rows = game.imperial.mastery[kind]
  let row = rows[0]
  for (const r of rows) if (r[0] <= mastery) row = r
  return { maxProcPct: row[1], rareProcPct: row[2], bonusPct: row[3] }
}

export function crateValue(game: Game, box: number, cfg: ImperialCfg, kind: 'cook' | 'alch' = 'cook'): number {
  const m = masteryRow(game, kind, kind === 'cook' ? cfg.cookMastery : cfg.alchMastery)
  return game.imperial.boxBase[box] * (cfg.priceMultPct / 100 + m.bonusPct / 100)
}

/** จำนวนออกเฉลี่ย/ครั้ง — อาหาร/แปรธาตุ: โอกาสออกจำนวนสูงสุดตามความชำนาญ · แปรรูป: กลางช่วง */
function recipeYield(game: Game, r: Recipe, cfg: ImperialCfg): number {
  if (r.lifeskillType === 'processing' || r.maxProc <= r.minProc) return (r.minProc + r.maxProc) / 2
  const alch = r.lifeskillType === 'alchemy'
  const p = masteryRow(game, alch ? 'alch' : 'cook', alch ? cfg.alchMastery : cfg.cookMastery).maxProcPct / 100
  return p * r.maxProc + ((1 - p) * (r.minProc + r.maxProc - 1)) / 2
}

export type Source = 'node' | 'npc' | 'self' | 'farm' | 'market'
export const SOURCE_LABEL: Record<Source, string> = {
  node: '🌾 node',
  npc: '🏪 ร้าน NPC',
  self: '✋ เก็บเอง',
  farm: '🌱 ปลูก',
  market: '📈 ตลาด',
}
const SELF_RE = /^(นม|เนื้อ|เลือด)/

interface Ctx {
  game: Game
  cfg: ImperialCfg
  nodeItems: Set<number>
  nodePrice: Map<number, number>
  byProduct: Map<number, Recipe[]>
}

function baseSource(ctx: Ctx, id: number): { source: Source; price: number } | null {
  const m = ctx.game.meta[id]
  const it = ctx.game.item(id)
  if (ctx.nodeItems.has(id)) return { source: 'node', price: ctx.nodePrice.get(id) || it.price }
  if (m?.npc) return { source: 'npc', price: m.npc }
  if (!m?.craft && !m?.proc && SELF_RE.test(it.name)) return { source: 'self', price: it.price }
  if (m?.farm) return { source: 'farm', price: it.price }
  if (it.price > 0) return { source: 'market', price: it.price }
  return null
}

/** ค่าเริ่มต้นเอา/ไม่เอา: ตลาด = ไม่เอาถ้าสต็อก 0 หรือทำเองได้ · ที่เหลือเอา */
export function defaultEnabled(game: Game, source: Source, id: number): { on: boolean; why: string } {
  if (source !== 'market') return { on: true, why: '' }
  const m = game.meta[id]
  if (m?.craft || m?.proc) return { on: false, why: 'ทำเองได้ — ปิดซื้อไว้ก่อน' }
  if (game.item(id).stock <= 0) return { on: false, why: 'ตลาดสต็อก 0' }
  return { on: true, why: '' }
}

function isEnabled(ctx: Ctx, id: number, source: Source): boolean {
  return ctx.cfg.overrides[String(id)] ?? defaultEnabled(ctx.game, source, id).on
}

interface Acq {
  cost: number
  req: Map<number, number>
  actions: number
  crafts: Map<number, number>
  alts: Map<number, string[]>
}

const scale = (m: Map<number, number>, f: number) => new Map([...m].map(([k, v]) => [k, v * f]))

function makeAcquirer(ctx: Ctx) {
  const memo = new Map<string, Acq | null>()
  const acquire = (id: number, depth: number, stack: Set<number>): Acq | null => {
    const key = `${id}:${depth}`
    if (memo.has(key)) return memo.get(key)!
    let best: Acq | null = null
    const b = baseSource(ctx, id)
    if (b && b.price > 0 && isEnabled(ctx, id, b.source))
      best = { cost: b.price, req: new Map([[id, 1]]), actions: 0, crafts: new Map(), alts: new Map() }
    if (depth > 0 && !stack.has(id)) {
      stack.add(id)
      for (const r of ctx.byProduct.get(id) ?? []) {
        const v = evalRecipeInputs(r, depth - 1, stack)
        if (!v) continue
        const y = recipeYield(ctx.game, r, ctx.cfg)
        const crafts = scale(v.crafts, 1 / y)
        crafts.set(id, (crafts.get(id) ?? 0) + 1)
        const cand: Acq = { cost: v.cost / y, req: scale(v.req, 1 / y), actions: (1 + v.actions) / y, crafts, alts: v.alts }
        if (!best || cand.cost < best.cost) best = cand
      }
      stack.delete(id)
    }
    memo.set(key, best)
    return best
  }
  const evalRecipeInputs = (r: Recipe, depth: number, stack: Set<number>): Acq | null => {
    let cost = 0
    let actions = 0
    const req = new Map<number, number>()
    const crafts = new Map<number, number>()
    const alts = new Map<number, string[]>()
    for (const ing of r.ingredients) {
      let pick: { a: Acq; need: number; id: number } | null = null
      const options = slotOptions(ctx.game, ing)
      for (const o of options) {
        const a = acquire(o.id, depth, stack)
        if (a && (!pick || a.cost * o.need < pick.a.cost * pick.need)) pick = { a, need: o.need, id: o.id }
      }
      if (!pick) return null
      for (const [k, v] of pick.a.alts) alts.set(k, v)
      if (ing.type === 'group' && options.length > 1) {
        const names = options.map((o) => ctx.game.item(o.id).name)
        alts.set(pick.id, names)
        const raw = [...pick.a.req.keys()].filter((k) => baseSource(ctx, k)?.source !== 'npc')
        if (raw.length === 1 && raw[0] !== pick.id) alts.set(raw[0], names)
      }
      cost += pick.a.cost * pick.need
      actions += pick.a.actions * pick.need
      for (const [k, v] of pick.a.req) req.set(k, (req.get(k) ?? 0) + v * pick.need)
      for (const [k, v] of pick.a.crafts) crafts.set(k, (crafts.get(k) ?? 0) + v * pick.need)
    }
    return { cost, req, actions, crafts, alts }
  }
  return { acquire, evalRecipeInputs }
}

export interface DishReq {
  id: number
  name: string
  source: Source
  alts?: string[]
  farmable: boolean
  perCrate: number
  price: number
  stock: number
}
export interface DishEval {
  id: number
  name: string
  box: number
  amount: number
  payout: number
  cost: number
  profit: number
  actionsPerCrate: number
  req: DishReq[]
  subCrafts: { id: number; name: string; perCrate: number }[]
  slots: { options: { id: number; name: string; value: number }[]; qty: number }[]
  cratesPerCook: number
  blocked?: string
}

function buildCtx(game: Game, spots: Iterable<Spot>, cfg: ImperialCfg): Ctx {
  const nodeItems = new Set<number>()
  const nodePrice = new Map<number, number>()
  for (const s of spots)
    for (const it of s.items)
      if (!it.lucky) {
        nodeItems.add(it.id)
        if (it.price > 0) nodePrice.set(it.id, it.price)
      }
  const byProduct = new Map<number, Recipe[]>()
  for (const r of game.recipes)
    if (!/^imperial/.test(r.processingType ?? '')) byProduct.set(r.productItemId, [...(byProduct.get(r.productItemId) ?? []), r])
  return { game, cfg, nodeItems, nodePrice, byProduct }
}

const dishRecipes = (game: Game, cfg: ImperialCfg) =>
  game.recipes.filter((r) => {
    const c = game.imperial.crates[r.productItemId]
    return c && c.mode === 'cook' && r.lifeskillType === 'cooking' && TIER_BOXES[cfg.tiers].includes(c.box)
  })

/** ทุกจานที่ส่งกล่องได้ (ระดับที่เลือก) — รวมที่ไม่คุ้ม/ทำไม่ได้ ให้เห็นครบ */
export function evaluateDishes(game: Game, spots: Iterable<Spot>, cfg: ImperialCfg): DishEval[] {
  const ctx = buildCtx(game, spots, cfg)
  const { acquire, evalRecipeInputs } = makeAcquirer(ctx)
  const cookRow = masteryRow(game, 'cook', cfg.cookMastery)
  const out = new Map<number, DishEval>()
  for (const r of dishRecipes(game, cfg)) {
    const c = game.imperial.crates[r.productItemId]
    const name = game.item(r.productItemId).name
    const inp = evalRecipeInputs(r, 2, new Set([r.productItemId]))
    const payoutMain = crateValue(game, c.box, cfg)
    if (!inp) {
      if (!out.has(r.productItemId)) {
        const missing = r.ingredients
          .filter((ing: Ing) => slotOptions(game, ing).every((o) => !acquire(o.id, 2, new Set())))
          .map((ing) => slotOptions(game, ing).map((o) => game.item(o.id).name).slice(0, 3).join('/'))
        out.set(r.productItemId, {
          id: r.productItemId, name, box: c.box, amount: c.amount, payout: payoutMain, cost: 0, profit: 0,
          actionsPerCrate: 0, req: [], subCrafts: [], slots: [], cratesPerCook: 0, blocked: `ขาด: ${missing.join(', ') || 'วัตถุดิบ'}`,
        })
      }
      continue
    }
    const y = recipeYield(game, r, cfg)
    let cratesPerCook = y / c.amount
    let valuePerCook = cratesPerCook * payoutMain
    const rc = r.rareProc ? game.imperial.crates[r.rareProc.itemId] : undefined
    if (r.rareProc && rc && rc.mode === 'cook') {
      const ra = ((r.rareProc.minProc + r.rareProc.maxProc) / 2) * (cookRow.rareProcPct / 100)
      cratesPerCook += ra / rc.amount
      valuePerCook += (ra / rc.amount) * crateValue(game, rc.box, cfg)
    }
    const payout = valuePerCook / cratesPerCook
    const cost = inp.cost / cratesPerCook
    const ev: DishEval = {
      id: r.productItemId, name, box: c.box, amount: c.amount, payout, cost, profit: payout - cost,
      actionsPerCrate: (1 + inp.actions) / cratesPerCook,
      req: [...inp.req].map(([id, q]) => {
        const b = baseSource(ctx, id)!
        return {
          id, name: game.item(id).name, source: b.source, perCrate: q / cratesPerCook, price: b.price,
          stock: game.item(id).stock, alts: inp.alts.get(id), farmable: !!game.meta[id]?.farm,
        }
      }),
      subCrafts: [...inp.crafts].map(([id, q]) => ({ id, name: game.item(id).name, perCrate: q / cratesPerCook })),
      slots: r.ingredients.map((ing) => ({
        qty: ing.quantity,
        options:
          ing.type === 'item'
            ? [{ id: ing.itemId, name: game.item(ing.itemId).name, value: 1 }]
            : (game.groups.get(ing.groupId) ?? []).map((g) => ({ id: g.itemId, name: game.item(g.itemId).name, value: g.value || 1 })),
      })),
      cratesPerCook,
    }
    const cur = out.get(r.productItemId)
    if (!cur || cur.blocked || ev.profit > cur.profit) out.set(r.productItemId, ev)
  }
  return [...out.values()].sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.profit - a.profit)
}

export interface IngredientRow {
  id: number
  name: string
  source: Source
  price: number
  stock: number
  enabled: boolean
  defaultOn: boolean
  defaultWhy: string
  usedBy: string[]
}

/** วัตถุดิบตั้งต้นทุกตัวที่อาหารกล่องใช้ได้ (ไล่ลง 2 ขั้น) — ให้ผู้ใช้ติ๊กเอา/ไม่เอา */
export function listIngredients(game: Game, spots: Iterable<Spot>, cfg: ImperialCfg): IngredientRow[] {
  const ctx = buildCtx(game, spots, cfg)
  const usedBy = new Map<number, Set<string>>()
  const walk = (id: number, depth: number, dish: string, stack: Set<number>) => {
    if (baseSource(ctx, id)) usedBy.set(id, (usedBy.get(id) ?? new Set()).add(dish))
    if (depth <= 0 || stack.has(id)) return
    stack.add(id)
    for (const r of ctx.byProduct.get(id) ?? []) for (const ing of r.ingredients) for (const o of slotOptions(game, ing)) walk(o.id, depth - 1, dish, stack)
    stack.delete(id)
  }
  for (const r of dishRecipes(game, cfg)) {
    const dish = game.item(r.productItemId).name
    for (const ing of r.ingredients) for (const o of slotOptions(game, ing)) walk(o.id, 2, dish, new Set([r.productItemId]))
  }
  return [...usedBy]
    .map(([id, dishes]) => {
      const b = baseSource(ctx, id)!
      const def = defaultEnabled(game, b.source, id)
      return {
        id, name: game.item(id).name, source: b.source, price: b.price, stock: game.item(id).stock,
        enabled: isEnabled(ctx, id, b.source), defaultOn: def.on, defaultWhy: def.why, usedBy: [...dishes],
      }
    })
    .sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name, 'th'))
}
