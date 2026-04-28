import { AdminPanel } from './components/admin/AdminPanel'

export default function AdminApp() {
  return <AdminPanel onClose={() => window.close()} />
}
