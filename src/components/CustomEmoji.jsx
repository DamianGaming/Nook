import { useEffect } from 'react'
import { useCustomEmoji, resolveCustom } from '../emoji.js'

/* A custom emoji inside a message. Shows its name until the picture is known. */
export default function CustomEmoji({ id, name }) {
  const { byId } = useCustomEmoji()
  const e = byId.get(id)
  useEffect(() => { if (!e) resolveCustom([id]) }, [id, e])
  if (!e?.url) return <span className="cemoji-miss" title={e?.missing ? 'This emoji was removed' : undefined}>:{name}:</span>
  return <img className="cemoji" src={e.url} alt={`:${name}:`} title={`:${name}:`} loading="lazy" decoding="async" draggable="false" />
}
