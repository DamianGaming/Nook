// Nooky: the Nook mascot. A little arched alcove with a sprout on top, because a nook is a cosy corner.
// One component, a few moods. Colour version for big spots, white version for logo tiles.

const TONES = {
  color: { top: '#98a6ff', bottom: '#c996ff', limb: '#7f78e6', eye: '#161a33', cheek: '#ff8fb1', cheekOp: 0.5, leaf: '#6fe3b0', stem: '#4cc995' },
  white: { top: '#ffffff', bottom: '#e6e9ff', limb: '#c9cffa', eye: '#1b1f3a', cheek: '#ff9fc0', cheekOp: 0.6, leaf: '#9bf0cb', stem: '#6fdcae' },
}

function Eyes({ mood, c }) {
  if (mood === 'sleepy') {
    return (
      <g fill="none" stroke={c.eye} strokeWidth="2.6" strokeLinecap="round">
        <path d="M26.2 42.5q3.8 3.6 7.6 0" />
        <path d="M46.2 42.5q3.8 3.6 7.6 0" />
      </g>
    )
  }
  const big = mood === 'wow'
  const ry = big ? 5.8 : 4.9
  const rx = big ? 4.2 : 3.7
  const left = (
    <g>
      <ellipse cx="30" cy="42" rx={rx} ry={ry} fill={c.eye} />
      <circle cx="31.3" cy="40.2" r="1.3" fill="#fff" />
    </g>
  )
  const right =
    mood === 'wink' ? (
      <path d="M46.4 42.4q3.6-3.8 7.2 0" fill="none" stroke={c.eye} strokeWidth="2.6" strokeLinecap="round" />
    ) : (
      <g>
        <ellipse cx="50" cy="42" rx={rx} ry={ry} fill={c.eye} />
        <circle cx="51.3" cy="40.2" r="1.3" fill="#fff" />
      </g>
    )
  return <g className="m-eyes">{left}{right}</g>
}

function Mouth({ mood, c }) {
  const common = { fill: 'none', stroke: c.eye, strokeWidth: 2.8, strokeLinecap: 'round' }
  if (mood === 'wow') return <ellipse cx="40" cy="54" rx="3.2" ry="4" fill={c.eye} />
  if (mood === 'sleepy') return <ellipse cx="40" cy="53" rx="2.2" ry="2.6" fill={c.eye} />
  if (mood === 'oops') return <path d="M35 56.5q5-5 10 0" {...common} />
  if (mood === 'wink') return <path d="M34 50.5q6 8 12 0" {...common} />
  return <path d="M35 51q5 6 10 0" {...common} />
}

export default function Mascot({ mood = 'happy', size = 96, tone = 'color', animated = false, className = '', title }) {
  const c = TONES[tone] || TONES.color
  const gid = `m-body-${tone}`
  const wave = mood === 'wave'
  const m = wave ? 'happy' : mood
  return (
    <svg
      className={`mascot ${animated ? 'm-anim' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={c.top} />
          <stop offset="1" stopColor={c.bottom} />
        </linearGradient>
      </defs>
      {/* sprout */}
      <path d="M40 14.5V9.5" stroke={c.stem} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M40.6 10.5C40.6 4.6 44.6 1.4 51.4 1.8C51.6 8.2 47.4 11.6 40.6 10.5Z" fill={c.leaf} />
      <path d="M39.4 11.5C39.4 7.2 36.6 4.8 31.8 5.2C31.6 9.8 34.6 12.4 39.4 11.5Z" fill={c.leaf} opacity="0.8" />
      {/* feet */}
      <ellipse cx="30" cy="75.2" rx="7" ry="3.4" fill={c.limb} />
      <ellipse cx="50" cy="75.2" rx="7" ry="3.4" fill={c.limb} />
      {/* arms */}
      <ellipse cx="11.5" cy="56" rx="4" ry="6.4" fill={c.limb} transform="rotate(14 11.5 56)" />
      {wave ? (
        <g className="m-wave">
          <ellipse cx="70" cy="44" rx="4" ry="6.4" fill={c.limb} transform="rotate(30 70 44)" />
        </g>
      ) : (
        <ellipse cx="68.5" cy="56" rx="4" ry="6.4" fill={c.limb} transform="rotate(-14 68.5 56)" />
      )}
      {/* body: an arch */}
      <path d="M14 66V38a26 26 0 0 1 52 0v28a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8Z" fill={`url(#${gid})`} />
      <path d="M20 36a20 20 0 0 1 14-17" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      {/* face */}
      <circle cx="22" cy="51" r="4.4" fill={c.cheek} opacity={c.cheekOp} />
      <circle cx="58" cy="51" r="4.4" fill={c.cheek} opacity={c.cheekOp} />
      <Eyes mood={m} c={c} />
      <Mouth mood={m} c={c} />
      {mood === 'sleepy' && (
        <g className="m-z" fill="none" stroke={c.limb} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M63 15h7l-7 8h7" />
          <path d="M72 5h4.5l-4.5 5h4.5" opacity="0.7" />
        </g>
      )}
      {mood === 'oops' && <path d="M62 28c-2.4 3.4-3.6 5.6-3.6 7.4a3.6 3.6 0 0 0 7.2 0c0-1.8-1.2-4-3.6-7.4Z" fill="#8fd3ff" />}
    </svg>
  )
}

// Square logo tile: white mascot on the brand gradient. Used for the home button, sign-in and app icons.
export function Logo({ size = 32 }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: size * 0.3 }} aria-hidden="true">
      <Mascot tone="white" size={size * 0.82} />
    </span>
  )
}
