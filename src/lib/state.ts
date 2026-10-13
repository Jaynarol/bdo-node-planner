/**
 * สถานะทั้งหมดของผู้ใช้ — เก็บใน localStorage ของเบราว์เซอร์ (export/import เป็นไฟล์ได้ที่หน้าตั้งค่า)
 * แผน = รายการจุดผลผลิตที่เลือก (picks) เท่านั้น · เส้นเชื่อม/ทางผ่านคำนวณจาก picks เสมอ
 * → ลบจุดไหน ทางผ่านที่ไม่มีใครใช้ก็หายเอง
 */
export type WorkerChoice = 'goblin' | 'giant'
export interface WorkerProfile {
  wspd: number
  mspd: number
}
export interface WorkerProfiles {
  goblin: WorkerProfile
  giant: WorkerProfile
}

export interface Settings {
  /** CP ที่ใช้กับ node ได้ทั้งหมด */
  cpTotal: number
  workers: WorkerProfiles
  /** ไม่ลงจุดที่ รายได้/วัน ÷ CP ส่วนเพิ่ม ต่ำกว่านี้ (0 = ไม่กรอง) — ใช้กับปุ่ม ＋ และ ✨ เติมอัตโนมัติ */
  minPerCp: number
  /** นับมูลค่าราชวัง/แปรธาตุที่เลือกทำ ตอนตีค่าของจาก node (ปิด = แปรรูปคุ้มสุด ไม่งั้นขายดิบ) */
  countTiers: boolean
  cookMastery: number
  alchMastery: number
  /** โควต้ากล่องราชวัง/วัน */
  quota: number
  /** ตัวคูณราคาที่ NPC ราชวังแสดง (ปกติ 250%) */
  priceMultPct: number
  imperialTiers: 'master' | 'guru' | 'both'
  /** ปลูกได้กี่ลูกต่อแปลงต่อวัน (ประมาณจำนวนแปลงชั้นหนึ่ง) */
  plotYield: number
}

export interface Pick {
  pzk: number
  /** ล็อกสายคนงาน (ไม่ใส่ = ออโต้: ระบบเลือกสายที่รายได้ดีกว่า) */
  worker?: WorkerChoice
  /** แก้ความเร็วเฉพาะจุด (ไม่ใส่ = ตามโปรไฟล์) */
  wspd?: number
  mspd?: number
}

export interface ChosenDish {
  id: number
  /** พักไว้เป็นทางเลือก — ไม่แบ่งโควต้า แต่ยังโชว์กำไร/วัตถุดิบ */
  standby?: boolean
}

export interface AppState {
  version: 1
  settings: Settings
  picks: Pick[]
  imperial: {
    chosen: ChosenDish[]
    /** วัตถุดิบที่ปลูกเอง (ไม่จำกัด) */
    growOwn: number[]
    /** ปลูกเกรดชั้นหนึ่ง — id ของวัตถุดิบธรรมดาในสูตร */
    growPremium: number[]
    /** เอา/ไม่เอาวัตถุดิบรายตัว */
    overrides: Record<string, boolean>
  }
  alchemy: { chosen: number[] }
}

/** ค่าตั้งต้นคนงานตามของผู้ใช้ (2026-09-30): Goblin 155/8.5 · ยักษ์ 97/4 */
export const DEFAULT_STATE: AppState = {
  version: 1,
  settings: {
    cpTotal: 460,
    workers: { goblin: { wspd: 155, mspd: 8.5 }, giant: { wspd: 97, mspd: 4 } },
    minPerCp: 0,
    countTiers: false,
    cookMastery: 2000,
    alchMastery: 2000,
    quota: 240,
    priceMultPct: 250,
    imperialTiers: 'both',
    plotYield: 700,
  },
  picks: [],
  imperial: { chosen: [], growOwn: [7304, 7312, 7004, 7009], growPremium: [], overrides: {} },
  alchemy: { chosen: [] },
}

export const STORAGE_KEY = 'bdo-node-planner:v1'

/** เติมค่าที่ขาดจากไฟล์เก่า/ไฟล์ import ให้ครบ */
export function normalizeState(raw: unknown): AppState {
  const s = (raw ?? {}) as Partial<AppState>
  return {
    version: 1,
    settings: {
      ...DEFAULT_STATE.settings,
      ...s.settings,
      workers: {
        goblin: { ...DEFAULT_STATE.settings.workers.goblin, ...s.settings?.workers?.goblin },
        giant: { ...DEFAULT_STATE.settings.workers.giant, ...s.settings?.workers?.giant },
      },
    },
    picks: Array.isArray(s.picks) ? s.picks.filter((p) => typeof p?.pzk === 'number') : [],
    imperial: { ...DEFAULT_STATE.imperial, ...s.imperial },
    alchemy: { ...DEFAULT_STATE.alchemy, ...s.alchemy },
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* เต็ม/ถูกบล็อก — ยังใช้งานต่อได้ในหน้านี้ */
  }
}
