'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: '📦 ผลผลิต' },
  { href: '/map/', label: '🗺 แผนที่' },
  { href: '/imperial/', label: '👑 ราชวัง' },
  { href: '/alchemy/', label: '⚗ แปรธาตุ' },
  { href: '/settings/', label: '⚙ ตั้งค่า' },
]

export default function Nav() {
  const path = usePathname().replace(/\/?$/, '/')
  return (
    <nav className="flex items-center gap-1 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2">
      <span className="mr-4 text-sm font-semibold text-amber-400">BDO Node Planner</span>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-md px-3 py-1 text-sm ${path === l.href ? 'bg-neutral-700 text-white' : 'text-neutral-300 hover:bg-neutral-800'}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
