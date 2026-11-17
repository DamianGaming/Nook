import { useState } from 'react'
import { TEMPLATES, buildProject, makeConnectKey, aiPrompt, download, NODE_LIB_URL, PY_LIB_URL } from '../botDocs.js'
import { makeZip } from '../zip.js'
import { notify } from '../dialog.jsx'

const LANGS = [['js', 'Node.js'], ['py', 'Python']]
const NAMES = { js: 'my-nook-bot', py: 'my-nook-bot' }

export function LangPick({ lang, onChange }) {
  return (
    <div className="row tight" role="radiogroup" aria-label="Language">
      {LANGS.map(([id, name]) => <button key={id} type="button" role="radio" aria-checked={lang === id} className={'gif-cat' + (lang === id ? ' on' : '')} onClick={() => onChange(id)}>{name}</button>)}
    </div>
  )
}

export function saveProject(opts) {
  const files = buildProject(opts)
  const folder = NAMES[opts.lang]
  download(`${folder}.zip`, makeZip(Object.fromEntries(Object.entries(files).map(([n, t]) => [`${folder}/${n}`, t]))))
  return files
}

/* Pick a language and a starter, get a ready folder (zip). The key is inside when it is known. */
export function Starter({ bot, keyText = null }) {
  const [lang, setLang] = useState('js')
  const [tpl, setTpl] = useState('hello')
  const t = TEMPLATES.find((x) => x[0] === tpl)
  const get = () => {
    try {
      saveProject({ lang, template: tpl, key: keyText })
      notify(keyText ? 'Downloaded. Unzip it and double-click start.bat.' : 'Downloaded. Unzip it, open .env and paste your connect key, then double-click start.bat.')
    } catch { notify('Could not build the bot folder.', 'error') }
  }
  return (
    <div className="starter">
      <LangPick lang={lang} onChange={setLang} />
      <label>Starter bot
        <select value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      </label>
      <p className="muted tiny">{t?.[2]}</p>
      <div className="row tight wrap">
        <button className="primary small" onClick={get}>Download bot folder</button>
        {bot && <button className="ghost small" onClick={() => navigator.clipboard?.writeText(aiPrompt(`A bot called ${bot.display_name}. ${bot.description || ''}`, lang)).then(() => notify('Copied. Paste it into ChatGPT, Claude or Gemini and add what you want.'), () => notify('Could not copy.', 'error'))}>Copy brief for ChatGPT</button>}
        <a className="button-link ghost small" href="/developers#starter" target="_blank" rel="noreferrer">How it works</a>
      </div>
      <details className="doc-details"><summary>Got code from ChatGPT or another AI?</summary><AssembleBox keyText={keyText} lang={lang} /></details>
      {!keyText && <p className="muted tiny">The key is only shown when a bot is made or when you press "New key", so a later download has a spot in the <code>.env</code> file to paste it.</p>}
    </div>
  )
}

/* Paste code an AI wrote (or your own) and get a finished folder: your file, the key file and the start script. */
export function AssembleBox({ keyText = null, lang: lang0 = 'js' }) {
  const [lang, setLang] = useState(lang0)
  const [code, setCode] = useState('')
  function make() {
    try {
      saveProject({ lang, code, key: keyText })
      notify(keyText ? 'Done. Unzip it and double-click start.bat.' : 'Done. Unzip it, open .env and paste your connect key, then double-click start.bat.')
    } catch { notify('Could not build the bot folder.', 'error') }
  }
  return (
    <div className="assemble">
      <LangPick lang={lang} onChange={setLang} />
      <label className="doc-field">Paste your bot's code here
        <textarea rows={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code your AI wrote. It can include the import and bot lines or skip them, both work. Extra packages it uses are listed for you." spellCheck={false} />
      </label>
      <button type="button" className="primary" disabled={code.trim().length < 10} onClick={make}>Make my bot folder</button>
    </div>
  )
}

export { makeConnectKey, NODE_LIB_URL, PY_LIB_URL }
