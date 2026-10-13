/**
 * ตีค่าของจาก node แบบขั้นบันได (เมื่อเปิดสวิตช์ "นับมูลค่าราชวัง/แปรธาตุ"):
 *   ขั้นที่มูลค่าสูงสุดก่อนจนเต็มเพดาน → ส่วนที่เกินไหลไปขั้นถัดไป → สุดท้าย = แปรรูปคุ้มสุด/ขายดิบ
 *   ราชวัง (จานที่เลือกทำ ไม่นับที่พักไว้): มูลค่า/ชิ้น = (เงินกล่อง − วัตถุดิบอื่น) ÷ ชิ้นที่ใช้ต่อกล่อง
 *     เพดาน = ชิ้นต่อกล่อง × โควต้าที่แบ่งให้จานนั้น · ของที่ผู้ใช้ปลูกเองอยู่แล้วไม่ได้มูลค่านี้ (node ไม่ได้ช่วยเพิ่มกล่อง)
 *   แปรธาตุที่เลือกทำ: แบ่งกำไรตามสัดส่วนราคาวัตถุดิบ · ไม่จำกัดตามตลาด (ผู้ใช้: ทยอยขายได้)
 * ราคาเฉลี่ยถ่วงตามจำนวนที่แผนผลิตได้ · ของที่แผนยังไม่ผลิต = มูลค่าขั้นสูงสุด
 */
import type { Produced } from './app'
import { buildAlchemy } from './alchemy'
import type { Game } from './data'
import type { Spot } from './econ'
import { evaluateDishes, imperialCfg } from './imperial'
import type { AppState } from './state'
import type { ItemValue } from './value'

interface Tier {
  value: number
  cap: number
  label: string
}

export function computeTierPrices(
  game: Game,
  state: AppState,
  spots: Map<number, Spot>,
  produced: Map<number, Produced>,
  base: Map<number, ItemValue>,
): Map<number, { price: number; label: string }> {
  const tiers = new Map<number, Tier[]>()
  const add = (id: number, t: Tier) => tiers.set(id, [...(tiers.get(id) ?? []), t])

  const active = state.imperial.chosen.filter((c) => !c.standby)
  if (active.length) {
    const ids = new Set(active.map((c) => c.id))
    const grown = new Set([...state.imperial.growOwn, ...state.imperial.growPremium])
    const dishes = evaluateDishes(game, spots.values(), imperialCfg(state)).filter((d) => ids.has(d.id) && !d.blocked)
    const share = state.settings.quota / Math.max(dishes.length, 1)
    for (const d of dishes)
      for (const r of d.req) {
        if (r.source !== 'node' || grown.has(r.id)) continue
        const others = d.cost - r.perCrate * r.price
        add(r.id, { value: (d.payout - others) / r.perCrate, cap: r.perCrate * share, label: `ราชวัง: ${d.name}` })
      }
  }

  if (state.alchemy.chosen.length)
    for (const a of buildAlchemy(game, spots, produced, state.alchemy.chosen).filter((x) => x.chosen)) {
      const multi = a.nodeValue.length > 1
      for (const v of a.nodeValue) {
        const q = a.inputs.find((i) => i.item.id === v.id)?.qty ?? 0
        const cap = multi && Number.isFinite(a.craftsPerDay) && a.craftsPerDay > 0 ? a.craftsPerDay * q : Infinity
        add(v.id, { value: v.value, cap, label: `แปรธาตุ: ${a.product.name}` })
      }
    }

  const out = new Map<number, { price: number; label: string }>()
  for (const [id, list] of tiers) {
    const fallback = base.get(id)?.price ?? game.item(id).price
    const sorted = list.filter((t) => t.value > fallback).sort((a, b) => b.value - a.value)
    if (!sorted.length) continue
    const S = produced.get(id)?.perDay ?? 0
    if (S <= 0) {
      out.set(id, { price: sorted[0].value, label: sorted[0].label })
      continue
    }
    let left = S
    let total = 0
    const used: string[] = []
    for (const t of sorted) {
      if (left <= 0) break
      const q = Math.min(left, t.cap)
      total += q * t.value
      left -= q
      if (q > 0) used.push(t.label)
    }
    total += Math.max(left, 0) * fallback
    const pct = Math.round(((S - Math.max(left, 0)) / S) * 100)
    out.set(id, { price: total / S, label: used.join(' + ') + (pct < 100 ? ` (${pct}% · ที่เหลือแปรรูป/ขาย)` : '') })
  }
  return out
}
