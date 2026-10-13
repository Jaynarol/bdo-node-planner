/**
 * สูตรแปลงพิกัดเกม ↔ แมพ — **ลอกมาจาก config ของเจ้าของ tile เอง** (questlog/bdolytics)
 *
 * ที่มา: chunk ของหน้าแมพ (cdn.questlog.gg/_static/black-desert/_nuxt/*.js) มีค่าจริงว่า
 *   worlds["1"] = { name: 'Black Desert',
 *     gameMinX: -1638700, gameMaxX: 1638700, gameMinY: -1638700, gameMaxY: 1638700,
 *     tileMinLng: 0, tileMaxLng: 256, tileMinLat: -256, tileMaxLat: 0,
 *     layer: { url: '…/map/v12/{z}/{x}/{y}.webp', tileSize: 336, minNativeZoom: 0, maxNativeZoom: 7 },
 *     offset: [40, -40] }
 * และฟังก์ชันแปลงของเขา:
 *   scaleX = (tileMaxLng-tileMinLng)/(gameMaxX-gameMinX)
 *   offsetX = tileMinLng - gameMinX*scaleX + offset[0]
 *   offsetY = tileMaxLat + gameMinY*scaleY + offset[1]
 *   lng = offsetX + gameX*scaleX     ·     lat = offsetY - gameY*scaleY
 *
 * ⚠️ ของเดิมเราเดาเองว่า tile กว้าง 256 px และ origin อยู่กลางภาพ → ผิดทั้งคู่
 * (tile จริง 336 px) ทำให้ภาพที่ต่อเองเลื่อน/ถูกตัด และหมุดเกาะไม่ตรงเลย
 * ห้ามกลับไปเดาเอง — ถ้าเกมย้ายพิกัด ให้ไปอ่าน config ของเจ้าของใหม่ (scripts/fetch-map-config.ts)
 */
export interface MapWorldConfig {
  gameMinX: number
  gameMaxX: number
  gameMinY: number
  gameMaxY: number
  tileMinLng: number
  tileMaxLng: number
  tileMinLat: number
  tileMaxLat: number
  tileSize: number
  minNativeZoom: number
  maxNativeZoom: number
  offset: [number, number]
  tileUrl: string
}

export const DEFAULT_WORLD: MapWorldConfig = {
  gameMinX: -1638700,
  gameMaxX: 1638700,
  gameMinY: -1638700,
  gameMaxY: 1638700,
  tileMinLng: 0,
  tileMaxLng: 256,
  tileMinLat: -256,
  tileMaxLat: 0,
  tileSize: 336,
  minNativeZoom: 0,
  maxNativeZoom: 7,
  offset: [40, -40],
  tileUrl: 'https://cdn.questlog.gg/black-desert/map/v12/{z}/{x}/{y}.webp',
}

export interface MapTransform {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

export function transformOf(w: MapWorldConfig = DEFAULT_WORLD): MapTransform {
  const scaleX = (w.tileMaxLng - w.tileMinLng) / (w.gameMaxX - w.gameMinX)
  const scaleY = (w.tileMaxLat - w.tileMinLat) / (w.gameMaxY - w.gameMinY)
  return {
    scaleX,
    scaleY,
    offsetX: w.tileMinLng - w.gameMinX * scaleX + (w.offset?.[0] ?? 0),
    offsetY: w.tileMaxLat + w.gameMinY * scaleY + (w.offset?.[1] ?? 0),
  }
}

/**
 * พิกัดโหนดที่เราเก็บ (จาก bdolytics) → lat/lng ของแมพ (CRS.Simple)
 *
 * ⚠️ ค่า y ที่ bdolytics ให้มา **เซ็นตรงข้าม** กับ gameY ใน config ของแมพ
 * สูตรของเจ้าของคือ lat = offsetY - gameY*scaleY เมื่อ gameY = -(y ที่เราเก็บ)
 * → ของเรา lat = offsetY + y*scaleY
 *
 * วัดผลกับโหนดจริง 767 เมือง + 49 จุดแลก (scripts/check-ysign.ts):
 *   ไม่กลับเซ็น: เมืองอยู่บนบก 65% · จุดแลกติดน้ำ 29%
 *   กลับเซ็น   : เมืองอยู่บนบก 93% · จุดแลกติดน้ำ 86%  ← ใช้อันนี้
 */
export function gameToLatLng(x: number, y: number, t: MapTransform = transformOf()) {
  return { lat: t.offsetY + y * t.scaleY, lng: t.offsetX + x * t.scaleX }
}

/** lat/lng → พิกัดโหนดแบบที่เราเก็บ */
export function latLngToGame(lat: number, lng: number, t: MapTransform = transformOf()): [number, number] {
  return [(lng - t.offsetX) / t.scaleX, (lat - t.offsetY) / t.scaleY]
}

/**
 * พิกัดเกม → พิกเซลของ pyramid ที่ zoom ที่ระบุ
 * CRS.Simple ของ Leaflet: point = (lng, -lat) แล้วคูณ scale(zoom) = 2^zoom
 */
export function gameToPixel(x: number, y: number, zoom: number, w: MapWorldConfig = DEFAULT_WORLD) {
  const t = transformOf(w)
  const ll = gameToLatLng(x, y, t)
  const s = 2 ** zoom
  return { px: ll.lng * s, py: -ll.lat * s }
}

/** หน่วยพิกัดเกมต่อ 1 พิกเซล ที่ zoom ที่ระบุ */
export function unitsPerPixel(zoom: number, w: MapWorldConfig = DEFAULT_WORLD) {
  return 1 / (transformOf(w).scaleX * 2 ** zoom)
}

/** จำนวน tile ต่อด้านที่ต้องมี เพื่อครอบพื้นที่ที่พิกัดเกมไปถึงได้ */
export function tilesPerSide(zoom: number, w: MapWorldConfig = DEFAULT_WORLD) {
  const t = transformOf(w)
  const maxLng = Math.max(t.offsetX + w.gameMaxX * t.scaleX, w.tileMaxLng)
  const maxPy = Math.max(-(t.offsetY - w.gameMaxY * t.scaleY), -w.tileMinLat)
  const s = 2 ** zoom
  return {
    x: Math.ceil((maxLng * s) / w.tileSize),
    y: Math.ceil((maxPy * s) / w.tileSize),
  }
}
