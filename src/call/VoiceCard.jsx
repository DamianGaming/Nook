import Avatar from '../components/Avatar.jsx'
import { Name } from '../cosmetics.jsx'
import Icon from '../components/Icon.jsx'
import { useCall } from './CallProvider.jsx'

/* The group's voice room, shown at the top of the group's sidebar: who is in, and one button to join or leave. */
export default function VoiceCard({ spec, ids, memberById }) {
  const c = useCall()
  const mine = c.active?.key === spec.key
  const people = mine
    ? c.parts.map((p) => ({
        id: p.id,
        name: p.isLocal ? `${p.name} (you)` : p.name,
        profile: { id: p.id, username: p.name, display_name: p.name, avatar_url: p.meta?.a, accent_color: p.meta?.c, frame: p.meta?.f, frame_color: p.meta?.fc, name_color2: p.meta?.n2, name_font: p.meta?.nf },
        speaking: p.speaking, mic: p.mic, deaf: p.deaf, live: Boolean(p.screen),
      }))
    : ids.map((uid) => {
        const pr = memberById[uid]
        return { id: uid, name: pr?.display_name || pr?.username || 'Someone', profile: pr }
      })
  return (
    <div className={`voice-card ${mine ? 'live' : ''} ${people.length ? 'busy' : ''}`}>
      <div className="voice-head">
        <span className="voice-ico-wrap"><Icon name="headphones" size={15} /></span>
        <strong>Voice</strong>
        <span className="muted tiny">{people.length ? `${people.length} in call` : 'Nobody here yet'}</span>
      </div>
      {people.length > 0 && (
        <div className="voice-list">
          {people.map((p) => (
            <div className={`voice-person ${p.speaking ? 'speaking' : ''}`} key={p.id}>
              <Avatar profile={p.profile} size={24} />
              <span className="ellipsis"><Name profile={{ ...p.profile, display_name: p.name }} /></span>
              {p.live && <span className="live-pill static">LIVE</span>}
              {p.deaf ? <Icon name="headphonesoff" size={13} className="state-ico" /> : mine && !p.mic ? <Icon name="micoff" size={13} className="state-ico" /> : null}
            </div>
          ))}
        </div>
      )}
      {mine ? (
        <button className="ghost small danger voice-btn" onClick={c.leave}><Icon name="phoneoff" size={14} /> Leave voice</button>
      ) : (
        <button className="primary small voice-btn" onClick={() => c.join(spec)}><Icon name="headphones" size={14} /> Join voice</button>
      )}
    </div>
  )
}
