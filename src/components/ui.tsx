'use client'
import { useState } from 'react'
import type { Item } from '@/lib/data'

export const fmt = (n: number) =>
  !Number.isFinite(n)
    ? '∞'
    : Math.abs(n) >= 1e9
      ? (n / 1e9).toFixed(2) + 'B'
      : Math.abs(n) >= 1e6
        ? (n / 1e6).toFixed(1) + 'M'
        : Math.abs(n) >= 1e3
          ? (n / 1e3).toFixed(0) + 'k'
          : Math.round(n).toLocaleString()
export const qty = (n: number) => (n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1))

/** ไอคอนไอเทมจาก CDN ตลาดทางการของ Pearl Abyss (ตาม id) */
export function ItemIcon({ id, size = 28, title }: { id: number; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span style={{ width: size, height: size }} className="inline-block shrink-0 rounded bg-neutral-800" title={title} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://s1.pearlcdn.com/KR/TradeMarket/Common/img/BDO/item/${id}.png`}
      alt={title ?? ''}
      title={title}
      width={size}
      height={size}
      loading="lazy"
      className="inline-block shrink-0 rounded border border-neutral-700 bg-neutral-900"
      onError={() => setFailed(true)}
    />
  )
}

/** ขายได้ต่อวัน (ยอด 14 วัน ÷ 14) — ฟ้า = คล่อง · อำพัน = ช้า (ไม่ใช้แดง-เขียว: ผู้ใช้ตาบอดสี) */
export function Sells({ i }: { i: Item }) {
  const d = Math.round(i.vol14 / 14)
  const cls = d >= 1000 ? 'text-sky-300' : d >= 300 ? 'text-neutral-300' : 'text-amber-300'
  return (
    <span className={cls} title="ยอดซื้อขายจริงต่อวันในตลาด (เฉลี่ย 14 วัน)">
      {d < 300 && '⚠ '}ขาย {d.toLocaleString()}/วัน
    </span>
  )
}

export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2">
          <div className="min-w-0 flex-1 font-semibold">{title}</div>
          <button className="btn" onClick={onClose}>
            ✕ ปิด
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

export function priceNote(at: string) {
  return `ราคา ASIA ${new Date(at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · ไม่หักภาษี · ไม่นับของโชค`
}
