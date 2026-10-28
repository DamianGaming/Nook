import Icon from './Icon.jsx'

/* A channel's picture, symbol, or the default # (or megaphone for read-only channels). */
export default function ChanIcon({ c, size = 15 }) {
  if (c?.icon_url) return <img className="chan-img" src={c.icon_url} alt="" width={size + 3} height={size + 3} loading="lazy" decoding="async" draggable="false" />
  if (c?.icon) return <span className="chan-glyph" style={{ fontSize: size }}>{c.icon}</span>
  return <Icon name={c?.read_only ? 'megaphone' : 'hash'} size={size} />
}
