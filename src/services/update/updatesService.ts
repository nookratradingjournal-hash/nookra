// ── Updates Service (user-facing) ───────────────────────────────────────────
// Fetches published release notes / announcements for display in Settings.

import { supabase } from '../supabase'

export interface PublishedUpdate {
  id: string
  title: string
  summary: string
  body: string
  version: string
  published_at: string
}

const LAST_SEEN_KEY = 'tj-updates-last-seen'

export async function fetchPublishedUpdates(): Promise<PublishedUpdate[]> {
  const { data, error } = await supabase.rpc('get_published_updates')
  if (error) return []
  return (data as PublishedUpdate[]) ?? []
}

/** Check if there are published updates newer than the user's last visit */
export async function hasUnseenUpdates(): Promise<boolean> {
  const updates = await fetchPublishedUpdates()
  if (updates.length === 0) return false
  const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
  if (!lastSeen) return true
  return new Date(updates[0].published_at).getTime() > new Date(lastSeen).getTime()
}

/** Mark updates as seen (call when user opens What's New) */
export function markUpdatesSeen(): void {
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
}
