import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'

const same = (a, b) => a.length === b.length && a.every((r, i) => r.group_id === b[i].group_id && r.user_id === b[i].user_id)

// Who is in the voice room of each group: { [groupId]: [userId, ...] }.
// The server decides what is fresh (a heartbeat in the last 120 s), so device clocks do not matter.
export function useVoiceRoster(groupIds) {
  const [rows, setRows] = useState([])
  const key = groupIds.join(',')

  useEffect(() => {
    if (!groupIds.length) {
      setRows([])
      return undefined
    }
    let active = true
    const load = async () => {
      const { data } = await supabase.rpc('group_voice_roster', { gids: groupIds })
      if (active && data) setRows((old) => (same(old, data) ? old : data))
    }
    load()
    const ch = supabase
      .channel('voice-roster')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_voice' }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_voice' }, load)
      .subscribe()
    const timer = setInterval(load, 20000)
    return () => {
      active = false
      clearInterval(timer)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return useMemo(() => {
    const map = {}
    for (const r of rows) (map[r.group_id] ||= []).push(r.user_id)
    return map
  }, [rows])
}
