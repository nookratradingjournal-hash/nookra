import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TutorialProvider } from './components/tutorial/TutorialContext'
import './index.css'

// Last-resort render guard — a thrown error inside the React tree would
// otherwise blank the window. This shows a recovery prompt instead so the
// user can reload without losing their persisted data in localStorage.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a0b', color: 'white',
          fontFamily: 'system-ui, sans-serif', padding: 24,
        }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>
              The app hit an unexpected error. Your data is safe — reload to continue.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TutorialProvider>
        <App />
      </TutorialProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
