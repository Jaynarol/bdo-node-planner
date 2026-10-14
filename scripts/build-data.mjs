/**
 * รวมข้อมูลเกมจาก data-src/ เป็นไฟล์เดียว public/data/game.json (เว็บโหลดตอนเปิด)
 * + data-src/market-ids.json = ไอเทมที่เว็บใช้ราคา (ให้ sync:market ตัดตลาดเหลือเท่านี้)
 * รันใหม่เมื่อแก้ไฟล์ใน data-src/ เท่านั้น — ราคาตลาดแยกไปที่ sync:market
 */
import fs from 'node:fs'

const read = (f) => JSON.parse(fs.readFileSync(`data-src/${f}`, 'utf8'))
const nodesRaw = read('nodes.json').nodes
const drops = read('plantzone_drops.json')
const distances = read('distances_tk2pzk.json')
const exploration = read('exploration.json')
const recipes = read('recipes.json')
const groups = read('material-groups.json')
const imperial = read('imperial.json')
const meta = read('ingredients-meta.json')
const extra = read('item-names-extra.json')

// เมืองที่จ้างคนงานได้ (ตัดเมืองไม่มี NPC คนงาน เช่น หมู่บ้านเบล์รันดีล)
const regionTown = new Map()
const workerTowns = []
for (const [wk, e] of Object.entries(exploration))
  if (e.is_warehouse_town && e.is_worker_npc_town) {
    regionTown.set(e.region_key, Number(wk))
    workerTowns.push(Number(wk))
  }

// pzk → เมืองมีคนงาน 12 ใกล้สุด [townId, dist]
const towns = {}
for (const [rk, list] of Object.entries(distances)) {
  const t = regionTown.get(Number(rk))
  if (!t) continue
  for (const [pzk, dist] of Object.values(list)) (towns[pzk] ??= []).push([t, Math.round(dist)])
}
for (const k of Object.keys(towns)) towns[k] = towns[k].sort((a, b) => a[1] - b[1]).slice(0, 12)

const pzIds = new Set(Object.keys(drops).map(Number))
const nodes = nodesRaw
  .filter((n) => n.main || pzIds.has(n.id))
  .map((n) => ({ id: n.id, name: n.nameTh, cp: n.cp, x: n.x, y: n.y, kind: n.kind, main: n.main, conn: n.connections }))

// แก้สูตรที่ข้อมูลต้นทางผิด (ยืนยันจากในเกมแล้วเท่านั้น) — ดู data-src/recipe-fixes.json
const fixes = read('recipe-fixes.json')
const cleanRecipes = recipes.map(({ xp, ...r }) => {
  const f = fixes[r.productItemId]
  return f ? { ...r, minProc: f.minProc ?? r.minProc, maxProc: f.maxProc ?? r.maxProc } : r
})

const game = { builtAt: new Date().toISOString(), nodes, workerTowns, towns, drops, recipes: cleanRecipes, groups, imperial, meta, extra }
fs.mkdirSync('public/data', { recursive: true })
fs.writeFileSync('public/data/game.json', JSON.stringify(game))

const ids = new Set()
for (const d of Object.values(drops)) for (const b of [d.unlucky, d.lucky]) for (const id of Object.keys(b ?? {})) ids.add(Number(id))
for (const r of recipes) {
  ids.add(r.productItemId)
  if (r.rareProc?.itemId) ids.add(r.rareProc.itemId)
  for (const i of r.ingredients) if (i.type === 'item') ids.add(i.itemId)
}
for (const g of groups) for (const i of g.items) ids.add(i.itemId)
for (const id of Object.keys(imperial.crates)) ids.add(Number(id))
for (const id of Object.keys(meta)) ids.add(Number(id))
fs.writeFileSync('data-src/market-ids.json', JSON.stringify([...ids].sort((a, b) => a - b)))
console.log(`game.json: ${nodes.length} nodes · ${Object.keys(drops).length} จุดผลผลิต · ${(fs.statSync('public/data/game.json').size / 1024).toFixed(0)} KB · market ids ${ids.size}`)
