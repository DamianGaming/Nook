/* Avatar decorations: small drawings that sit on or around the picture. Drawn on a 140 x 140 canvas where the
   picture is the circle in the middle (centre 50,50, radius 50), so every decoration scales with the avatar. */
const gold = '#ffd36b'
const goldDark = '#b9790c'

export const DECOS = [
  ['none', 'None'],
  ['crown', 'Crown'],
  ['halo', 'Halo'],
  ['ears', 'Cat ears'],
  ['sprout', 'Sprout'],
  ['bow', 'Bow'],
  ['antenna', 'Antenna'],
  ['sparkles', 'Sparkles'],
  ['hearts', 'Hearts'],
  ['wreath', 'Wreath'],
]

const star = (x, y, r, fill, key) => (
  <path key={key} d={`M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r}Z`} fill={fill} />
)
const heart = (x, y, s, fill, key) => (
  <path key={key} transform={`translate(${x} ${y}) scale(${s})`} d="M0 6 C-10 -2 -6 -10 0 -4 C6 -10 10 -2 0 6Z" fill={fill} stroke="#fff" strokeWidth="1.2" />
)

const ART = {
  crown: (
    <g strokeLinejoin="round">
      <path d="M26 14 L30 -6 L42 6 L50 -10 L58 6 L70 -6 L74 14 Q50 20 26 14Z" fill={gold} stroke={goldDark} strokeWidth="3" />
      <circle cx="30" cy="-7" r="3" fill="#ff6b8a" /><circle cx="50" cy="-11" r="3.4" fill="#6fb7ff" /><circle cx="70" cy="-7" r="3" fill="#ff6b8a" />
    </g>
  ),
  halo: (
    <g fill="none">
      <ellipse cx="50" cy="-4" rx="26" ry="8" stroke="#fff2b0" strokeWidth="7" opacity="0.5" />
      <ellipse cx="50" cy="-4" rx="26" ry="8" stroke={gold} strokeWidth="4" />
    </g>
  ),
  ears: (
    <g strokeLinejoin="round" strokeWidth="3">
      <path d="M10 28 L12 -10 L42 6 Z" fill="#4b4f6b" stroke="#2c2f45" /><path d="M16 22 L17 -1 L34 8 Z" fill="#ff8fb1" />
      <path d="M90 28 L88 -10 L58 6 Z" fill="#4b4f6b" stroke="#2c2f45" /><path d="M84 22 L83 -1 L66 8 Z" fill="#ff8fb1" />
    </g>
  ),
  sprout: (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M50 8 Q50 -4 50 -12" stroke="#3f9b63" strokeWidth="4" fill="none" />
      <path d="M50 -4 Q34 -8 28 -22 Q46 -22 50 -4Z" fill="#7be0a0" stroke="#3f9b63" strokeWidth="2.5" />
      <path d="M50 -10 Q66 -12 74 -28 Q54 -30 50 -10Z" fill="#a8f0c0" stroke="#3f9b63" strokeWidth="2.5" />
    </g>
  ),
  bow: (
    <g strokeLinejoin="round" strokeWidth="2.5" stroke="#d6457a">
      <path d="M70 12 L50 2 L52 28 Z" fill="#ff8fb1" transform="translate(18 -4) rotate(18 60 14)" />
      <path d="M70 12 L90 2 L88 28 Z" fill="#ff8fb1" transform="translate(18 -4) rotate(18 60 14)" />
      <circle cx="87" cy="10" r="6.5" fill="#ff5d8f" />
    </g>
  ),
  antenna: (
    <g strokeLinecap="round">
      <path d="M50 6 Q46 -10 54 -22" fill="none" stroke="#8b9bff" strokeWidth="4" />
      <circle cx="54" cy="-24" r="7" fill="#ff8fb1" stroke="#fff" strokeWidth="2.5" />
    </g>
  ),
  sparkles: (
    <g>
      {star(6, 18, 12, '#fff2b0', 'a')}{star(98, 8, 9, '#ffd36b', 'b')}{star(112, 62, 11, '#fff', 'c')}
      {star(-6, 74, 8, '#c58cff', 'd')}{star(92, 112, 12, '#fff2b0', 'e')}{star(14, 110, 7, '#7cc4ff', 'f')}
    </g>
  ),
  hearts: (
    <g>
      {heart(4, 20, 1.5, '#ff6b8a', 'a')}{heart(102, 14, 1.2, '#ff8fb1', 'b')}{heart(112, 90, 1.6, '#ff5d8f', 'c')}{heart(-4, 84, 1.1, '#ffb0c8', 'd')}
    </g>
  ),
  wreath: (
    <g strokeLinecap="round">
      <circle cx="50" cy="50" r="56" fill="none" stroke="#3f9b63" strokeWidth="5" strokeDasharray="14 7" />
      <circle cx="50" cy="50" r="56" fill="none" stroke="#7be0a0" strokeWidth="2.5" strokeDasharray="6 15" strokeDashoffset="4" />
      <circle cx="12" cy="86" r="4" fill="#ff6b8a" /><circle cx="88" cy="86" r="4" fill="#ff6b8a" /><circle cx="50" cy="106" r="4" fill="#ffd36b" />
    </g>
  ),
}

export function Deco({ id }) {
  const art = ART[id]
  if (!art) return null
  return <svg className="deco" viewBox="-20 -20 140 140" aria-hidden="true" focusable="false">{art}</svg>
}
