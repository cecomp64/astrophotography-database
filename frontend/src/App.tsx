import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ObjectsPage from './pages/ObjectsPage'
import ObjectDetailPage from './pages/ObjectDetailPage'
import ImagesPage from './pages/ImagesPage'
import IndexerPage from './pages/IndexerPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectDetailPage />} />
        <Route path="/images" element={<ImagesPage />} />
        <Route path="/indexer" element={<IndexerPage />} />
      </Routes>
    </Layout>
  )
}

export default App
