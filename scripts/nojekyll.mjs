// GitHub Pages (Jekyll) ข้ามโฟลเดอร์ที่ขึ้นต้นด้วย _ เช่น _next — ไฟล์นี้สั่งให้ไม่ข้าม
import fs from 'node:fs'
fs.writeFileSync('out/.nojekyll', '')
console.log('out/.nojekyll ✓')
