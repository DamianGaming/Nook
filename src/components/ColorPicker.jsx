import Icon from './Icon.jsx'

export const ACCENTS = ['#7c8cff', '#ff8fb1', '#ffb86b', '#7be0a0', '#4fd1c5', '#c58cff', '#ff6b8a', '#ffd36b', '#6fb7ff', '#a3e635', '#f472b6', '#94a3b8']
export const BANNERS = ['#3b4270', '#6b4fa0', '#a04fd0', '#2f6f8f', '#2f7d5b', '#8a4f2f', '#a03b52', '#4a4f66', '#1f2a44', '#7a3b8f', '#b05f2a', '#2c8a8a']

const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v)

/* A row of colour dots to tap, plus a "custom" dot that opens the browser's own picker. */
export default function ColorPicker({ label, value, onChange, presets, noneLabel }) {
  const custom = Boolean(value) && !presets.some((p) => p.toLowerCase() === value.toLowerCase())
  return (
    <div className="colorpick" role="radiogroup" aria-label={label}>
      <div className="colorpick-head">
        <span>{label}</span>
        <code>{value || noneLabel}</code>
      </div>
      <div className="swatches">
        {noneLabel && (
          <button type="button" role="radio" aria-checked={!value} aria-label={noneLabel} title={noneLabel} className={`swatch none ${!value ? 'on' : ''}`} onClick={() => onChange('')}>
            <Icon name="x" size={13} />
          </button>
        )}
        {presets.map((c) => (
          <button type="button" key={c} role="radio" aria-checked={value?.toLowerCase() === c} aria-label={c} title={c}
            className={`swatch ${value?.toLowerCase() === c ? 'on' : ''}`} style={{ '--sw': c }} onClick={() => onChange(c)}>
            <Icon name="check" size={13} />
          </button>
        ))}
        <label className={`swatch custom ${custom ? 'on' : ''}`} style={custom && isHex(value) ? { '--sw': value } : undefined} title="Pick any colour">
          {custom ? <Icon name="check" size={13} /> : <Icon name="plus" size={13} />}
          <input type="color" value={isHex(value) ? value : '#7c8cff'} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: custom colour`} />
        </label>
      </div>
    </div>
  )
}
