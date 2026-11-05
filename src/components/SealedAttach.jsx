import { Suspense, lazy, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import AudioPlayer from './AudioPlayer.jsx'
import { openFile } from '../e2ee.js'

const VideoPlayer = lazy(() => import('./VideoPlayer.jsx'))

/* An attachment from an encrypted direct message: downloaded as scrambled bytes, unscrambled on this device, then shown. */
export default function SealedAttach({ a, onLoad, onOpenImage }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    setUrl(null)
    setErr(false)
    ;(a.plain ? Promise.resolve(a.u) : openFile(a)).then((u) => live && setUrl(u)).catch(() => live && setErr(true))
    return () => { live = false }
  }, [a.u, a.k, a.i, a.m, a.plain])
  const kind = (a.m || '').split('/')[0]
  if (err) return <div className="attach-err"><Icon name="alert" size={14} /> This attachment could not be opened.</div>
  if (!url) return <div className="attach attach-skel" aria-busy="true"><span className="muted tiny"><Icon name="lock" size={12} /> Decrypting…</span></div>
  if (kind === 'video') return <div className="attach attach-video"><Suspense fallback={<div className="vp vp-skel" />}><VideoPlayer src={url} name={a.n} onReady={onLoad} /></Suspense></div>
  if (kind === 'audio') return <div className="attach attach-audio"><AudioPlayer src={url} voice={Boolean(a.v)} title={a.v ? '' : a.n?.replace(/\.[^.]+$/, '')} seconds={a.d} /></div>
  return (
    <button className="attach" onClick={() => onOpenImage(url)} aria-label="Open image">
      <img src={url} alt={a.n || 'Attached'} decoding="async" draggable="false" onLoad={onLoad} />
    </button>
  )
}
