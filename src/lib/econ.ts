/**
 * รายได้ต่อวันของจุดผลผลิต (สูตรเดียวกับ workerman):
 *   เดิน   = 2 × ระยะ ÷ เร็วเดิน ÷ 60 (นาที)
 *   ทำงาน  = ceil(2 × workload ÷ เร็วงาน) × 10 (นาที)
 *   รอบ/วัน = 1440 ÷ (ทำงาน + เดิน)
 * ของโชคไม่นับทั้งสิ้น (โชว์กำกับ ✦ อย่างเดียว) · ไม่หักภาษี
 * คนยักษ์ได้ของหลักเพิ่มตามข้อมูล unlucky_gi · ระบบเทียบ Goblin/ยักษ์แล้วเลือกสายที่ดีกว่าให้ (ล็อกเองได้)
 */
import type { Game } from './data'
import type { Pick, WorkerChoice, WorkerProfiles } from './state'
import type { ItemValue } from './value'

export interface Speeds {
  wspd: number
  mspd: number
  giant: boolean
}

export interface PzItem {
  id: number
  name: string
  qty: number
  qtyGi: number
  lucky: boolean
  /** มูลค่าที่ใช้คิด (แปรรูปคุ้มสุด/ราชวัง/แปรธาตุ/ดิบ) */
  price: number
  rawPrice: number
  label: string | null
}

export interface Spot {
  pzk: number
  name: string
  parentId: number
  parentName: string
  cp: number
  workload: number
  items: PzItem[]
  /** เมืองมีคนงาน เรียงใกล้ → ไกล */
  towns: { townId: number; dist: number }[]
  /** เมืองที่คนงานมาจริง (ตามเส้นที่เชื่อม — ก่อนเชื่อม = ใกล้สุดตามระยะ) */
  townId: number
  dist: number
  worker: WorkerChoice
  recommended: WorkerChoice
  locked: boolean
  sp: Speeds
  cyclesDaily: number
  income: number
  incomeGoblin: number
  incomeGiant: number
  /** ชุดข้อมูลยังไม่มีอัตราดรอปจุดนี้ (รู้แค่ชนิดของ) — รายได้เป็น 0 และระบบไม่เลือกให้อัตโนมัติ */
  dataMissing: boolean
}

export function cyclesDaily(workload: number, dist: number, sp: Speeds): number {
  const move = (2 * dist) / sp.mspd / 60
  const work = Math.ceil((2 * workload) / sp.wspd) * 10
  return 1440 / (work + move)
}

export function spFor(profiles: WorkerProfiles, choice: WorkerChoice, ov?: Pick): Speeds {
  const b = profiles[choice]
  return { wspd: ov?.wspd ?? b.wspd, mspd: ov?.mspd ?? b.mspd, giant: choice === 'giant' }
}

const valuePerCycle = (items: PzItem[], giant: boolean) =>
  items.reduce((s, i) => (i.lucky ? s : s + (giant ? i.qtyGi : i.qty) * i.price), 0)

/** คิดคนงาน/รอบ/รายได้ของจุดใหม่ที่ระยะ dist (เมืองเปลี่ยน → ระยะเปลี่ยน) */
export function withTown(s: Omit<Spot, 'worker' | 'recommended' | 'locked' | 'sp' | 'cyclesDaily' | 'income' | 'incomeGoblin' | 'incomeGiant'>, profiles: WorkerProfiles, ov?: Pick): Spot {
  const inc = (sp: Speeds) => cyclesDaily(s.workload, s.dist, sp) * valuePerCycle(s.items, sp.giant)
  const incomeGoblin = inc(spFor(profiles, 'goblin'))
  const incomeGiant = inc(spFor(profiles, 'giant'))
  const recommended: WorkerChoice = incomeGiant > incomeGoblin ? 'giant' : 'goblin'
  const worker = ov?.worker ?? recommended
  const sp = spFor(profiles, worker, ov)
  return {
    ...s,
    worker,
    recommended,
    locked: ov?.worker !== undefined,
    sp,
    cyclesDaily: cyclesDaily(s.workload, s.dist, sp),
    income: inc(sp),
    incomeGoblin,
    incomeGiant,
  }
}

export function relocate(s: Spot, town: { townId: number; dist: number }, profiles: WorkerProfiles, ov?: Pick): Spot {
  if (town.townId === s.townId && town.dist === s.dist) return s
  return withTown({ ...s, townId: town.townId, dist: town.dist }, profiles, ov)
}

/** จำนวนของหลักชิ้นนี้ต่อวันที่จุดนี้ (ตามสายคนงานที่ใช้) */
export function itemPerDay(s: Spot, itemId: number): number {
  const it = s.items.find((i) => i.id === itemId && !i.lucky)
  return it ? (s.sp.giant ? it.qtyGi : it.qty) * s.cyclesDaily : 0
}

export function computeSpots(
  game: Game,
  values: Map<number, ItemValue>,
  profiles: WorkerProfiles,
  picks: Map<number, Pick>,
): Spot[] {
  const out: Spot[] = []
  for (const [pzk, drop] of game.drops) {
    const node = game.node.get(pzk)
    const parentId = game.parentOf(pzk)
    const parent = parentId ? game.node.get(parentId) : undefined
    if (!node || !parent) continue
    const mk = (bunch: Record<string, number> | undefined, lucky: boolean, gi?: Record<string, number>): PzItem[] =>
      Object.entries(bunch ?? {}).map(([idS, qty]) => {
        const id = Number(idS)
        const it = game.item(id)
        const v = values.get(id)
        return {
          id,
          name: it.name,
          qty,
          qtyGi: gi?.[idS] ?? qty,
          lucky,
          price: lucky ? it.price : (v?.price ?? it.price),
          rawPrice: it.price,
          label: lucky ? null : (v?.label ?? null),
        }
      })
    const items = [...mk(drop.unlucky, false, drop.unlucky_gi), ...mk(drop.lucky, true)]
    const main = items.filter((i) => !i.lucky)
    const towns = game.towns.get(pzk) ?? []
    out.push(
      withTown(
        {
          pzk,
          name: node.name,
          parentId: parent.id,
          parentName: parent.name,
          cp: node.cp,
          workload: drop.workload,
          items,
          towns,
          townId: towns[0]?.townId ?? 0,
          dist: towns[0]?.dist ?? 0,
          dataMissing: main.length > 0 && main.every((i) => i.qty === 0),
        },
        profiles,
        picks.get(pzk),
      ),
    )
  }
  return out
}
