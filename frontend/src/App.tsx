import { Routes, Route, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ObjectsPage from './pages/ObjectsPage'
import ObjectDetailPage from './pages/ObjectDetailPage'
import ImagesPage from './pages/ImagesPage'
import ImageDetailPage from './pages/ImageDetailPage'
import IndexerPage from './pages/IndexerPage'
import CataloguePage from './pages/CataloguePage'
import SettingsPage from './pages/SettingsPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import { isPwaMode } from './pwa/hooks/usePwaMode'
import SyncPage from './pwa/pages/SyncPage'
import SyncPrompt from './pwa/components/SyncPrompt'
import { useOfflineDb } from './pwa/context/OfflineDbContext'

function PwaGate({ children }: { children: React.ReactNode }) {
  const { isReady, isLoading } = useOfflineDb()
  const location = useLocation()

  // Always allow access to sync page
  if (location.pathname === '/sync') {
    return <>{children}</>
  }

  // Show sync prompt if no database is ready
  if (!isReady && !isLoading) {
    return <SyncPrompt />
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-400">Loading database...</p>
      </div>
    )
  }

  return <>{children}</>
}

function AppRoutes() {
  const pwa = isPwaMode()

  const routes = (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
      <Route path="/objects" element={<ObjectsPage />} />
      <Route path="/objects/:id" element={<ObjectDetailPage />} />
      <Route path="/images" element={<ImagesPage />} />
      <Route path="/images/:id" element={<ImageDetailPage />} />
      <Route path="/catalogue" element={<CataloguePage />} />
      {!pwa && <Route path="/indexer" element={<IndexerPage />} />}
      {pwa && <Route path="/sync" element={<SyncPage />} />}
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )

  // In PWA mode, wrap routes with the database gate
  if (pwa) {
    return <PwaGate>{routes}</PwaGate>
  }

  return routes
}

function App() {
  return (
    <Layout>
      <AppRoutes />
    </Layout>
  )
}

export default App
