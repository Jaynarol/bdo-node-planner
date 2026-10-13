# BDO Node Planner

วางแผนลง node คนงาน Black Desert (ASIA) — เว็บนิ่งล้วน ข้อมูลแผนเก็บใน localStorage ของเบราว์เซอร์ (export/import ไฟล์ได้ที่หน้าตั้งค่า)

## คำสั่ง

```bash
npm run dev            # http://localhost:3910
npm run sync:market    # อัปเดตราคาตลาด ASIA จาก bdolytics → public/data/market.json
npm run deploy         # ดึงราคาล่าสุด → build (out/) → push ขึ้น branch gh-pages
```

`deploy` ดึงราคาให้ทุกครั้งก่อน build — ถ้าดึงไม่สำเร็จจะหยุด ไม่ deploy ราคาเก่า (commit ไฟล์ `public/data/market.json` ที่เปลี่ยนตามได้)

## ตั้งค่า GitHub Pages ครั้งแรก

1. สร้าง repo ชื่อ `bdo-node-planner` (ชื่ออื่นได้ — แก้ `REPO` ใน `next.config.mjs`)
2. `git remote add origin …` แล้ว push branch หลัก
3. `npm run deploy` → ใน GitHub: Settings → Pages → Source = branch `gh-pages` / root

## ข้อมูล

- `data-src/` ข้อมูลเกมดิบ → `npm run build:data` รวมเป็น `public/data/game.json` (รันใหม่เมื่อแก้ data-src เท่านั้น)
- `public/tiles/` tile แผนที่
