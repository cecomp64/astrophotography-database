/**
 * Sync page for PWA - full page for database sync settings.
 */
import SyncSettings from '../components/SyncSettings'

export default function SyncPage() {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Sync Database</h1>
      <SyncSettings />
    </div>
  )
}
