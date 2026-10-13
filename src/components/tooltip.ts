/**
 * HTML ของ tooltip บนแผนที่: node + ทุกจุดผลผลิต พร้อมไอคอน/ชื่อของที่ได้ (ไม่ใช่แค่ "ขุดแร่" — ผู้ใช้อ่านไม่ออกว่าได้อะไร)
 * ของหลัก = จำนวน/วัน · ของโชค = ✦ จาง (ไม่นับ)
 */
import type { Game } from '@/lib/data'
import type { Spot } from '@/lib/econ'
import { fmt, qty } from './ui'

const icon = (id: number, size = 18) =>
  `<img src="https://s1.pearlcdn.com/KR/TradeMarket/Common/img/BDO/item/${id}.png" width="${size}" height="${size}" style="display:inline-block;vertical-align:middle;border-radius:3px;background:#171717;margin-right:4px" onerror="this.style.visibility='hidden'"/>`

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

export function nodeTooltip(game: Game, nodeId: number, spots: { spot: Spot; inPlan: boolean }[], highlight?: number): string {
  const n = game.node.get(nodeId)
  if (!n) return ''
  const base = game.baseIds.has(nodeId) ? (game.workerTownIds.has(nodeId) ? ' (เมืองฟรี)' : ' (ฐานฟรี · ไม่มีคนงาน — ต้องส่งจากเมืองอื่น)') : ''
  let html = `<div style="font-size:12px;line-height:1.35"><b>${esc(n.name)}</b> · ${n.cp} CP${base}`
  for (const { spot: s, inPlan } of spots) {
    html += `<div style="margin-top:4px;padding-top:3px;border-top:1px solid #3a3a3a">`
    html += `<b style="color:${inPlan ? '#ffb020' : '#e5e5e5'}">${inPlan ? '⭐ ' : ''}${esc(s.name)}</b> <span style="color:#9aa4ad">${s.cp} CP`
    html += s.dataMissing ? ' · ⚠ ไม่มีข้อมูลดรอป' : ` · ${fmt(s.income)}/วัน`
    html += `</span>`
    for (const it of s.items) {
      if (it.lucky) continue
      const perDay = (s.sp.giant ? it.qtyGi : it.qty) * s.cyclesDaily
      const hl = highlight === it.id ? 'color:#7dd3fc;font-weight:600' : ''
      html += `<div style="${hl}">${icon(it.id)}${esc(it.name)}${s.dataMissing ? '' : ` <span style="color:#9aa4ad">${qty(perDay)}/วัน</span>`}</div>`
    }
    const lucky = s.items.filter((i) => i.lucky)
    if (lucky.length)
      html += `<div style="color:#737373;font-size:10px">✦ ${lucky.map((i) => esc(i.name)).join(', ')}</div>`
    html += `</div>`
  }
  return html + '</div>'
}
