import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/* Tells people when they are offline, and when the connection is back. Chats refresh themselves on the "online" event. */
export default function ConnectionBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [back, setBack] = useState(false)
  const timer = useRef(0)
  useEffect(() => {
    const off = () => { clearTimeout(timer.current); setBack(false); setOnline(false) }
    const on = () => { setOnline(true); setBack(true); clearTimeout(timer.current); timer.current = setTimeout(() => setBack(false), 2500) }
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); clearTimeout(timer.current) }
  }, [])
  if (online && !back) return null
  return (
    <div className={`conn-banner ${online ? 'ok' : 'down'}`} role="status" aria-live="polite">
      <Icon name={online ? 'check' : 'wifioff'} size={14} />
      {online ? 'Back online' : 'You are offline. Saved messages are shown and sending is paused until you reconnect.'}
    </div>
  )
}
