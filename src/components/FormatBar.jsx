import { memo } from 'react'
import Icon from './Icon.jsx'

// Wraps the selected text (or the caret) with formatting characters. Pressing again removes them.
export function applyFormat(el, value, kind) {
  const s = el.selectionStart
  const e = el.selectionEnd
  const sel = value.slice(s, e)
  const wraps = { bold: ['**', '**'], italic: ['*', '*'], underline: ['__', '__'], strike: ['~~', '~~'], spoiler: ['||', '||'], code: ['`', '`'], codeblock: ['```\n', '\n```'] }
  let next
  let a
  let b
  if (kind === 'quote' || kind === 'list') {
    const mark = kind === 'quote' ? '> ' : '- '
    const start = value.lastIndexOf('\n', s - 1) + 1
    const block = value.slice(start, e)
    const all = block.split('\n')
    const done = all.every((l) => l.startsWith(mark))
    const out = all.map((l) => (done ? l.slice(mark.length) : mark + l)).join('\n')
    next = value.slice(0, start) + out + value.slice(e)
    a = start
    b = start + out.length
  } else if (kind === 'link') {
    const text = sel || 'link text'
    const ins = `[${text}](https://)`
    next = value.slice(0, s) + ins + value.slice(e)
    a = s + text.length + 3 // select "https://" so it can be replaced straight away
    b = a + 8
  } else {
    const [l, r] = wraps[kind]
    const has = value.slice(s - l.length, s) === l && value.slice(e, e + r.length) === r
    if (has) {
      next = value.slice(0, s - l.length) + sel + value.slice(e + r.length)
      a = s - l.length
      b = a + sel.length
    } else {
      next = value.slice(0, s) + l + sel + r + value.slice(e)
      a = s + l.length
      b = a + sel.length
    }
  }
  return { next, a, b }
}

// Groups are separated by a thin line. Each is [kind, icon, label, shortcut].
const GROUPS = [
  [['bold', 'bold', 'Bold', 'Ctrl+B'], ['italic', 'italic', 'Italic', 'Ctrl+I'], ['underline', 'underline', 'Underline', 'Ctrl+U'], ['strike', 'strike', 'Strikethrough', ''], ['spoiler', 'eyeoff', 'Spoiler: hidden until clicked', '']],
  [['code', 'code', 'Inline code', ''], ['codeblock', 'codeblock', 'Code block', ''], ['quote', 'quote', 'Quote', ''], ['list', 'list', 'Bulleted list', ''], ['link', 'link', 'Link', '']],
]

/* The bar that appears while typing. Buttons keep the text box focused (mouse down is cancelled). */
export default memo(function FormatBar({ onFormat, onEmbed, onPoll, onSlash }) {
  const keep = (e) => e.preventDefault()
  return (
    <div className="formatbar" role="toolbar" aria-label="Text formatting">
      {GROUPS.map((g, gi) => (
        <div className="fb-group" key={gi} role="group">
          {g.map(([k, icon, label, key]) => (
            <button key={k} type="button" className="fb" title={key ? `${label} (${key})` : label} aria-label={label} onMouseDown={keep} onClick={() => onFormat(k)}><Icon name={icon} size={16} /></button>
          ))}
        </div>
      ))}
      <span className="fb-gap" />
      <div className="fb-group fb-actions" role="group">
        {onSlash && <button type="button" className="fb fb-text" title="Run a bot command" onMouseDown={keep} onClick={onSlash}><Icon name="slash" size={15} />Commands</button>}
        <button type="button" className="fb fb-text" title="Build an embed card" onMouseDown={keep} onClick={onEmbed}><Icon name="layout" size={15} />Embed</button>
        {onPoll && <button type="button" className="fb fb-text" title="Create a poll" onMouseDown={keep} onClick={onPoll}><Icon name="chart" size={15} />Poll</button>}
      </div>
    </div>
  )
})
