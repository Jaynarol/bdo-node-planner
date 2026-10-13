/**
 * ข้อมูลเกม (public/data/game.json — สร้างจาก npm run build:data) + ราคาตลาด (public/data/market.json — npm run sync:market)
 * โหลดครั้งเดียวตอนเปิดเว็บ แล้วสร้างดัชนีที่ทุกส่วนใช้ร่วมกัน
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export type Ing = { type: 'item'; itemId: number; quantity: number } | { type: 'group'; groupId: number; quantity: number }
export interface Recipe {
  recipeKey: string
  productItemId: number
  processingType?: string
  lifeskillType: 'processing' | 'cooking' | 'alchemy'
  minProc: number
  maxProc: number
  processingTime?: number
  rareProc?: { itemId: number; minProc: number; maxProc: number; procChance: number | null } | null
  ingredients: Ing[]
}
export interface Drop {
  workload: number
  rolls: number
  unlucky?: Record<string, number>
  lucky?: Record<string, number>
  unlucky_gi?: Record<string, number>
}
export interface GameNode {
  id: number
  name: string
  cp: number
  x: number
  y: number
  kind: number
  main: boolean
  conn: number[]
}
export interface ImperialData {
  boxBase: number[]
  mastery: { cook: number[][]; alch: number[][] }
  crates: Record<string, { amount: number; box: number; mode: 'cook' | 'alch' }>
}
export interface IngredientMeta {
  name: string
  npc: number | null
  farm: boolean
  craft: boolean
  proc: boolean
}

interface GameFile {
  builtAt: string
  nodes: GameNode[]
  workerTowns: number[]
  towns: Record<string, [number, number][]>
  drops: Record<string, Drop>
  recipes: Recipe[]
  groups: { groupId: number; items: { itemId: number; value: number }[] }[]
  imperial: ImperialData
  meta: Record<string, IngredientMeta>
  extra: Record<string, { nameTh: string; nameEn: string }>
}
interface MarketFile {
  fetchedAt: string
  /** id → [ชื่อไทย, ราคา, ของในตลาด, ยอดขาย 14 วัน] */
  items: Record<string, [string, number, number, number]>
}

export interface Item {
  id: number
  name: string
  price: number
  stock: number
  vol14: number
}

export interface Game {
  builtAt: string
  marketAt: string
  nodes: GameNode[]
  node: Map<number, GameNode>
  /** node หลักบนแผนที่ (เชื่อมเส้นได้) */
  mainNodes: GameNode[]
  /** เมือง/หมู่บ้านฟรี (cp 0 kind 1/2) — โซนทะเล cp 0 ไม่นับ */
  baseIds: Set<number>
  workerTownIds: Set<number>
  /** pzk → เมืองมีคนงาน เรียงใกล้ → ไกล */
  towns: Map<number, { townId: number; dist: number }[]>
  drops: Map<number, Drop>
  /** node หลัก → จุดผลผลิตลูก */
  pzByParent: Map<number, number[]>
  parentOf: (pzk: number) => number | undefined
  recipes: Recipe[]
  groups: Map<number, { itemId: number; value: number }[]>
  imperial: ImperialData
  meta: Record<string, IngredientMeta>
  item: (id: number) => Item
  /** ชื่อไทย → id (ใช้หาของเกรดชั้นหนึ่งจากชื่อ) */
  idByName: Map<string, number>
}

let cache: Promise<Game> | null = null

export function loadGame(): Promise<Game> {
  cache ??= (async () => {
    const [g, m] = await Promise.all([
      fetch(`${BASE_PATH}/data/game.json`).then((r) => r.json() as Promise<GameFile>),
      fetch(`${BASE_PATH}/data/market.json`).then((r) => r.json() as Promise<MarketFile>),
    ])
    return buildGame(g, m)
  })()
  return cache
}

function buildGame(g: GameFile, m: MarketFile): Game {
  const node = new Map(g.nodes.map((n) => [n.id, n]))
  const mainNodes = g.nodes.filter((n) => n.main)
  const parentOf = (pzk: number) => node.get(pzk)?.conn[0]
  const pzByParent = new Map<number, number[]>()
  for (const k of Object.keys(g.drops)) {
    const p = parentOf(Number(k))
    if (p) pzByParent.set(p, [...(pzByParent.get(p) ?? []), Number(k)])
  }
  const itemCache = new Map<number, Item>()
  const item = (id: number): Item => {
    let it = itemCache.get(id)
    if (!it) {
      const mk = m.items[id]
      it = {
        id,
        name: mk?.[0] ?? g.meta[id]?.name ?? g.extra[id]?.nameTh ?? `#${id}`,
        price: mk?.[1] ?? 0,
        stock: mk?.[2] ?? 0,
        vol14: mk?.[3] ?? 0,
      }
      itemCache.set(id, it)
    }
    return it
  }
  const idByName = new Map<string, number>()
  for (const [id, v] of Object.entries(m.items)) idByName.set(v[0], Number(id))
  for (const [id, v] of Object.entries(g.meta)) if (!idByName.has(v.name)) idByName.set(v.name, Number(id))

  return {
    builtAt: g.builtAt,
    marketAt: m.fetchedAt,
    nodes: g.nodes,
    node,
    mainNodes,
    baseIds: new Set(mainNodes.filter((n) => n.cp === 0 && (n.kind === 1 || n.kind === 2)).map((n) => n.id)),
    workerTownIds: new Set(g.workerTowns),
    towns: new Map(Object.entries(g.towns).map(([k, v]) => [Number(k), v.map(([townId, dist]) => ({ townId, dist }))])),
    drops: new Map(Object.entries(g.drops).map(([k, v]) => [Number(k), v])),
    pzByParent,
    parentOf,
    recipes: g.recipes,
    groups: new Map(g.groups.map((x) => [x.groupId, x.items])),
    imperial: g.imperial,
    meta: g.meta,
    item,
    idByName,
  }
}

/** ตัวเลือกของช่องวัตถุดิบ (กลุ่ม = ใช้ของไหนก็ได้ในกลุ่ม · ของเกรดสูงนับหลายหน่วย) */
export function slotOptions(game: Game, ing: Ing): { id: number; need: number }[] {
  if (ing.type === 'item') return [{ id: ing.itemId, need: ing.quantity }]
  return (game.groups.get(ing.groupId) ?? []).map((g) => ({ id: g.itemId, need: ing.quantity / (g.value || 1) }))
}
