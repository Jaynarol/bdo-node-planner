'use client'
/**
 * แผนที่ Leaflet CRS.Simple บน tile เกม (public/tiles)
 * สี (ผู้ใช้ตาบอดสีแดง-เขียว — แยกด้วยส้ม/ฟ้า/เทา + ขนาด/ลวดลาย):
 *   ส้ม = จุดทำงานในแผน · เทา = ทางผ่าน · ฟ้า = เมืองฟรี · หรี่ = ยังไม่ลง
 *   วงฟ้า = จุดที่ผลิตไอเทมที่ดูอยู่ (ยังไม่ลง) · วงส้มหนา = ผลิตไอเทมนี้และอยู่ในแผน
 */
import { useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as LMap } from 'leaflet'
import { BASE_PATH, type GameNode } from '@/lib/data'
import { DEFAULT_WORLD, gameToLatLng } from '@/lib/transform'

export interface MapProps {
  nodes: GameNode[]
  baseIds: Set<number>
  workerTownIds: Set<number>
  workerIds: number[]
  passIds: number[]
  /** จำนวนคนงานต่อ node (เลขบนหมุด) */
  counts?: Record<number, number>
  /** วงไฮไลต์ node ที่ผลิตไอเทมที่ดูอยู่: inPlan = อยู่ในแผนแล้ว */
  rings?: { id: number; inPlan: boolean; label?: string }[]
  /** ทางเชื่อมที่จะเพิ่มถ้ากด ＋ (ฟ้าเส้นประ) */
  preview?: number[]
  selectedId?: number | null
  /** ซูมไปที่ node พวกนี้ตอนเปิด */
  fitIds?: number[]
  tooltip?: (id: number) => string
  onNodeClick?: (id: number) => void
}

const MAX_TILE_ZOOM = 5

export default function NodeMap(p: MapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const layersRef = useRef<{ edges: LayerGroup; markers: LayerGroup; overlay: LayerGroup } | null>(null)
  const LRef = useRef<typeof import('leaflet') | null>(null)
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const propsRef = useRef(p)
  propsRef.current = p

  const toLL = (x: number, y: number) => {
    const ll = gameToLatLng(x, y)
    return LRef.current!.latLng(ll.lat, ll.lng)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current || mapRef.current) return
      LRef.current = L
      const minZoom = DEFAULT_WORLD.minNativeZoom - 1
      const maxZoom = MAX_TILE_ZOOM + 2
      const map = L.map(ref.current, { crs: L.CRS.Simple, minZoom, maxZoom, attributionControl: false })
      mapRef.current = map
      const TileClass = L.TileLayer.extend({
        getTileUrl(this: L.TileLayer & { _getZoomForUrl(): number }, c: { x: number; y: number }) {
          return `${BASE_PATH}/tiles/${this._getZoomForUrl()}/${c.x}_${c.y}.webp`
        },
      })
      new (TileClass as unknown as new (u: string, o: object) => L.TileLayer)('', {
        tileSize: DEFAULT_WORLD.tileSize,
        minZoom,
        maxZoom,
        minNativeZoom: DEFAULT_WORLD.minNativeZoom,
        maxNativeZoom: MAX_TILE_ZOOM,
        noWrap: true,
        errorTileUrl:
          'data:image/svg+xml;base64,' +
          btoa('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#16282e"/></svg>'),
      }).addTo(map)
      layersRef.current = { edges: L.layerGroup().addTo(map), markers: L.layerGroup().addTo(map), overlay: L.layerGroup().addTo(map) }
      setReady(true)
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      layersRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (!ready || !LRef.current || !layersRef.current) return
    const L = LRef.current
    const { edges, markers, overlay } = layersRef.current
    edges.clearLayers()
    markers.clearLayers()
    overlay.clearLayers()
    const byId = new Map(p.nodes.map((n) => [n.id, n]))
    const worker = new Set(p.workerIds)
    const pass = new Set(p.passIds)
    const net = new Set([...worker, ...pass])
    const prev = new Set(p.preview ?? [])
    const isBase = (id: number) => p.baseIds.has(id)

    const seen = new Set<string>()
    for (const n of p.nodes)
      for (const c of n.conn) {
        const o = byId.get(c)
        if (!o) continue
        const key = n.id < c ? `${n.id}-${c}` : `${c}-${n.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const inNet = (a: number, b: number) => (net.has(a) || isBase(a)) && (net.has(b) || isBase(b)) && (net.has(a) || net.has(b))
        const inPrev = (a: number, b: number) =>
          (prev.has(a) || net.has(a) || isBase(a)) && (prev.has(b) || net.has(b) || isBase(b)) && (prev.has(a) || prev.has(b))
        const style = inNet(n.id, c)
          ? { color: '#ffb020', weight: 3, opacity: 0.95 }
          : inPrev(n.id, c)
            ? { color: '#4da3ff', weight: 3, opacity: 0.9, dashArray: '6 5' }
            : { color: '#3a4750', weight: 1, opacity: 0.35 }
        L.polyline([toLL(n.x, n.y), toLL(o.x, o.y)], { ...style, interactive: false }).addTo(edges)
      }

    const workerStyle = { radius: 6, color: '#3d2c00', weight: 1.5, fillColor: '#ffb020', fillOpacity: 1, opacity: 1 }
    const passStyle = { radius: 4, color: '#c8d2da', weight: 1.5, fillColor: '#5b6b73', fillOpacity: 0.9, opacity: 0.9 }
    const dimStyle = { radius: 2.5, color: '#5b6b73', weight: 1, fillColor: '#5b6b73', fillOpacity: 0.35, opacity: 0.5 }
    const baseStyle = { radius: 5, color: '#0b2740', weight: 1.5, fillColor: '#4da3ff', fillOpacity: 0.95, opacity: 1 }
    const prevStyle = { radius: 5, color: '#dff1ff', weight: 2, dashArray: '3 3', fillColor: '#4da3ff', fillOpacity: 0.9, opacity: 1 }

    for (const n of p.nodes) {
      const style = isBase(n.id)
        ? baseStyle
        : worker.has(n.id)
          ? workerStyle
          : pass.has(n.id)
            ? passStyle
            : prev.has(n.id)
              ? prevStyle
              : dimStyle
      const m = L.circleMarker(toLL(n.x, n.y), style).addTo(markers)
      const cnt = p.counts?.[n.id]
      if (cnt)
        L.marker(toLL(n.x, n.y), {
          icon: L.divIcon({ className: 'count-badge', html: String(cnt), iconSize: [15, 15], iconAnchor: [-2, 17] }),
          interactive: false,
        }).addTo(markers)
      const tip = propsRef.current.tooltip?.(n.id) ?? `<b>${n.name}</b> · ${n.cp} CP`
      m.bindTooltip(tip, { direction: 'top' })
      m.on('click', () => propsRef.current.onNodeClick?.(n.id))
      if (isBase(n.id) && n.kind === 2)
        m.bindTooltip(n.name, { permanent: true, direction: 'bottom', className: 'city-label', offset: [0, 4] })
    }

    for (const r of p.rings ?? []) {
      const n = byId.get(r.id)
      if (!n) continue
      const ring = L.circleMarker(
        toLL(n.x, n.y),
        r.inPlan
          ? { radius: 11, color: '#ffb020', weight: 4, fill: false, opacity: 1 }
          : { radius: 11, color: '#00e5ff', weight: 2.5, fill: false, opacity: 0.95 },
      ).addTo(overlay)
      ring.on('click', () => propsRef.current.onNodeClick?.(n.id))
      if (r.label)
        ring.bindTooltip(r.label, { permanent: true, direction: 'right', className: 'spot-label', offset: [10, 0] })
    }
    if (p.selectedId) {
      const n = byId.get(p.selectedId)
      if (n) L.circleMarker(toLL(n.x, n.y), { radius: 15, color: '#ffffff', weight: 2.5, fill: false, interactive: false }).addTo(overlay)
    }

    if (!fittedRef.current) {
      fittedRef.current = true
      const fit = (p.fitIds?.length ? p.fitIds : [...net]).map((id) => byId.get(id)).filter((n): n is GameNode => !!n)
      const map = mapRef.current!
      // ใน modal กล่องอาจยังไม่ได้ขนาดจริงตอนสร้างแมพ — ให้ Leaflet วัดใหม่ก่อนซูม
      map.invalidateSize()
      if (fit.length) map.fitBounds(L.latLngBounds(fit.map((n) => toLL(n.x, n.y))).pad(0.2), { maxZoom: 4 })
      else map.setView(toLL(0, 0), 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.nodes, p.workerIds, p.passIds, p.counts, p.rings, p.preview, p.selectedId])

  return <div ref={ref} className="h-full w-full bg-[#16282e]" />
}
