const PALETTE = [
  ['#7c8cff', '#c58cff'],
  ['#ff8fb1', '#ffb86b'],
  ['#4fd1c5', '#7c8cff'],
  ['#ffb86b', '#ff6b8a'],
  ['#7be0a0', '#4fd1c5'],
  ['#c58cff', '#ff8fb1'],
]

function pair(str) {
  let h = 0
  for (const c of str || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

import { memo } from 'react'
import { hexOr } from '../cosmetics.jsx'
import { usePresenceOf, usePlatformsOf, mainPlatform, PLATFORM } from '../presence.jsx'
import Icon from './Icon.jsx'

import { STATUS_COLOR as STATUS } from '../status.js'

function AvatarBase({ profile, size = 36, status = false }) {
  const presence = usePresenceOf(status ? profile?.id : null)
  const live = status && profile?.id ? presence : null
  const platforms = usePlatformsOf(status && profile?.id ? profile.id : null)
  const list = platforms ? platforms.split(',') : []
  const plat = live && live !== 'offline' && size >= 30 ? PLATFORM[mainPlatform(list)] : null
  const framed = profile?.frame && profile.frame !== 'none' && size >= 28
  const name = profile?.display_name || profile?.username || '?'
  const [a, b] = pair(profile?.username || name)
  const from = profile?.accent_color || a
  return (
    <span className="avatar" style={{ width: size, height: size, '--fw': `${Math.max(2, Math.round(size * 0.045))}px`, '--fg': `${Math.max(1, Math.round(size * 0.012))}px`, '--dd': live ? `${Math.max(10, size * 0.3) + 4}px` : undefined, '--fc': framed ? hexOr(profile.frame_color) : undefined }} data-frame={framed ? profile.frame : undefined} data-dot={framed && live ? '' : undefined}>
      <span className="avatar-face" style={{ background: `linear-gradient(135deg, ${from}, ${b})`, fontSize: size * 0.42 }}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" draggable="false" loading="lazy" decoding="async" />
        ) : (
          name.trim()[0]?.toUpperCase()
        )}
      </span>
      {live && plat ? (
        <span className={`status-dot plat s-${live}`} role="img" aria-label={`${live}, on ${list.map((p) => PLATFORM[p].label).join(' and ')}`} title={`${live[0].toUpperCase()}${live.slice(1)} on ${list.map((p) => PLATFORM[p].label.toLowerCase()).join(' and ')}`} style={{ background: STATUS[live], width: Math.max(14, size * 0.38), height: Math.max(14, size * 0.38) }}>
          <Icon name={plat.icon} size={Math.max(8, Math.round(size * 0.22))} />
        </span>
      ) : live ? (
        <span className={`status-dot s-${live}`} title={live} style={{ background: STATUS[live], width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3) }} />
      ) : null}
    </span>
  )
}

const Avatar = memo(AvatarBase)
export default Avatar

export const GroupIcon = memo(function GroupIcon({ group, size = 40 }) {
  const name = group?.name || '?'
  const [a, b] = pair(name)
  return (
    <span className="group-icon" style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {group?.icon_url ? <img src={group.icon_url} alt="" draggable="false" loading="lazy" decoding="async" /> : name.trim()[0]?.toUpperCase()}
    </span>
  )
})
