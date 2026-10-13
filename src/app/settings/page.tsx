'use client'
import { useRef, useState } from 'react'
import { useApp } from '@/lib/app'
import { DEFAULT_STATE, normalizeState, type Settings } from '@/lib/state'

/** ตั้งค่า + export/import ไฟล์แผน (ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น — export ไว้กันหาย/ย้ายเครื่อง) */
export default function SettingsPage() {
  const { state, update, game } = useApp()
  const s = state.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (patch: Partial<Settings>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }))
  const setW = (w: 'goblin' | 'giant', k: 'wspd' | 'mspd', v: number) =>
    update((st) => ({ ...st, settings: { ...st.settings, workers: { ...st.settings.workers, [w]: { ...st.settings.workers[w], [k]: v } } } }))

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bdo-node-plan-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importFile = async (f: File) => {
    try {
      const st = normalizeState(JSON.parse(await f.text()))
      if (!confirm(`นำเข้าแผน ${st.picks.length} จุด แทนของเดิมทั้งหมด?`)) return
      update(() => st)
      setMsg(`✓ นำเข้าแล้ว (${st.picks.length} จุด)`)
    } catch (e) {
      setMsg(`นำเข้าไม่สำเร็จ: ${String(e)}`)
    }
  }

  const Num = ({ label, value, onChange, step = 1, note }: { label: string; value: number; onChange: (v: number) => void; step?: number; note?: string }) => (
    <label className="flex items-center justify-between gap-3">
      <span>
        {label}
        {note && <span className="block text-xs text-neutral-500">{note}</span>}
      </span>
      <input
        type="number"
        step={step}
        defaultValue={value}
        key={value}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== value) onChange(v)
        }}
        className="w-28 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right"
      />
    </label>
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 text-sm">
      <section className="card space-y-2">
        <h2 className="font-semibold text-amber-300">แผน</h2>
        <Num label="CP ที่ใช้กับ node ได้" value={s.cpTotal} onChange={(v) => set({ cpTotal: v })} />
        <Num
          label="มูลค่าขั้นต่ำ/CP/วัน"
          note="✨ เติมอัตโนมัติไม่ลงจุดที่ รายได้ ÷ CP ส่วนเพิ่ม ต่ำกว่านี้ · 0 = ไม่กรอง · ใช้แลกระยะเดินด้วย (0 = ยอม 1 CP ต่อรายได้ +1M/วัน)"
          value={s.minPerCp}
          step={100000}
          onChange={(v) => set({ minPerCp: v })}
        />
        <label className="flex items-center justify-between gap-3">
          <span>
            นับมูลค่าราชวัง/แปรธาตุตอนเลือกจุด
            <span className="block text-xs text-neutral-500">
              เปิด = ของ node ที่ใช้ในอาหารราชวัง/แปรธาตุที่เลือกทำ ได้ตีค่าตามนั้น (ขั้นบันไดตามโควต้า) · ปิด = แปรรูปคุ้มสุด ไม่งั้นขายดิบ
            </span>
          </span>
          <input type="checkbox" className="h-5 w-5" checked={s.countTiers} onChange={(e) => set({ countTiers: e.target.checked })} />
        </label>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold text-amber-300">คนงานค่าตั้งต้น</h2>
        <p className="text-xs text-neutral-500">ทุกจุดเลือกสายที่รายได้ดีกว่าให้อัตโนมัติ · ล็อกสาย/แก้ความเร็วรายจุดได้ที่หน้าแผนที่ (กด node)</p>
        {(['goblin', 'giant'] as const).map((w) => (
          <div key={w} className="grid grid-cols-2 gap-3">
            <Num label={`${w === 'goblin' ? 'Goblin' : 'ยักษ์'} เร็วงาน`} value={s.workers[w].wspd} onChange={(v) => setW(w, 'wspd', v)} />
            <Num label="เร็วเดิน" step={0.1} value={s.workers[w].mspd} onChange={(v) => setW(w, 'mspd', v)} />
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold text-amber-300">ราชวัง / แปรธาตุ</h2>
        <Num label="ความชำนาญทำอาหาร" value={s.cookMastery} onChange={(v) => set({ cookMastery: v })} />
        <Num label="ความชำนาญแปรธาตุ" value={s.alchMastery} onChange={(v) => set({ alchMastery: v })} />
        <Num label="โควต้ากล่อง/วัน" value={s.quota} onChange={(v) => set({ quota: v })} />
        <Num label="ตัวคูณราคาที่ NPC แสดง (%)" value={s.priceMultPct} onChange={(v) => set({ priceMultPct: v })} />
        <Num label="ปลูกได้กี่ลูก/แปลง/วัน" note="ไว้ประมาณจำนวนแปลงชั้นหนึ่ง" value={s.plotYield} onChange={(v) => set({ plotYield: v })} />
        <label className="flex items-center justify-between gap-3">
          <span>ระดับกล่องที่คิด</span>
          <select
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
            value={s.imperialTiers}
            onChange={(e) => set({ imperialTiers: e.target.value as Settings['imperialTiers'] })}
          >
            <option value="both">ลือชื่อ + เซียน</option>
            <option value="master">ลือชื่อ</option>
            <option value="guru">เซียน</option>
          </select>
        </label>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold text-amber-300">ข้อมูล</h2>
        <p className="text-xs text-neutral-500">
          แผนเก็บในเบราว์เซอร์นี้ (localStorage) — ล้างข้อมูลเว็บ/เปลี่ยนเครื่องแล้วหาย ให้ export ไฟล์เก็บไว้ · ราคาตลาด{' '}
          {new Date(game.marketAt).toLocaleString('th-TH')} · ข้อมูลเกม {new Date(game.builtAt).toLocaleDateString('th-TH')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportFile}>
            ⬇ Export ไฟล์
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Import ไฟล์
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <span className="flex-1" />
          <button
            className="btn"
            onClick={() => {
              if (confirm('รีเซ็ตทุกอย่าง (แผน + ตั้งค่า + ราชวัง/แปรธาตุ) กลับค่าเริ่มต้น?')) update(() => DEFAULT_STATE)
            }}
          >
            ↺ รีเซ็ตทั้งหมด
          </button>
        </div>
        {msg && <div className="text-sky-300">{msg}</div>}
      </section>
    </div>
  )
}
