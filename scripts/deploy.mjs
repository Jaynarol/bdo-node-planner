/**
 * ดัน out/ ขึ้น branch gh-pages (GitHub Pages)
 * ใช้แทนแพ็กเกจ gh-pages — ตัวนั้นส่งชื่อไฟล์ทั้งหมดใน `git rm` คำสั่งเดียว แล้วพังบน Windows (spawn ENAMETOOLONG)
 * เพราะ tile แผนที่มีพันกว่าไฟล์
 * วิธี: สร้าง repo ชั่วคราวใน out/ → commit ทั้งโฟลเดอร์ → force push ไป gh-pages (branch นี้เก็บแค่ของ build ล่าสุด)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const git = (args, cwd = '.') => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()

if (!fs.existsSync('out/index.html')) throw new Error('ไม่เจอ out/ — build ไม่สำเร็จ?')
const remote = process.env.DEPLOY_REMOTE || git(['remote', 'get-url', 'origin'])
const src = git(['rev-parse', '--short', 'HEAD'])

fs.rmSync('out/.git', { recursive: true, force: true })
fs.writeFileSync('out/.nojekyll', '') // GitHub Pages ข้ามโฟลเดอร์ _next ถ้าไม่มีไฟล์นี้
git(['init', '-q', '-b', 'gh-pages'], 'out')
git(['add', '-A'], 'out')
git(['-c', 'user.name=' + git(['config', 'user.name']), '-c', 'user.email=' + git(['config', 'user.email']), 'commit', '-q', '-m', `deploy ${src} ${new Date().toISOString()}`], 'out')
console.log(`กำลัง push ไป ${remote} (gh-pages)…`)
execFileSync('git', ['push', '--force', remote, 'gh-pages'], { cwd: 'out', stdio: 'inherit' })
fs.rmSync('out/.git', { recursive: true, force: true })
console.log('✓ deploy เสร็จ — GitHub Pages อัปเดตภายในไม่กี่นาที')
