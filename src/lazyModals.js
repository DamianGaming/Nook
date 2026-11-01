import { lazy } from 'react'

// Dialogs are only needed after a click, so they load on demand and keep the first load small.
const load = (name) => lazy(() => import('./components/Modals.jsx').then((m) => ({ default: m[name] })))

export const ProfileEditor = load('ProfileEditor')
export const ProfileCard = lazy(() => import('./components/ProfileUI.jsx').then((m) => ({ default: m.ProfileCard })))
export const UserMenu = lazy(() => import('./components/ProfileUI.jsx').then((m) => ({ default: m.UserMenu })))
export const GroupModal = load('GroupModal')
export const Friends = lazy(() => import('./components/Friends.jsx'))
export const GroupSettings = load('GroupSettings')
export const ChannelSettings = load('ChannelSettings')
export const AdminPanel = lazy(() => import('./components/AdminPanel.jsx'))
export const RulesModal = load('RulesModal')
export const VoiceSettings = lazy(() => import('./components/VoiceSettings.jsx'))

// Warm the chunks people open most once the app is idle, so the first click is instant.
export function prefetchModals() {
  const go = () => {
    import('./components/Modals.jsx')
    import('./components/ProfileUI.jsx')
    import('./components/Friends.jsx')
    // The call library is the biggest piece; fetching it now makes the first call start much faster.
    const slow = navigator.connection && (navigator.connection.saveData || /(^|-)2g$/.test(navigator.connection.effectiveType || ''))
    if (!slow) setTimeout(() => import('livekit-client'), 3000)
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 5000 })
  else setTimeout(go, 2500)
}
