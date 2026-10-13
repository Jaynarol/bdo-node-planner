/**
 * อัปเดตราคาตลาด ASIA จาก bdolytics → public/data/market.json
 * ใช้: npm run sync:market   (แล้ว commit + npm run deploy)
 *     npm run sync:market -- --from <ไฟล์ market-asia.json เดิม>   (แปลงจากไฟล์ที่มีอยู่ ไม่ต้องดึงเน็ต)
 * price = ราคาเริ่มต้นในเกม · stock = ของในตลาดตอนดึง · vol = ยอดซื้อขาย 14 วัน
 * เก็บเฉพาะไอเทมที่เว็บใช้ (data-src/market-ids.json) + ของเกรด "ชั้นหนึ่ง" (ใช้หาเกรดสูงจากชื่อ)
 */
import fs from 'node:fs'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
async function fetchLang(language) {
  const input = encodeURIComponent(JSON.stringify({ language, region: 'ASIA' }))
  const res = await fetch(`https://bdolytics.com/api/trpc/market.getMarket?input=${input}`, { headers: UA })
  if (!res.ok) throw new Error(`bdolytics ${language}: HTTP ${res.status}`)
  return (await res.json()).result.data
}

let items // id → {nameTh, price, inStock, volume}
let fetchedAt
const fromIdx = process.argv.indexOf('--from')
if (fromIdx > 0) {
  const raw = JSON.parse(fs.readFileSync(process.argv[fromIdx + 1], 'utf8'))
  items = raw.items
  fetchedAt = raw.fetchedAt
} else {
  console.log('ดึงราคาจาก bdolytics (ASIA)…')
  const [en, th] = await Promise.all([fetchLang('en'), fetchLang('th')])
  const thById = new Map(th.map((i) => [i.itemId, i]))
  items = {}
  for (const i of en)
    items[i.itemId] = { nameTh: thById.get(i.itemId)?.name ?? i.name, price: i.price, inStock: i.inStock, volume: i.fourteenDayVolume }
  fetchedAt = new Date().toISOString()
}

const keep = new Set(JSON.parse(fs.readFileSync('data-src/market-ids.json', 'utf8')))
const out = {}
for (const [id, it] of Object.entries(items))
  if (keep.has(Number(id)) || /ชั้นหนึ่ง$/.test(it.nameTh)) out[id] = [it.nameTh, it.price, it.inStock, it.volume]
fs.writeFileSync('public/data/market.json', JSON.stringify({ fetchedAt, items: out }))
console.log(`market.json: ${Object.keys(out).length} ไอเทม · ราคา ณ ${fetchedAt}`)
