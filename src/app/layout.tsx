import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import { AppProvider } from '@/lib/app'
import './globals.css'

export const metadata: Metadata = {
  title: 'BDO Node Planner',
  description: 'วางแผนลง node คนงาน Black Desert (ASIA) — เก็บข้อมูลในเบราว์เซอร์',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <div className="flex min-h-screen flex-col">
          <Nav />
          <main className="flex flex-1 flex-col">
            <AppProvider>{children}</AppProvider>
          </main>
        </div>
      </body>
    </html>
  )
}
