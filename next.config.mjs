/**
 * เว็บนิ่งล้วน (output: export) → deploy ขึ้น GitHub Pages ด้วย `npm run deploy`
 * เว็บอยู่ที่ <user>.github.io/<REPO> — ถ้าตั้งชื่อ repo อื่น แก้ REPO บรรทัดเดียว
 */
const REPO = 'bdo-node-planner'
const basePath = process.env.NODE_ENV === 'production' ? `/${REPO}` : ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
