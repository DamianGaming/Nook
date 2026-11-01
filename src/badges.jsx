import { memo } from 'react'
import Icon from './components/Icon.jsx'

// Badges come in two kinds. "Given" badges are stored on the profile and can only be handed out by you in the
// Supabase SQL editor (see README). "Automatic" badges are worked out from the profile itself.
export const BADGES = {
  staff: { label: 'Nook Staff', desc: 'Official member of the Nook staff', color: '#8b9bff', icon: 'leaf', official: true },
  team: { label: 'Nook Team', desc: 'Helps build and look after Nook', color: '#7c8cff', icon: 'shield' },
  early: { label: 'Early Nooker', desc: 'Here from the very start', color: '#ffb86b', icon: 'sparkle' },
  supporter: { label: 'Supporter', desc: 'Helps keep Nook free', color: '#ff8fb1', icon: 'heart' },
  bughunter: { label: 'Bug Hunter', desc: 'Found and reported a bug', color: '#7be0a0', icon: 'flag' },
  creator: { label: 'Creator', desc: 'Makes things for the community', color: '#c58cff', icon: 'star' },
  sprout: { label: 'Fresh Sprout', desc: 'Joined in the last two weeks', color: '#7be0a0', icon: 'leaf' },
  year: { label: 'One Year In', desc: 'Has been around for a year or more', color: '#4fd1c5', icon: 'clock' },
  allset: { label: 'All Set Up', desc: 'Picture, banner and bio all done', color: '#ffd36b', icon: 'check' },
  mod: { label: 'Moderator', desc: 'Keeps Nook friendly and safe', color: '#6fb7ff', icon: 'shield' },
  partner: { label: 'Partner', desc: 'Works with the Nook team', color: '#f472b6', icon: 'users' },
  tester: { label: 'Tester', desc: 'Tries new things before everyone else', color: '#a3e635', icon: 'settings' },
  translator: { label: 'Translator', desc: 'Helps Nook speak your language', color: '#4fd1c5', icon: 'message' },
  champion: { label: 'Champion', desc: 'Went above and beyond for the community', color: '#ffd36b', icon: 'crown' },
  month: { label: 'One Month In', desc: 'Has been around for a month', color: '#6fb7ff', icon: 'clock' },
  halfyear: { label: 'Six Months In', desc: 'Has been around for half a year', color: '#c58cff', icon: 'clock' },
  linked: { label: 'Well Connected', desc: 'Added a link to their profile', color: '#94a3b8', icon: 'link' },
  styled: { label: 'Stylish', desc: 'Dressed up their profile with a frame or name style', color: '#ff8fb1', icon: 'sparkle' },
  storyteller: { label: 'Storyteller', desc: 'Wrote a proper bio', color: '#ffb86b', icon: 'pencil' },
  founder: { label: 'Founder', desc: 'Founder of this group', color: '#ffb86b', icon: 'crown' },
}

const DAY = 86400000

export function badgeIds(profile, { founder = false } = {}) {
  if (!profile) return []
  const ids = [...(profile.badges || []).filter((b) => BADGES[b])]
  if (founder) ids.push('founder')
  const age = Date.now() - new Date(profile.created_at || Date.now()).getTime()
  if (age < 14 * DAY) ids.push('sprout')
  if (age >= 365 * DAY) ids.push('year')
  else if (age >= 180 * DAY) ids.push('halfyear')
  else if (age >= 30 * DAY) ids.push('month')
  if (Array.isArray(profile.socials) && profile.socials.length) ids.push('linked')
  if ((profile.frame && profile.frame !== 'none') || profile.name_color2) ids.push('styled')
  if ((profile.bio || '').length >= 100) ids.push('storyteller')
  if (profile.avatar_url && profile.banner_url && profile.bio) ids.push('allset')
  const seen = [...new Set(ids)]
  return seen.sort((a, b) => (RANK.indexOf(a) + 1 || 99) - (RANK.indexOf(b) + 1 || 99))
}

// Most important first: official badges, then given badges, then the ones that are worked out automatically.
const RANK = ['staff', 'team', 'mod', 'partner', 'champion', 'founder', 'creator', 'supporter', 'bughunter', 'tester', 'translator', 'early']

export const BadgeRow = memo(function BadgeRow({ profile, founder, size = 22, max = 10, labels = false }) {
  const all = badgeIds(profile, { founder })
  if (!all.length) return null
  const shown = all.slice(0, max)
  const hidden = all.slice(max)
  return (
    <span className={`badge-row ${labels ? 'labelled' : ''}`}>
      {shown.map((id) => {
        const b = BADGES[id]
        const cls = `${labels ? 'pbadge-pill' : 'pbadge'} ${b.official ? 'official' : ''}`
        return (
          <span key={id} className={cls} style={{ '--bc': b.color, ...(labels ? {} : { width: size, height: size }) }} title={`${b.label}: ${b.desc}`} role="img" aria-label={b.label}>
            <Icon name={b.icon} size={labels ? 13 : size * 0.6} />
            {labels && <span>{b.label}</span>}
          </span>
        )
      })}
      {hidden.length > 0 && (
        <span className={labels ? 'pbadge-pill more' : 'pbadge more'} style={labels ? undefined : { width: 'auto', minWidth: size, height: size }} title={hidden.map((id) => BADGES[id].label).join(', ')} role="img" aria-label={`${hidden.length} more badges`}>+{hidden.length}</span>
      )}
    </span>
  )
})
