/**
 * แปรธาตุจากของ node — สูตรที่มีวัตถุดิบจาก node และมีกำไร (ขายผลผลิต − วัตถุดิบทุกตัวตามราคาตลาด/NPC)
 * ทำได้กี่ครั้ง/วัน = จากของที่จุดในแผนผลิต (ตัวที่น้อยสุดเป็นคอขวด) · จำนวนออก = กลางช่วงของสูตร
 * ⭐ เลือกทำ → ของ node ในสูตรได้ตีค่าตามมูลค่าแปรธาตุ (เมื่อเปิดสวิตช์ในตั้งค่า)
 */
import type { Produced } from './app'
import { slotOptions, type Game, type Item } from './data'
import type { Spot } from './econ'

export type InputSource = 'node' | 'npc' | 'market' | 'craft'
export interface AlchemyInput {
  item: Item
  qty: number
  source: InputSource
  unit: number
  /** แผนผลิตได้ต่อวัน */
  supply: number
  hard: boolean
}
export interface AlchemyRow {
  id: number
  product: Item
  yieldAvg: number
  profit: number
  craftsPerDay: number
  limitBy?: Item
  inputs: AlchemyInput[]
  nodeValue: { id: number; value: number }[]
  chosen: boolean
  available: boolean
}

export function buildAlchemy(game: Game, spots: Map<number, Spot>, produced: Map<number, Produced>, chosenIds: number[]): AlchemyRow[] {
  const nodeItems = new Set<number>()
  for (const s of spots.values()) for (const i of s.items) if (!i.lucky) nodeItems.add(i.id)
  const supply = (id: number) => produced.get(id)?.perDay ?? 0
  const chosen = new Set(chosenIds)
  const makeable = new Set(game.recipes.filter((r) => !/^imperial/.test(r.processingType ?? '')).map((r) => r.productItemId))

  const best = new Map<number, AlchemyRow>()
  for (const r of game.recipes) {
    if (r.lifeskillType !== 'alchemy') continue
    const product = game.item(r.productItemId)
    if (!product.price) continue
    const inputs: AlchemyInput[] = []
    let ok = true
    for (const ing of r.ingredients) {
      const os = slotOptions(game, ing)
      const own = os.find((o) => nodeItems.has(o.id) && supply(o.id) > 0) ?? os.find((o) => nodeItems.has(o.id))
      if (own) {
        const it = game.item(own.id)
        inputs.push({ item: it, qty: own.need, source: 'node', unit: it.price, supply: supply(own.id), hard: false })
        continue
      }
      const c = os
        .map((o) => {
          const it = game.item(o.id)
          const npc = game.meta[o.id]?.npc ?? 0
          return { o, it, npc, unit: npc || it.price }
        })
        .filter((x) => x.unit > 0)
        .sort((a, b) => a.unit * a.o.need - b.unit * b.o.need)[0]
      if (!c) {
        ok = false
        break
      }
      const source: InputSource = c.npc ? 'npc' : makeable.has(c.o.id) ? 'craft' : 'market'
      inputs.push({ item: c.it, qty: c.o.need, source, unit: c.unit, supply: 0, hard: source === 'market' && c.it.stock === 0 })
    }
    const nodeIns = inputs.filter((i) => i.source === 'node')
    if (!ok || !nodeIns.length) continue
    const yieldAvg = (r.minProc + r.maxProc) / 2
    const profit = yieldAvg * product.price - inputs.reduce((s, i) => s + i.unit * i.qty, 0)
    let craftsPerDay = Infinity
    let limitBy: Item | undefined
    for (const i of nodeIns) {
      const c = i.supply / i.qty
      if (c < craftsPerDay) {
        craftsPerDay = c
        limitBy = i.item
      }
    }
    const nodeMarket = nodeIns.reduce((s, i) => s + i.unit * i.qty, 0) || 1
    const row: AlchemyRow = {
      id: r.productItemId,
      product,
      yieldAvg,
      profit,
      craftsPerDay,
      limitBy,
      inputs,
      nodeValue: nodeIns.map((i) => ({ id: i.item.id, value: i.unit + (profit * ((i.unit * i.qty) / nodeMarket)) / i.qty })),
      chosen: chosen.has(r.productItemId),
      available: !inputs.some((i) => i.hard),
    }
    const cur = best.get(r.productItemId)
    if (!cur || row.profit > cur.profit) best.set(r.productItemId, row)
  }
  return [...best.values()]
    .filter((r) => r.profit > 0)
    .sort(
      (a, b) =>
        Number(b.chosen) - Number(a.chosen) ||
        Number(b.available) - Number(a.available) ||
        Number(b.product.vol14 / 14 >= 50) - Number(a.product.vol14 / 14 >= 50) ||
        b.profit * Math.min(b.craftsPerDay || 0, 1e6) - a.profit * Math.min(a.craftsPerDay || 0, 1e6) ||
        b.profit - a.profit,
    )
}
