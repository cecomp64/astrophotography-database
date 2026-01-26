import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ObjectsPage from './pages/ObjectsPage'
import ObjectDetailPage from './pages/ObjectDetailPage'
import ImagesPage from './pages/ImagesPage'
import ImageDetailPage from './pages/ImageDetailPage'
import IndexerPage from './pages/IndexerPage'
import CataloguePage from './pages/CataloguePage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectDetailPage />} />
        <Route path="/images" element={<ImagesPage />} />
        <Route path="/images/:id" element={<ImageDetailPage />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/indexer" element={<IndexerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

export default App
