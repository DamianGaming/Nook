import { useState } from 'react'
import CustomEmoji from './components/CustomEmoji.jsx'

/* Message formatting (Discord-style markdown). Everything becomes React elements, never raw HTML.
   Inline:  **bold**  *italic*  _italic_  __underline__  ~~strike~~  ||spoiler||  `code`  [text](https://link)  links  @mentions  emoji
   Blocks:  ```code```  > quote  # heading (1 to 3)  - list / * list / 1. list  --- line */

const INLINE = new RegExp([
  '`([^`\\n]+)`',                                              // 1 code
  '\\[([^\\]\\n]{1,100})\\]\\((https?:\\/\\/[^\\s)]+)\\)',           // 2,3 masked link
  '(https?:\\/\\/[^\\s<]+)',                                       // 4 link
  '(<e:[0-9a-f-]{36}:[a-z0-9_]{2,32}>)',                         // 5 custom emoji
  '((?<![A-Za-z0-9_])@[A-Za-z0-9_]{2,24})',                      // 6 mention
  '\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*',                                // 7 bold
  '__(?=\\S)(.+?)(?<=\\S)__',                                    // 8 underline
  '~~(?=\\S)(.+?)(?<=\\S)~~',                                    // 9 strike
  '\\|\\|(?=\\S)(.+?)(?<=\\S)\\|\\|',                                // 10 spoiler
  '\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*',                            // 11 italic *
  '(?<![A-Za-z0-9_])_(?=[^\\s_])(.+?)(?<=[^\\s_])_(?![A-Za-z0-9_])', // 12 italic _
].join('|'), 'g')

export function Spoiler({ children }) {
  const [shown, setShown] = useState(false)
  return (
    <span className={`spoiler ${shown ? 'shown' : ''}`} role="button" tabIndex={0} aria-label={shown ? undefined : 'Spoiler, press to show'}
      onClick={(e) => { if (!shown) { e.preventDefault(); e.stopPropagation(); setShown(true) } }}
      onKeyDown={(e) => { if (!shown && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setShown(true) } }}>
      {children}
    </span>
  )
}

const trimUrl = (u) => {
  let url = u
  let tail = ''
  const m = /[.,;:!?'")\]]+$/.exec(url)
  if (m) { tail = m[0]; url = url.slice(0, -tail.length) }
  // keep a closing bracket that belongs to the address, like wikipedia links
  if (tail.startsWith(')') && (url.match(/\(/g) || []).length > (url.match(/\)/g) || []).length) { url += ')'; tail = tail.slice(1) }
  return [url, tail]
}

export function inline(text, ctx, k = 'i', depth = 0) {
  const out = []
  let last = 0
  let n = 0
  const re = new RegExp(INLINE.source, 'g') // its own copy: nested formatting runs this function again
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${k}-${n++}`
    if (m[1] !== undefined) out.push(<code key={key}>{m[1]}</code>)
    else if (m[2] !== undefined) out.push(<a key={key} href={m[3]} title={m[3]} target="_blank" rel="noopener noreferrer nofollow">{m[2]}</a>)
    else if (m[4] !== undefined) {
      const [url, tail] = trimUrl(m[4])
      out.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>)
      if (tail) out.push(tail)
    } else if (m[5] !== undefined) {
      const ce = /^<e:([0-9a-f-]{36}):([a-z0-9_]{2,32})>$/.exec(m[5])
      out.push(<CustomEmoji key={key} id={ce[1]} name={ce[2]} />)
    } else if (m[6] !== undefined) {
      const nm = m[6].slice(1).toLowerCase()
      const pr = ctx?.byName?.get(nm)
      if (nm === 'everyone' || nm === 'here') out.push(ctx?.everyoneOk ? <span key={key} className="mention-chip all" title="Notifies everyone here">{m[6]}</span> : m[6])
      else if (pr) out.push(<button key={key} type="button" className={`mention-chip ${pr.id === ctx.me ? 'me' : ''}`} onClick={() => ctx.open(pr)}>@{pr.display_name || pr.username}</button>)
      else out.push(m[6])
    } else {
      const wrap = m[7] !== undefined ? ['strong', m[7]] : m[8] !== undefined ? ['u', m[8]] : m[9] !== undefined ? ['s', m[9]] : m[10] !== undefined ? ['spoiler', m[10]] : m[11] !== undefined ? ['em', m[11]] : ['em', m[12]]
      const inner = depth < 4 ? inline(wrap[1], ctx, key, depth + 1) : wrap[1]
      out.push(wrap[0] === 'spoiler' ? <Spoiler key={key}>{inner}</Spoiler> : wrap[0] === 'strong' ? <strong key={key}>{inner}</strong> : wrap[0] === 'u' ? <u key={key}>{inner}</u> : wrap[0] === 's' ? <s key={key}>{inner}</s> : <em key={key}>{inner}</em>)
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function renderRich(text, ctx) {
  const lines = text.split('\n')
  const out = []
  let plain = [] // consecutive ordinary lines stay together so line breaks are kept
  let b = 0
  const flush = () => {
    if (!plain.length) return
    out.push(<span key={`p${b++}`}>{inline(plain.join('\n'), ctx, `p${b}`)}</span>)
    plain = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^```(\w{0,20})\s*$/.exec(line)
    if (fence) {
      let j = i + 1
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++
      if (j < lines.length) { // only a complete block counts
        flush()
        out.push(<pre key={`c${b++}`} className="md-pre"><code>{lines.slice(i + 1, j).join('\n')}</code></pre>)
        i = j
        continue
      }
    }
    let m
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) { flush(); out.push(<div key={`h${b++}`} className={`md-h md-h${m[1].length}`}>{inline(m[2], ctx, `h${b}`)}</div>); continue }
    if (/^>>> ?/.test(line)) { flush(); out.push(<blockquote key={`q${b++}`} className="md-quote">{inline([line.replace(/^>>> ?/, ''), ...lines.slice(i + 1)].join('\n'), ctx, `q${b}`)}</blockquote>); break }
    if (/^> ?/.test(line)) {
      let j = i
      const q = []
      while (j < lines.length && /^> ?/.test(lines[j])) q.push(lines[j++].replace(/^> ?/, ''))
      flush(); out.push(<blockquote key={`q${b++}`} className="md-quote">{inline(q.join('\n'), ctx, `q${b}`)}</blockquote>)
      i = j - 1
      continue
    }
    if (/^\s*([-*]|\d{1,3}\.) +\S/.test(line)) {
      let j = i
      const items = []
      const ordered = /^\s*\d/.test(line)
      while (j < lines.length && /^\s*([-*]|\d{1,3}\.) +\S/.test(lines[j])) items.push(lines[j++].replace(/^\s*([-*]|\d{1,3}\.) +/, ''))
      flush()
      const Tag = ordered ? 'ol' : 'ul'
      out.push(<Tag key={`l${b++}`} className="md-list">{items.map((t, x) => <li key={x}>{inline(t, ctx, `l${b}-${x}`)}</li>)}</Tag>)
      i = j - 1
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flush(); out.push(<hr key={`r${b++}`} className="md-hr" />); continue }
    plain.push(line)
  }
  flush()
  return out
}

// Does this text use any formatting at all? (Lets plain messages skip the heavier path.)
export const looksFormatted = (t) => /[*_~|`>#\[]|https?:|<e:|@|^\s*(-|\d+\.) /m.test(t)
