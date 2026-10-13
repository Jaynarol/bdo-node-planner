'use client'
import { useApp } from '@/lib/app'
import { fmt } from './ui'

/** แถบสรุปแผนสด: CP ที่เหลือ · รายได้/วัน · เงินต่อ CP (เฉลี่ยทั้งแผน + จุดล่าสุดที่เพิ่ม) */
export default function SummaryBar({ children }: { children?: React.ReactNode }) {
  const { derived, state, lastAdd, game } = useApp()
  const total = state.settings.cpTotal
  const left = total - derived.cpUsed
  const avg = derived.cpUsed > 0 ? derived.incomePerDay / derived.cpUsed : 0
  const last = lastAdd ? game.node.get(lastAdd.pzk) : null
  const unreachable = derived.perPick.filter((p) => p.unreachable).length
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-neutral-800 bg-neutral-900/90 px-4 py-2 text-sm">
      <span>
        CP <b>{derived.cpUsed}</b>/{total} ·{' '}
        <b className={left < 0 ? 'text-amber-300' : 'text-sky-300'}>{left < 0 ? `เกิน ${-left}` : `เหลือ ${left}`}</b>
      </span>
      <span>
        รายได้ <b className="text-amber-300">{fmt(derived.incomePerDay)}</b>/วัน
      </span>
      <span>
        เฉลี่ย <b>{fmt(avg)}</b>/CP
      </span>
      <span>
        คนงาน <b>{derived.spots.length}</b>
      </span>
      {lastAdd && (
        <span className="text-neutral-400" title="จุดที่เพิ่มล่าสุด: รายได้ ÷ CP ส่วนเพิ่ม (รวมทางเชื่อม)">
          ล่าสุด: {game.node.get(game.parentOf(lastAdd.pzk) ?? 0)?.name} · {last?.name} +{fmt(lastAdd.income)} / {lastAdd.cost} CP ={' '}
          <b className="text-neutral-200">{fmt(lastAdd.income / Math.max(lastAdd.cost, 0.5))}/CP</b>
        </span>
      )}
      {unreachable > 0 && <span className="text-amber-300">⚠ {unreachable} จุดเชื่อมไม่ถึงเมือง</span>}
      <span className="flex-1" />
      {children}
    </div>
  )
}
