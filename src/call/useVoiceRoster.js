import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'

const same = (a, b) => a.length === b.length && a.every((r, i) => r.group_id === b[i].group_id && r.user_id === b[i].user_id && (r.room_id || null) === (b[i].room_id || null))

// Who is in voice: byGroup { [groupId]: [userId, ...] } counts every room of the group; byRoom { [roomId or 'main:' + groupId]: [userId, ...] }.
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
    const timer = setInterval(() => { if (!document.hidden) load() }, 20000) // nothing to refresh while the tab is hidden
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return useMemo(() => {
    const byGroup = {}
    const byRoom = {}
    for (const r of rows) {
      (byGroup[r.group_id] ||= []).push(r.user_id)
      ;(byRoom[r.room_id || `main:${r.group_id}`] ||= []).push(r.user_id)
    }
    return { byGroup, byRoom }
  }, [rows])
}

// The named voice rooms of one group, kept fresh.
export function useVoiceRooms(groupId) {
  const [rooms, setRooms] = useState([])
  useEffect(() => {
    setRooms([])
    if (!groupId) return undefined
    let live = true
    const load = async () => {
      const { data, error } = await supabase.from('voice_rooms').select('*').eq('group_id', groupId).order('position').order('created_at')
      if (live && !error) setRooms(data || [])
    }
    load()
    const ch = supabase.channel(`vrooms-${groupId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'voice_rooms', filter: `group_id=eq.${groupId}` }, load).subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
  }, [groupId])
  return rooms
}
