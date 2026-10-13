/**
 * มูลค่าของจาก node อัตโนมัติ = แปรรูปคุ้มสุด ไม่งั้นขายดิบ
 * ห่วงโซ่แปรรูปลึกสุด 3 ขั้น (ไม้ซุง → ไม้กระดาน → ไม้อัด · แร่ → ชิ้นส่วนละลาย → แท่ง)
 * เชื่อเฉพาะปลายทางที่ขายได้จริง (ยอด 14 วัน ≥ 5000) และรู้ราคาวัตถุดิบร่วมครบ · วัตถุดิบร่วมคิดราคาตลาด (สมมุติซื้อ)
 * ⚠ ห้าม iterate แบบ fix-point (สูตรวน + ตัวคูณทบชั้นเคยระเบิด) — จำกัดความลึก + กันวนในเส้นทาง
 * ไม่หักภาษี · ของโชคไม่นับ
 */
import type { Game, Recipe } from './data'

const MIN_VOLUME = 5000
const MAX_DEPTH = 3

export interface ItemValue {
  price: number
  /** ป้ายที่มาของมูลค่า เช่น "แปรรูป: ไม้อัด" (null = ขายดิบ) */
  label: string | null
  /** เส้นทางแปรรูป เช่น "ไม้กระดาน → ไม้อัด" */
  path?: string
}

export function computeValues(game: Game, ids: Iterable<number>): Map<number, ItemValue> {
  const recipes = game.recipes.filter((r) => r.lifeskillType === 'processing' && !/^imperial/.test(r.processingType ?? ''))
  const byIng = new Map<number, Recipe[]>()
  for (const r of recipes)
    for (const ing of r.ingredients) if (ing.type === 'item') byIng.set(ing.itemId, [...(byIng.get(ing.itemId) ?? []), r])

  const price = (id: number) => game.item(id).price
  const groupCost = (groupId: number) => {
    let best = Infinity
    for (const it of game.groups.get(groupId) ?? []) {
      const p = price(it.itemId)
      if (p > 0) best = Math.min(best, p / Math.max(it.value, 1))
    }
    return best === Infinity ? 0 : best
  }
  const avgYield = (r: Recipe) => (r.minProc + r.maxProc) / 2
  const outputValue = (r: Recipe) => {
    let v = price(r.productItemId) * avgYield(r)
    if (r.rareProc?.procChance && r.rareProc.itemId)
      v += price(r.rareProc.itemId) * ((r.rareProc.minProc + r.rareProc.maxProc) / 2) * r.rareProc.procChance
    return v
  }

  const evalChain = (itemId: number, chain: Recipe[]): number | null => {
    let carry = itemId
    const hops: { r: Recipe; qty: number; other: number }[] = []
    for (const r of chain) {
      const ing = r.ingredients.find((x) => x.type === 'item' && x.itemId === carry) as { itemId: number; quantity: number } | undefined
      if (!ing) return null
      let other = 0
      for (const x of r.ingredients) {
        if (x.type === 'item') {
          if (x.itemId === carry) continue
          const p = price(x.itemId)
          if (!p) return null
          other += p * x.quantity
        } else {
          const c = groupCost(x.groupId)
          if (c <= 0) return null
          other += c * x.quantity
        }
      }
      hops.push({ r, qty: ing.quantity, other })
      carry = r.productItemId
    }
    let value = 0
    for (let i = hops.length - 1; i >= 0; i--) {
      const out = i === hops.length - 1 ? outputValue(hops[i].r) : value * avgYield(hops[i].r)
      value = (out - hops[i].other) / hops[i].qty
    }
    return value
  }

  const out = new Map<number, ItemValue>()
  for (const id of ids) {
    let best: ItemValue = { price: price(id), label: null }
    const walk = (cur: number, chain: Recipe[], seen: Set<number>) => {
      if (chain.length >= MAX_DEPTH) return
      for (const r of byIng.get(cur) ?? []) {
        if (seen.has(r.productItemId)) continue
        const next = [...chain, r]
        const term = game.item(r.productItemId)
        if (term.vol14 >= MIN_VOLUME) {
          const v = evalChain(id, next)
          if (v !== null && v > best.price)
            best = { price: v, label: `แปรรูป: ${term.name}`, path: next.map((x) => game.item(x.productItemId).name).join(' → ') }
        }
        walk(r.productItemId, next, new Set([...seen, r.productItemId]))
      }
    }
    walk(id, [], new Set([id]))
    out.set(id, best)
  }
  return out
}
