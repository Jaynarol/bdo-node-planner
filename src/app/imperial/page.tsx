'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/app'
import { buildFoodPlan, type DishPlan } from '@/lib/foodplan'
import { BOX_NAMES, imperialCfg, listIngredients, SOURCE_LABEL, type DishEval, type Source } from '@/lib/imperial'
import type { AppState } from '@/lib/state'
import { fmt, ItemIcon, qty } from '@/components/ui'

type Mode = 'active' | 'standby' | 'off'

/**
 * อาหารส่งกล่องราชวัง — คิดแยกจากแผน node: เลือกจาน (⭐ ใช้ / พักไว้) แล้วดูว่าของจากจุดในแผนพอส่งได้กี่กล่อง
 * วัตถุดิบเลือกได้ว่ามาจาก node ในแผน / ปลูกเอง / ปลูกชั้นหนึ่ง · มูลค่าราชวังจะไปตีค่าจุด node เมื่อเปิดสวิตช์ในตั้งค่า
 */
export default function ImperialPage() {
  const { game, state, update, spots, produced } = useApp()
  const f = useMemo(() => buildFoodPlan(game, state, spots, produced), [game, state, spots, produced])
  const [sort, setSort] = useState<'profit' | 'easy'>('profit')
  const [showAll, setShowAll] = useState(false)
  const [showIng, setShowIng] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  const modeOf = (id: number): Mode => {
    const c = state.imperial.chosen.find((x) => x.id === id)
    return !c ? 'off' : c.standby ? 'standby' : 'active'
  }
  const setMode = (id: number, m: Mode) =>
    update((s) => ({
      ...s,
      imperial: {
        ...s.imperial,
        chosen: m === 'off' ? s.imperial.chosen.filter((c) => c.id !== id) : [...s.imperial.chosen.filter((c) => c.id !== id), { id, standby: m === 'standby' || undefined }],
      },
    }))
  const setGrow = (id: number, mode: 'node' | 'grow' | 'premium') =>
    update((s) => ({
      ...s,
      imperial: {
        ...s.imperial,
        growOwn: mode === 'grow' ? [...new Set([...s.imperial.growOwn, id])] : s.imperial.growOwn.filter((x) => x !== id),
        growPremium: mode === 'premium' ? [...new Set([...s.imperial.growPremium, id])] : s.imperial.growPremium.filter((x) => x !== id),
      },
    }))

  const dishes = f.all
    .filter((d) => showAll || (!d.blocked && d.profit > 0))
    .sort((a, b) =>
      Number(!!a.blocked) - Number(!!b.blocked) ||
      (sort === 'easy' ? a.subCrafts.length - b.subCrafts.length || a.actionsPerCrate - b.actionsPerCrate : 0) ||
      b.profit - a.profit,
    )
  const pct = Math.min(100, (f.delivered / Math.max(f.quota, 1)) * 100)
  const enough = f.sustainable >= f.quota

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 text-sm">
      {f.plans.length > 0 ? (
        <div className="card space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs text-neutral-400">ส่งได้เฉลี่ยต่อวัน (ของจากจุดในแผนพอ)</div>
              <div className="text-3xl font-semibold">
                {Math.floor(f.delivered)} <span className="text-base text-neutral-400">/ {f.quota} กล่อง</span>
              </div>
            </div>
            <div className="text-right text-xs">
              <div>
                เงินกล่อง <b className="text-amber-300">{fmt(f.payoutPerDay)}/วัน</b>
              </div>
              <div className="text-neutral-400">ได้มากกว่าขายของดิบ +{fmt(f.gainPerDay)}/วัน</div>
              <div className="text-neutral-400">กดทำอาหาร ~{qty(f.clicksPerDay)} ครั้ง/วัน</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded bg-neutral-800">
            <div className={`h-full ${enough ? 'bg-sky-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className={`text-xs ${enough ? 'text-sky-300' : 'text-amber-300'}`}>
            {enough ? `✓ วนส่งครบ ${f.quota} กล่องได้ทุกวัน` : `ยังขาด ~${Math.ceil(f.quota - f.sustainable)} กล่อง/วัน — ดูคอขวดของแต่ละจาน (เพิ่มจุดได้ที่หน้าผลผลิต)`}
          </div>
        </div>
      ) : (
        <div className="card text-neutral-400">ยังไม่ได้เลือกจาน — กด ☆ ที่จานในรายการด้านล่าง</div>
      )}

      {f.plans.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-amber-300">จานที่ใช้ในแผน</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {f.plans.map((p) => (
              <PlanCard key={p.dish.id} p={p} quota={f.quota} mode={modeOf(p.dish.id)} setMode={setMode} />
            ))}
          </div>
        </section>
      )}

      {f.alternatives.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-amber-300">พักไว้ (ทางเลือก — ไม่แบ่งโควต้า)</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {f.alternatives.map(({ plan: p, perCrate }) => (
              <div key={p.dish.id} className="card space-y-1.5 p-3">
                <DishHead d={p.dish} />
                <div className="text-xs text-neutral-400">
                  {Number.isFinite(p.cratesPerDay) ? `ของ node เหลือพอ ~${qty(p.cratesPerDay)} กล่อง/วัน` : 'ไม่จำกัด — วัตถุดิบปลูก/เก็บเองได้หมด'}
                </div>
                <div className="space-y-0.5 rounded bg-neutral-950/60 p-2 text-xs">
                  {p.nodeReq.map((r) => (
                    <Row key={r.item.id} id={r.item.id} name={r.item.name} src="🌾 node" n={r.perCrate} />
                  ))}
                  {perCrate.map((n) => (
                    <Row key={n.item.id} id={n.item.id} name={n.item.name + (n.premium ? ' ⭐' : '')} src={SOURCE_LABEL[n.source]} n={n.perDay} />
                  ))}
                  <div className="text-[11px] text-neutral-500">จำนวนต่อ 1 กล่อง</div>
                </div>
                <ModeButtons id={p.dish.id} mode={modeOf(p.dish.id)} setMode={setMode} />
              </div>
            ))}
          </div>
        </section>
      )}

      {f.growable.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-amber-300">วัตถุดิบที่ปลูกได้ — ยึดอะไร</h2>
          <p className="text-xs text-neutral-500">
            🌾 ตาม node = ใช้เท่าที่จุดในแผนเก็บได้ (เป็นคอขวดได้) · 🌱 ปลูก = หาเองไม่จำกัด · ⭐ ชั้นหนึ่ง = ใส่ตรง (1 ลูกนับหลายหน่วย) หรือแลกเป็นระดับสูง 1→2 / ธรรมดา 1→4 — ระบบเลือกแบบที่ใช้น้อยสุด
            {f.premiumPerDay > 0 && (
              <b className="ml-1 text-amber-200">
                ชั้นหนึ่งรวม ~{qty(f.premiumPerDay)} ลูก/วัน ≈ {(f.premiumPerDay / f.plotYield).toFixed(1)} แปลง
              </b>
            )}
          </p>
          <div className="grid gap-1.5 md:grid-cols-2">
            {f.growable.map((g) => (
              <div key={g.item.id} className="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1.5">
                <ItemIcon id={g.item.id} size={24} title={g.item.name} />
                <span className="min-w-0 flex-1">
                  {g.item.name}
                  <span className="block text-[11px] text-neutral-500">{g.hasNode ? `แผนเก็บได้ ${qty(g.supply)}/วัน` : 'ไม่มีจาก node'}</span>
                </span>
                {(['node', 'grow', 'premium'] as const).map((m) => (
                  <button
                    key={m}
                    disabled={(m === 'node' && !g.hasNode) || (m === 'premium' && !g.premiumName)}
                    className={`chip ${g.mode === m ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'text-neutral-400'} disabled:opacity-30`}
                    onClick={() => setGrow(g.item.id, m)}
                    title={m === 'premium' ? g.premiumName : undefined}
                  >
                    {m === 'node' ? '🌾 node' : m === 'grow' ? '🌱 ปลูก' : '⭐ ชั้นหนึ่ง'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {f.needs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-amber-300">ต้องหาเอง/ซื้อ ต่อวัน</h2>
          <div className="grid gap-1.5 md:grid-cols-2">
            {f.needs.map((n) => (
              <div key={n.item.id} className="flex items-center gap-2 rounded border border-neutral-800 px-2 py-1.5">
                <ItemIcon id={n.item.id} size={24} title={n.item.name} />
                <span className="min-w-0 flex-1">
                  {n.item.name}
                  {n.alts && <span className="block text-[11px] text-neutral-500">ใช้แทนได้: {n.alts.join(', ')}</span>}
                  {n.fromNode > 0 && <span className="block text-[11px] text-neutral-500">แผนให้แล้ว ~{qty(n.fromNode)}/วัน</span>}
                  {n.premium && (
                    <span className="block text-[11px] text-amber-200/80">
                      ⭐ ชั้นหนึ่ง{n.premium.direct > 0.5 && ` · ใส่ตรง ${qty(n.premium.direct)}`}
                      {n.premium.toHigh > 0.5 && ` · แลกเป็นระดับสูง ${qty(n.premium.toHigh)} (= ${qty(n.premium.toHigh * 2)} ลูกระดับสูง)`}
                      {n.premium.toNormal > 0.5 && ` · แลกเป็นธรรมดา ${qty(n.premium.toNormal)} (= ${qty(n.premium.toNormal * 4)} ลูก)`}
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-400">{SOURCE_LABEL[n.source]}</span>
                <b className="w-16 text-right">{qty(n.perDay)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-amber-300">ทุกจาน ({BOX_NAMES[4]}/{BOX_NAMES[5]})</h2>
          <span className="flex-1" />
          <select className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as 'profit' | 'easy')}>
            <option value="profit">เรียง: ได้เพิ่ม/กล่อง</option>
            <option value="easy">เรียง: ง่าย (ของย่อยน้อย)</option>
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> โชว์ที่ไม่คุ้ม/ทำไม่ได้
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          ได้เพิ่ม/กล่อง = เงินกล่อง − มูลค่าวัตถุดิบถ้าขายแทน (ของ node = มูลค่าที่ใช้คิดรายได้ · NPC = ราคาร้าน · อื่น = ตลาด) · ไล่สูตรย่อย 2 ขั้น
        </p>
        <div className="space-y-1">
          {dishes.map((d) => (
            <div key={d.id} className={`rounded border px-2 py-1.5 ${modeOf(d.id) !== 'off' ? 'border-amber-700' : 'border-neutral-800'} ${d.blocked ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
                  <ItemIcon id={d.id} size={28} title={d.name} />
                  <span className="min-w-0 flex-1">
                    {d.name} <span className="text-xs text-neutral-500">· {BOX_NAMES[d.box]}</span>
                    <span className="block text-[11px] text-neutral-400">
                      {d.blocked ?? `จ่าย ${fmt(d.payout)} · ต้นทุน ${fmt(d.cost)} · กด ~${d.actionsPerCrate.toFixed(1)}/กล่อง · ของย่อย ${d.subCrafts.length}`}
                    </span>
                  </span>
                  {!d.blocked && <b className={d.profit > 0 ? 'text-amber-300' : 'text-neutral-500'}>{d.profit > 0 ? '+' : ''}{fmt(d.profit)}</b>}
                </button>
                {!d.blocked && <ModeButtons id={d.id} mode={modeOf(d.id)} setMode={setMode} />}
              </div>
              {open === d.id && !d.blocked && (
                <div className="mt-1.5 space-y-0.5 rounded bg-neutral-950/60 p-2 text-xs">
                  {d.req.map((r) => (
                    <Row key={r.id} id={r.id} name={r.name + (r.alts ? ` (แทนได้: ${r.alts.join('/')})` : '')} src={SOURCE_LABEL[r.source as Source]} n={r.perCrate} sub={fmt(r.price)} />
                  ))}
                  {d.subCrafts.length > 0 && <div className="pt-1 text-neutral-400">ทำก่อน: {d.subCrafts.map((c) => `${c.name} ×${qty(c.perCrate)}`).join(' · ')}</div>}
                  <div className="text-[11px] text-neutral-500">จำนวนต่อ 1 กล่อง · ทำ 1 ครั้งได้ {d.cratesPerCook.toFixed(2)} กล่อง</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <button className="text-sm text-sky-300" onClick={() => setShowIng(!showIng)}>
          {showIng ? '▾' : '▸'} วัตถุดิบตั้งต้น — เลือกเอา/ไม่เอา
        </button>
        {showIng && <IngredientToggles state={state} update={update} />}
      </section>
    </div>
  )
}

function IngredientToggles({ state, update }: { state: AppState; update: ReturnType<typeof useApp>['update'] }) {
  const { game, spots } = useApp()
  const rows = useMemo(() => listIngredients(game, spots.values(), imperialCfg(state)), [game, spots, state])
  const toggle = (id: number, on: boolean, def: boolean) =>
    update((s) => {
      const o = { ...s.imperial.overrides }
      if (on === def) delete o[id]
      else o[id] = on
      return { ...s, imperial: { ...s.imperial, overrides: o } }
    })
  return (
    <div className="grid gap-1 md:grid-cols-2">
      {rows.map((r) => (
        <label key={r.id} className={`flex items-center gap-2 rounded border border-neutral-800 px-2 py-1 text-xs ${r.enabled ? '' : 'opacity-60'}`}>
          <input type="checkbox" checked={r.enabled} onChange={(e) => toggle(r.id, e.target.checked, r.defaultOn)} />
          <ItemIcon id={r.id} size={20} title={r.name} />
          <span className="min-w-0 flex-1 truncate" title={r.usedBy.join(', ')}>
            {r.name}
            {r.defaultWhy && <span className="text-amber-300"> · {r.defaultWhy}</span>}
          </span>
          <span className="text-neutral-400">{SOURCE_LABEL[r.source]}</span>
          <span className="w-12 text-right">{fmt(r.price)}</span>
        </label>
      ))}
    </div>
  )
}

function DishHead({ d }: { d: DishEval }) {
  return (
    <div className="flex items-center gap-2">
      <ItemIcon id={d.id} size={32} title={d.name} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{d.name}</div>
        <div className="text-xs text-neutral-400">
          จ่าย {fmt(d.payout)} · กด ~{d.actionsPerCrate.toFixed(1)}/กล่อง
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-amber-300">+{fmt(d.profit)}</div>
        <div className="text-[11px] text-neutral-400">/กล่อง</div>
      </div>
    </div>
  )
}

function PlanCard({ p, quota, mode, setMode }: { p: DishPlan; quota: number; mode: Mode; setMode: (id: number, m: Mode) => void }) {
  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <DishHead d={p.dish} />
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{qty(p.share)}</div>
          <div className="text-[11px] text-neutral-400">กล่อง/วัน</div>
        </div>
      </div>
      <div className="text-xs text-neutral-400">
        {Number.isFinite(p.cratesPerDay) ? `ของ node พอสูงสุด ~${qty(p.cratesPerDay)} กล่อง/วัน` : 'ไม่จำกัด — วัตถุดิบปลูก/เก็บเองได้หมด'}
        {p.share > 0 && ` · ทำ 1 วันเต็ม (${quota} กล่อง) ทุก ~${(quota / p.share).toFixed(1)} วัน`}
      </div>
      <div className="space-y-1 rounded bg-neutral-950/60 p-2 text-xs">
        {p.nodeReq.map((r) => (
          <div key={r.item.id} className="flex items-center gap-1.5">
            <ItemIcon id={r.item.id} size={18} title={r.item.name} />
            <span className="flex-1">
              {r.item.name} {qty(r.perCrate)}/กล่อง
            </span>
            <span className={p.limit?.item.id === r.item.id ? 'text-amber-300' : 'text-neutral-400'}>
              แผนให้ {qty(r.supply)}/วัน{p.limit?.item.id === r.item.id ? ' ← คอขวด' : ''}
            </span>
          </div>
        ))}
        {p.nodeReq.length === 0 && <div className="text-neutral-500">ไม่มีวัตถุดิบที่จำกัดด้วย node</div>}
      </div>
      {p.limit && p.suggest.length > 0 && p.cratesPerDay <= p.share + 1e-6 && (
        <div className="text-xs">
          <div className="text-neutral-400">เพิ่ม {p.limit.item.name} ได้จาก (หน้าผลผลิต ＋):</div>
          <ul className="mt-0.5 space-y-0.5 text-neutral-300">
            {p.suggest.map((s) => (
              <li key={s.pzk}>
                · {s.name} <span className="text-neutral-400">~{qty(s.perDay)}/วัน · {s.cp} CP</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ModeButtons id={p.dish.id} mode={mode} setMode={setMode} />
    </div>
  )
}

function ModeButtons({ id, mode, setMode }: { id: number; mode: Mode; setMode: (id: number, m: Mode) => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button className={`chip ${mode === 'active' ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'text-neutral-400'}`} onClick={() => setMode(id, mode === 'active' ? 'off' : 'active')}>
        {mode === 'active' ? '⭐ ใช้ในแผน' : '☆ ใช้'}
      </button>
      <button className={`chip ${mode === 'standby' ? 'border-sky-500 bg-sky-900/40 text-sky-200' : 'text-neutral-400'}`} onClick={() => setMode(id, mode === 'standby' ? 'off' : 'standby')}>
        {mode === 'standby' ? '⏸ พักไว้' : 'พัก'}
      </button>
    </div>
  )
}

function Row({ id, name, src, n, sub }: { id: number; name: string; src: string; n: number; sub?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <ItemIcon id={id} size={16} title={name} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-neutral-400">{src}</span>
      {sub && <span className="w-12 text-right text-neutral-500">{sub}</span>}
      <b className="w-12 text-right">{qty(n)}</b>
    </div>
  )
}
