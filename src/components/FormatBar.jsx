import { memo } from 'react'

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

const BTN = [
  ['bold', 'B', 'Bold (Ctrl+B)', 'fb-b'],
  ['italic', 'I', 'Italic (Ctrl+I)', 'fb-i'],
  ['underline', 'U', 'Underline (Ctrl+U)', 'fb-u'],
  ['strike', 'S', 'Strikethrough', 'fb-s'],
  ['spoiler', '👁', 'Spoiler', 'fb-sp'],
  ['code', '</>', 'Code', 'fb-c'],
  ['quote', '❝', 'Quote', ''],
  ['list', '•', 'List', ''],
  ['link', '🔗', 'Link', ''],
]

/* The small bar that appears while typing. Buttons keep the text box focused (mouse down is cancelled). */
export default memo(function FormatBar({ onFormat, onEmbed }) {
  return (
    <div className="formatbar" role="toolbar" aria-label="Text formatting">
      {BTN.map(([k, label, title, cls]) => (
        <button key={k} type="button" className={`fb ${cls}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat(k)}>{label}</button>
      ))}
      <span className="fb-sep" />
      <button type="button" className="fb fb-wide" title="Build an embed card" onMouseDown={(e) => e.preventDefault()} onClick={onEmbed}>Embed</button>
    </div>
  )
})
