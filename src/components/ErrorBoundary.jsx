import React from 'react'
import { reportError } from '../errorReport.js'

export default class ErrorBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { reportError(Object.assign(error, { stack: `${error?.stack || ''}\n${info?.componentStack || ''}` }), 'render') }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <h2>Something went wrong</h2>
          <p style={{ opacity: 0.7 }}>The problem has been reported. Reloading usually fixes it.</p>
          <button onClick={() => location.reload()}>Reload Nook</button>
        </div>
      </div>
    )
  }
}
