# BDO Node Planner

วางแผนลง node คนงาน Black Desert (ASIA) — เว็บนิ่งล้วน ข้อมูลแผนเก็บใน localStorage ของเบราว์เซอร์ (export/import ไฟล์ได้ที่หน้าตั้งค่า)

## คำสั่ง

```bash
npm run dev            # http://localhost:3910
npm run sync:market    # อัปเดตราคาตลาด ASIA จาก bdolytics → public/data/market.json
npm run deploy         # build (out/) แล้ว push ขึ้น branch gh-pages (scripts/deploy.mjs)
```

อัปเดตราคา: `npm run sync:market` → commit → `npm run deploy`

## ตั้งค่า GitHub Pages ครั้งแรก

1. สร้าง repo ชื่อ `bdo-node-planner` (ชื่ออื่นได้ — แก้ `REPO` ใน `next.config.mjs`)
2. `git remote add origin …` แล้ว push branch หลัก
3. `npm run deploy` → ใน GitHub: Settings → Pages → Source = branch `gh-pages` / root

## ข้อมูล

- `data-src/` ข้อมูลเกมดิบ → `npm run build:data` รวมเป็น `public/data/game.json` (รันใหม่เมื่อแก้ data-src เท่านั้น)
- `public/tiles/` tile แผนที่
