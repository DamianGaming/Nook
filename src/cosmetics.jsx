import { memo } from 'react'
// Profile style options. The ids here must match the check constraints in supabase/update_v9.sql and update_v10.sql.
export const FRAMES = [
  ['none', 'None'], ['ring', 'Ring'], ['gold', 'Gold'], ['neon', 'Neon'], ['rainbow', 'Rainbow'],
  ['candy', 'Candy'], ['ice', 'Ice'], ['sunset', 'Sunset'], ['dashed', 'Orbit'], ['pulse', 'Pulse'],
]
// Frames that take your own colour. The others are fixed multi-colour designs.
export const TINTABLE = new Set(['ring', 'neon', 'dashed', 'pulse'])
export const NAME_FONTS = [
  ['default', 'Figtree'], ['round', 'Soft'], ['serif', 'Serif'], ['mono', 'Mono'], ['bold', 'Heavy'],
]
export const CARD_THEMES = [
  ['default', 'Your banner', ['#3b4270', '#262a40']],
  ['aurora', 'Aurora', ['#2f7d8f', '#6b4fa0']],
  ['sunset', 'Sunset', ['#b05f2a', '#a03b52']],
  ['ocean', 'Ocean', ['#2f6f8f', '#1f2a44']],
  ['mint', 'Mint', ['#2f7d5b', '#2c8a8a']],
  ['candy', 'Candy', ['#a03b8f', '#6b4fa0']],
  ['night', 'Night', ['#1f2a44', '#14161f']],
]
export const themeColors = (id) => CARD_THEMES.find((t) => t[0] === id)?.[2] || null

const HEX = /^#[0-9a-fA-F]{6}$/
export const hexOr = (v) => (HEX.test(v || '') ? v : undefined)

/* A person's name in their colour, as a gradient when they picked a second colour, and in their chosen font. */
export const Name = memo(function Name({ profile, className = '', as: Tag = 'span' }) {
  const text = profile?.display_name || profile?.username || ''
  const c2 = hexOr(profile?.name_color2)
  return (
    <Tag
      className={`nm ${className}`}
      data-ns={c2 ? 'gradient' : undefined}
      data-nf={profile?.name_font && profile.name_font !== 'default' ? profile.name_font : undefined}
      style={{ '--nc': profile?.accent_color, '--nc2': c2 }}
    >
      {text}
    </Tag>
  )
})
