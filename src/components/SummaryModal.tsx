'use client'
import { useApp } from '@/lib/app'
import { fmt, ItemIcon, Modal, qty } from './ui'

/** สรุปแผน: คนงานต่อเมือง · ของที่ได้ต่อวัน · รายจุด (CP ส่วนเพิ่ม/ทางเชื่อม) */
export default function SummaryModal({ onClose }: { onClose: () => void }) {
  const { game, derived, state, produced, values } = useApp()
  const byPzk = new Map(derived.spots.map((s) => [s.pzk, s]))
  const towns = new Map<number, { goblin: number; giant: number }>()
  for (const s of derived.spots) {
    const t = towns.get(s.townId) ?? { goblin: 0, giant: 0 }
    t[s.worker]++
    towns.set(s.townId, t)
  }
  const items = [...produced.values()]
    .map((p) => ({ ...p, item: game.item(p.itemId), price: values.get(p.itemId)?.price ?? 0, label: values.get(p.itemId)?.label }))
    .sort((a, b) => b.perDay * b.price - a.perDay * a.price)
  const name = (id: number) => game.node.get(id)?.name ?? `#${id}`

  return (
    <Modal wide title="📋 สรุปแผน" onClose={onClose}>
      <div className="space-y-4 p-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            CP <b>{derived.cpUsed}</b>/{state.settings.cpTotal}
          </span>
          <span>
            รายได้ <b className="text-amber-300">{fmt(derived.incomePerDay)}</b>/วัน
          </span>
          <span>เฉลี่ย {fmt(derived.incomePerDay / Math.max(derived.cpUsed, 1))}/CP</span>
          <span>
            คนงาน {derived.spots.length} · node ทำงาน {derived.workerNodeIds.length} · ทางผ่าน {derived.passThroughIds.length}
          </span>
        </div>

        <section>
          <h3 className="mb-1 font-semibold text-amber-300">คนงานต่อเมือง</h3>
          <div className="flex flex-wrap gap-2">
            {[...towns]
              .sort((a, b) => b[1].goblin + b[1].giant - a[1].goblin - a[1].giant)
              .map(([id, t]) => (
                <span key={id} className="chip">
                  {name(id)}: {t.goblin ? `Goblin ${t.goblin}` : ''}
                  {t.goblin && t.giant ? ' · ' : ''}
                  {t.giant ? `ยักษ์ ${t.giant}` : ''}
                </span>
              ))}
          </div>
          {derived.townLinks.length > 0 && (
            <div className="mt-1 text-xs text-neutral-400">
              ต่อเส้นเพิ่มให้คนงานมาจากเมืองที่ใกล้กว่า:{' '}
              {derived.townLinks.map((l) => `${name(l.toTownId)} (${l.cost} CP, +${fmt(l.gain)}/วัน: ${l.pathIds.map(name).join(' → ')})`).join(' · ')}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-amber-300">ของที่ได้ต่อวัน</h3>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((x) => (
              <div key={x.itemId} className="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1">
                <ItemIcon id={x.itemId} size={22} title={x.item.name} />
                <span className="min-w-0 flex-1 truncate" title={x.label ?? 'ขายดิบ'}>
                  {x.item.name}
                </span>
                <b>{qty(x.perDay)}</b>
                <span className="w-14 text-right text-xs text-neutral-400">{fmt(x.perDay * x.price)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-amber-300">รายจุด (เรียงตามลำดับที่เชื่อม)</h3>
          <table className="w-full text-xs">
            <thead className="text-neutral-400">
              <tr className="text-left">
                <th className="py-1">จุด</th>
                <th>คนงาน</th>
                <th>เมือง</th>
                <th className="text-right">CP</th>
                <th className="text-right">รายได้/วัน</th>
                <th className="text-right">/CP</th>
                <th className="pl-3">ทางเชื่อมที่เพิ่ม</th>
              </tr>
            </thead>
            <tbody>
              {derived.perPick.map((p) => {
                const s = byPzk.get(p.pzk)
                const n = game.node.get(p.pzk)
                return (
                  <tr key={p.pzk} className="border-t border-neutral-800">
                    <td className="py-1">
                      {name(p.parentId)} · {n?.name}
                      {p.unreachable && <span className="text-amber-300"> ⚠ เชื่อมไม่ถึง</span>}
                    </td>
                    <td>{s ? (s.worker === 'giant' ? 'ยักษ์' : 'Goblin') : ''}</td>
                    <td>{s ? name(s.townId) : ''}</td>
                    <td className="text-right">{p.cost}</td>
                    <td className="text-right">{s ? fmt(s.income) : '—'}</td>
                    <td className="text-right">{s && p.cost ? fmt(s.income / p.cost) : '—'}</td>
                    <td className="pl-3 text-neutral-400">{p.pathIds.map(name).join(' → ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </Modal>
  )
}
