import Sidebar from '@/components/layout/Sidebar'
import TopNav from '@/components/layout/TopNav'
import TourOverlay from '@/components/tour/TourOverlay'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <TourOverlay />
    </div>
  )
}
