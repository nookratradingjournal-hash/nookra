// ── Admin Panel ──────────────────────────────────────────────────────────────
// Internal admin tool for managing licenses, trials, devices, and key generation.
// Access: hidden behind ?admin hash + password gate.

import { useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import { Modal } from '../ui/Modal'
import { supabase } from '../../services/supabase'
import {
  fetchDashboardStats,
  fetchAllLicenses,
  fetchAllTrials,
  updateLicenseStatus,
  resetLicenseDevices,
  createLicense,
  deleteLicense,
  resetTrial,
  generateKeyString,
  fetchAllUpdates,
  createUpdate,
  editUpdate,
  publishUpdate,
  unpublishUpdate,
  deleteUpdate,
  validateUpdateInput,
  isValidSemver,
  isValidDownloadUrl,
  type DashboardStats,
  type AdminLicense,
  type AdminTrial,
  type AdminUpdate,
  type ReleaseType,
  type UpdatePlatform,
  type UpdateInput,
} from '../../services/admin/adminService'

// Section-header "Reload" button style shared across Licenses + Trials panels.
const ADMIN_HEADER_ACTION_BTN_CLASS =
  'px-2.5 py-1 rounded-md text-[10px] font-medium border cursor-pointer transition-all text-white/40 hover:text-white/70 border-white/[0.08] hover:border-white/15 hover:bg-white/[0.03] disabled:opacity-30 disabled:cursor-default'

// Shared text-input chrome for admin inputs (search bars, Updates form fields,
// License Name). Sites append `mb-4` or `resize-y leading-relaxed` as needed.
const ADMIN_INPUT_BASE =
  'w-full px-3 py-2 rounded-lg text-[12px] bg-white/[0.03] border border-white/[0.06] text-white/60 placeholder:text-white/15 outline-none focus:border-white/15'

// ── Types ────────────────────────────────────────────────────────────────────

type Section = 'dashboard' | 'licenses' | 'trials' | 'updates' | 'keygen'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtRelative(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const hrs = Math.floor(diff / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  return hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-positive-soft text-positive border-positive',
    disabled: 'bg-warning-soft text-warning border-warning',
    revoked: 'bg-negative-soft text-negative border-negative',
    expired: 'bg-surface-resting text-tertiary border-edge-resting',
  }
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${colors[status] ?? colors.expired}`}
    >
      {status}
    </span>
  )
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function AdminPanel({ onClose }: { onClose: () => void }) {
  // Real auth: Supabase session + server-verified admin status.
  // `authed` flips true only after BOTH:
  //   1. supabase.auth.signInWithPassword() succeeds (valid user)
  //   2. supabase.rpc('is_admin') returns true (user_id present in admins)
  // Client never decides who is an admin — the RPC does, and every admin_*
  // RPC re-checks is_admin() server-side anyway (see admin-rpcs.sql).
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // On mount, if a Supabase session is already persisted, verify it's still
  // an admin session before letting them skip the sign-in form.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) setChecking(false)
        return
      }
      const { data, error: rpcError } = await supabase.rpc('is_admin')
      if (!cancelled) {
        if (!rpcError && data === true) setAuthed(true)
        setChecking(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const signIn = async () => {
    if (!email.trim() || !pw) {
      setError('Enter email and password')
      return
    }
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    })
    if (signInError) {
      setError('Invalid credentials')
      setLoading(false)
      return
    }
    const { data, error: rpcError } = await supabase.rpc('is_admin')
    if (rpcError || data !== true) {
      await supabase.auth.signOut()
      setError('Not authorized')
      setLoading(false)
      return
    }
    setAuthed(true)
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center">
        <span className="text-[11px] text-white/25">Checking session…</span>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center">
        {/* Auth card now uses the shared `.panel-shell` so it matches the
            rest of the app's floating-surface system (blur, border, radius,
            shadow) — no more one-off rounded-xl card with a hand-rolled
            background tint. */}
        <div className="panel-shell w-[340px] flex flex-col gap-4 p-6">
          <h2 className="text-[13px] font-semibold text-white/60 uppercase tracking-wider text-center">
            Admin Access
          </h2>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') signIn() }}
            placeholder="admin@email.com"
            autoComplete="username"
            className="w-full px-3 py-2.5 rounded-lg text-[13px] bg-white/[0.04] border border-white/[0.08] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') signIn() }}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-3 py-2.5 rounded-lg text-[13px] bg-white/[0.04] border border-white/[0.08] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
          />
          {error && (
            <p className="text-[11px] text-negative text-center">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-[11px] font-medium text-white/30 border border-white/[0.06] cursor-pointer hover:text-white/50 hover:-translate-y-[2px] active:translate-y-0 transition-all duration-150 ease-out disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={signIn}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-white border border-white/[0.08] cursor-pointer hover:bg-white/[0.04] hover:-translate-y-[2px] active:translate-y-0 transition-all duration-150 ease-out disabled:opacity-30"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <AdminDashboard onClose={onClose} />
}

// ── Dashboard Shell ──────────────────────────────────────────────────────────

function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('dashboard')

  const nav: { id: Section; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'trials', label: 'Trials' },
    { id: 'updates', label: 'Updates' },
    { id: 'keygen', label: 'Key Gen' },
  ]

  return (
    <div className="fixed inset-0 bg-[#09090b] flex">
      {/* Sidebar */}
      <div
        className="w-[200px] shrink-0 border-r border-white/[0.06] flex flex-col p-4 gap-1"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">
            Admin
          </span>
          <button
            onClick={onClose}
            className="text-[10px] text-white/25 hover:text-white/50 cursor-pointer transition-colors"
          >
            ✕ Close
          </button>
        </div>
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setSection(n.id)}
            className={`text-left px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all ${
              section === n.id
                ? 'bg-white/[0.06] text-white/80'
                : 'text-white/35 hover:text-white/55 hover:bg-white/[0.03]'
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {section === 'dashboard' && <DashboardSection />}
        {section === 'licenses' && <LicensesSection />}
        {section === 'trials' && <TrialsSection />}
        {section === 'updates' && <UpdatesSection />}
        {section === 'keygen' && <KeyGenSection />}
      </div>
    </div>
  )
}

// ── Section: Dashboard ───────────────────────────────────────────────────────

function DashboardSection() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  const load = useCallback(() => {
    setReloading(true)
    fetchDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setReloading(false))
  }, [])

  useEffect(load, [load])

  if (error) return <ErrorMsg msg={error} />
  if (!stats) return <Loading />

  // Insight messages — surface what needs attention
  const insights: { text: string; tone: 'red' | 'yellow' | 'neutral' }[] = []
  if (stats.disabledLicenses > 0)
    insights.push({
      text: `${stats.disabledLicenses} license${stats.disabledLicenses > 1 ? 's' : ''} disabled or revoked`,
      tone: 'red',
    })
  if (stats.activeTrials > 0)
    insights.push({
      text: `${stats.activeTrials} active trial${stats.activeTrials > 1 ? 's' : ''} running`,
      tone: 'yellow',
    })
  if (stats.expiredTrials > 0)
    insights.push({
      text: `${stats.expiredTrials} expired trial${stats.expiredTrials > 1 ? 's' : ''}`,
      tone: 'neutral',
    })
  if (insights.length === 0)
    insights.push({ text: 'All systems healthy — no issues detected', tone: 'neutral' })

  const insightColors = {
    red: 'text-negative',
    yellow: 'text-warning',
    neutral: 'text-tertiary',
  }
  const insightDots = {
    red: 'bg-negative',
    yellow: 'bg-warning',
    neutral: 'bg-surface-active',
  }

  return (
    <div className="max-w-[560px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-[20px] font-bold text-white/90 leading-none">Dashboard</h1>
        <button
          onClick={load}
          disabled={reloading}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all text-white/30 hover:text-white/50 hover:bg-white/[0.03] hover:-translate-y-[2px] active:translate-y-0 disabled:opacity-30 disabled:cursor-default"
        >
          {reloading ? 'Reloading\u2026' : 'Reload'}
        </button>
      </div>

      {/* Section 1 — Primary Metrics (inline rows, no boxes) */}
      <div className="flex flex-col gap-5 mb-10">
        {([
          { label: 'Active Licenses', value: stats.activeLicenses, color: 'text-positive' },
          { label: 'Total Licenses', value: stats.totalLicenses, color: 'text-secondary' },
          { label: 'Disabled / Revoked', value: stats.disabledLicenses,
            color: stats.disabledLicenses > 0 ? 'text-negative' : 'text-quaternary' },
        ] as const).map((m) => (
          <div
            key={m.label}
            className="flex items-baseline justify-between py-1 transition-colors rounded-md px-1 -mx-1 hover:bg-white/[0.02]"
          >
            <span className="text-[13px] text-white/35 font-medium">{m.label}</span>
            <span className={`text-[32px] font-bold tabular-nums leading-none ${m.color}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05] mb-8" />

      {/* Section 2 — Secondary Metrics (compact row) */}
      <div className="flex gap-10 mb-10">
        {[
          { label: 'Devices', value: stats.totalDevices },
          { label: 'Active Trials', value: stats.activeTrials },
          { label: 'Expired Trials', value: stats.expiredTrials },
        ].map((m) => (
          <div key={m.label}>
            <p className="text-[10px] text-white/20 uppercase tracking-wider font-medium mb-1.5">
              {m.label}
            </p>
            <p className="text-[20px] font-semibold tabular-nums leading-none text-white/35">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05] mb-6" />

      {/* Section 3 — Status feed (no box) */}
      <p className="text-[9px] text-white/15 uppercase tracking-wider font-semibold mb-3">
        Status
      </p>
      <div className="flex flex-col gap-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className={`block w-[4px] h-[4px] rounded-full shrink-0 ${insightDots[ins.tone]}`} />
            <span className={`text-[11px] font-medium ${insightColors[ins.tone]}`}>
              {ins.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section: Licenses ────────────────────────────────────────────────────────

function LicensesSection() {
  const [licenses, setLicenses] = useState<AdminLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdminLicense | null>(null)
  const [confirmingDeleteKey, setConfirmingDeleteKey] = useState<string | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: 'reset' | 'revoke' | 'restore' | 'delete'
    keys: string[]
  } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setReloading(true)
    fetchAllLicenses()
      .then((data) => {
        setLicenses(data)
        setSelected(new Set())              // clear selection on reload
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setReloading(false)
      })
  }, [])

  useEffect(load, [load])

  // ── Single-row actions (unchanged) ──

  const handleStatus = async (key: string, status: 'active' | 'disabled' | 'revoked') => {
    const r = await updateLicenseStatus(key, status)
    setActionMsg(r.success ? `License ${status}` : r.error ?? 'Failed')
    load()
    setTimeout(() => setActionMsg(null), 2000)
  }

  const handleResetDevices = async (key: string) => {
    const r = await resetLicenseDevices(key)
    setActionMsg(r.success ? `Removed ${r.removedCount ?? 0} device(s)` : r.error ?? 'Failed')
    load()
    setTimeout(() => setActionMsg(null), 2000)
  }

  const handleDelete = async (key: string) => {
    if (confirmingDeleteKey !== key) {
      setConfirmingDeleteKey(key)
      return
    }
    setConfirmingDeleteKey(null)
    const r = await deleteLicense(key)
    if (r.success) {
      setActionMsg(`Deleted (${r.deletedActivations ?? 0} activation(s) removed)`)
    } else {
      const errMsg = r.error?.includes('schema cache') || r.error?.includes('could not find')
        ? 'Delete function missing — run admin-rpcs.sql in Supabase'
        : r.error ?? 'Delete failed'
      setActionMsg(errMsg)
    }
    load()
    setTimeout(() => setActionMsg(null), 5000)
  }

  // ── Bulk actions ──

  const bulkLabels: Record<string, string> = {
    reset: 'Reset Devices',
    revoke: 'Revoke',
    restore: 'Restore',
    delete: 'Delete',
  }

  const executeBulk = async (action: 'reset' | 'revoke' | 'restore' | 'delete', keys: string[]) => {
    setBulkBusy(true)
    setBulkConfirm(null)
    let ok = 0
    let fail = 0
    for (const key of keys) {
      let r: { success: boolean }
      if (action === 'reset') r = await resetLicenseDevices(key)
      else if (action === 'revoke') r = await updateLicenseStatus(key, 'revoked')
      else if (action === 'restore') r = await updateLicenseStatus(key, 'active')
      else r = await deleteLicense(key)
      if (r.success) ok++; else fail++
    }
    setBulkBusy(false)
    const label = bulkLabels[action]
    setActionMsg(fail === 0 ? `${label}: ${ok} license(s) updated` : `${label}: ${ok} ok, ${fail} failed`)
    load()
    setTimeout(() => setActionMsg(null), 3000)
  }

  const requestBulk = (action: 'reset' | 'revoke' | 'restore' | 'delete') => {
    const keys = Array.from(selected)
    if (keys.length === 0) return
    setBulkConfirm({ action, keys })
  }

  // ── Selection helpers ──

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const filtered = licenses.filter((l) => {
    const q = search.toLowerCase()
    return (
      !q ||
      l.license_key.toLowerCase().includes(q) ||
      (l.owner_name ?? '').toLowerCase().includes(q) ||
      (l.email ?? '').toLowerCase().includes(q)
    )
  })

  const filteredKeys = filtered.map((l) => l.license_key)
  const allSelected = filteredKeys.length > 0 && filteredKeys.every((k) => selected.has(k))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredKeys))
    }
  }

  if (error) return <ErrorMsg msg={error} />
  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-bold text-white/80">Licenses</h1>
        <div className="flex items-center gap-3">
          {actionMsg && <span className="text-[11px] text-positive">{actionMsg}</span>}
          <button
            onClick={load}
            disabled={reloading}
            className={ADMIN_HEADER_ACTION_BTN_CLASS}
          >
            {reloading ? 'Reloading\u2026' : 'Reload'}
          </button>
        </div>
      </div>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelected(new Set()) }}
        placeholder="Search by key, name, or email..."
        className={`${ADMIN_INPUT_BASE} mb-4`}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-[11px] text-white/50 font-medium mr-1">
            {selected.size} selected
          </span>
          <ActionBtn label="Reset Devices" color="blue" onClick={() => requestBulk('reset')} />
          <ActionBtn label="Revoke" color="amber" onClick={() => requestBulk('revoke')} />
          <ActionBtn label="Restore" onClick={() => requestBulk('restore')} />
          <ActionBtn label="Delete" color="red" onClick={() => requestBulk('delete')} />
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[10px] text-white/25 hover:text-white/50 cursor-pointer transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-white/25 uppercase tracking-wider border-b border-white/[0.06]">
            <th className="pb-2 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-[var(--accent)] cursor-pointer"
              />
            </th>
            <th className="pb-2 font-medium">Key</th>
            <th className="pb-2 font-medium">Owner</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Devices</th>
            <th className="pb-2 font-medium">Created</th>
            <th className="pb-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => (
            <tr
              key={l.id}
              className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                selected.has(l.license_key) ? 'bg-white/[0.03]' : ''
              }`}
            >
              <td className="py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(l.license_key)}
                  onChange={() => toggleOne(l.license_key)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
              </td>
              <td
                className="py-2.5 font-mono text-white/50 cursor-pointer hover:text-white/80"
                onClick={() => setDetail(l)}
              >
                {l.license_key.length > 20
                  ? l.license_key.slice(0, 19) + '\u2026'
                  : l.license_key}
              </td>
              <td className="py-2.5 text-white/40">{l.owner_name ?? '\u2014'}</td>
              <td className="py-2.5">
                <StatusBadge status={l.status} />
              </td>
              <td className="py-2.5 text-white/40 tabular-nums">
                {l.device_count}/{l.max_devices}
              </td>
              <td className="py-2.5 text-white/25">{fmtDate(l.created_at)}</td>
              <td className="py-2.5 text-right">
                <div className="flex gap-1 justify-end">
                  {l.status === 'revoked' ? (
                    <>
                      <ActionBtn
                        label="Restore"
                        onClick={() => handleStatus(l.license_key, 'active')}
                      />
                      <button
                        onClick={() => handleDelete(l.license_key)}
                        onBlur={() => {
                          if (confirmingDeleteKey === l.license_key) setConfirmingDeleteKey(null)
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium border cursor-pointer transition-all ${
                          confirmingDeleteKey === l.license_key
                            ? 'bg-negative-strong text-negative border-negative'
                            : 'text-negative hover:text-[#f87171] border-negative hover:border-[rgba(239,68,68,0.30)] hover:bg-[rgba(239,68,68,0.06)]'
                        }`}
                      >
                        {confirmingDeleteKey === l.license_key ? 'Confirm?' : 'Delete'}
                      </button>
                    </>
                  ) : (
                    <>
                      {l.status !== 'active' && (
                        <ActionBtn
                          label="Activate"
                          onClick={() => handleStatus(l.license_key, 'active')}
                        />
                      )}
                      {l.status === 'active' && (
                        <ActionBtn
                          label="Disable"
                          color="amber"
                          onClick={() => handleStatus(l.license_key, 'disabled')}
                        />
                      )}
                      <ActionBtn
                        label="Revoke"
                        color="red"
                        onClick={() => handleStatus(l.license_key, 'revoked')}
                      />
                      {l.status === 'active' && (
                        <ActionBtn
                          label="Reset Devices"
                          color="blue"
                          onClick={() => handleResetDevices(l.license_key)}
                        />
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="py-12 text-center text-white/40 text-[12px]">
                {search.trim() ? 'No results match your search.' : 'No licenses found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Detail modal */}
      {detail && <LicenseDetailModal license={detail} onClose={() => setDetail(null)} />}

      {/* Bulk confirmation modal */}
      {bulkConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !bulkBusy && setBulkConfirm(null)}
        >
          <div
            className="w-[380px] rounded-xl border border-white/[0.08] p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface-floating)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-bold text-white/80">
              {bulkLabels[bulkConfirm.action]} — {bulkConfirm.keys.length} license{bulkConfirm.keys.length > 1 ? 's' : ''}
            </h2>
            <p className="text-[12px] text-white/40 leading-relaxed">
              {bulkConfirm.action === 'delete'
                ? 'This will permanently delete the selected licenses and all their activations. This cannot be undone.'
                : `Are you sure you want to ${bulkLabels[bulkConfirm.action].toLowerCase()} for ${bulkConfirm.keys.length} license(s)?`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBulkConfirm(null)}
                disabled={bulkBusy}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/30 border border-white/[0.06] cursor-pointer hover:text-white/50 transition-colors disabled:opacity-30"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBulk(bulkConfirm.action, bulkConfirm.keys)}
                disabled={bulkBusy}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all disabled:opacity-30 ${
                  bulkConfirm.action === 'delete'
                    ? 'bg-negative-strong text-negative border-negative hover:bg-[rgba(239,68,68,0.22)]'
                    : 'bg-surface-hover text-secondary border-edge-resting hover:bg-surface-active'
                }`}
              >
                {bulkBusy ? 'Processing\u2026' : `${bulkLabels[bulkConfirm.action]} ${bulkConfirm.keys.length} license(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LicenseDetailModal({
  license: l,
  onClose,
}: {
  license: AdminLicense
  onClose: () => void
}) {
  // Now routes through the shared Modal primitive — same glass-panel-floating
  // shell, same entrance animation, same backdrop behaviour as every other
  // modal in the app. The inline one-off `rounded-xl + #111113 + custom
  // border` panel was replaced so there is no "custom admin dialog" anymore.
  return (
    <Modal open onClose={onClose} width="max-w-[420px]">
      <div className="flex flex-col">
        <div className="panel-header">
          <h2 className="text-sm font-semibold text-white">License Detail</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="close-hover w-8 h-8 rounded-xl flex items-center justify-center text-white/35 hover:-translate-y-[1px] active:translate-y-0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="pointer-events-none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px] px-6 py-5">
          <DetailRow label="Key" value={l.license_key} mono />
          <DetailRow label="Owner" value={l.owner_name ?? '\u2014'} />
          <DetailRow label="Email" value={l.email ?? '\u2014'} />
          <DetailRow label="Status" value={l.status} />
          <DetailRow label="Devices" value={`${l.device_count} / ${l.max_devices}`} />
          <DetailRow label="Created" value={fmtDate(l.created_at)} />
        </div>
      </div>
    </Modal>
  )
}

// ── Section: Trials ──────────────────────────────────────────────────────────

function TrialsSection() {
  const [trials, setTrials] = useState<AdminTrial[]>([])
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<{ ids: string[] } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setReloading(true)
    fetchAllTrials()
      .then((data) => {
        setTrials(data)
        setSelected(new Set())
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setReloading(false)
      })
  }, [])

  useEffect(load, [load])

  const handleReset = async (id: string) => {
    const r = await resetTrial(id)
    setActionMsg(r.success ? 'Trial reset' : r.error ?? 'Failed')
    load()
    setTimeout(() => setActionMsg(null), 2000)
  }

  // Bulk actions
  const executeBulk = async (ids: string[]) => {
    setBulkBusy(true)
    setBulkConfirm(null)
    let ok = 0
    let fail = 0
    for (const id of ids) {
      const r = await resetTrial(id)
      if (r.success) ok++; else fail++
    }
    setBulkBusy(false)
    setActionMsg(fail === 0 ? `Reset: ${ok} trial(s) removed` : `Reset: ${ok} ok, ${fail} failed`)
    load()
    setTimeout(() => setActionMsg(null), 3000)
  }

  const requestBulk = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkConfirm({ ids })
  }

  // Selection helpers
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const filtered = trials.filter((t) => {
    const q = search.toLowerCase()
    return !q || t.device_name.toLowerCase().includes(q) || t.device_id.toLowerCase().includes(q)
  })

  const filteredIds = filtered.map((t) => t.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filteredIds))
  }

  if (error) return <ErrorMsg msg={error} />
  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-bold text-white/80">Trials</h1>
        <div className="flex items-center gap-3">
          {actionMsg && <span className="text-[11px] text-positive">{actionMsg}</span>}
          <button
            onClick={load}
            disabled={reloading}
            className={ADMIN_HEADER_ACTION_BTN_CLASS}
          >
            {reloading ? 'Reloading\u2026' : 'Reload'}
          </button>
        </div>
      </div>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelected(new Set()) }}
        placeholder="Search by device name or ID..."
        className={`${ADMIN_INPUT_BASE} mb-4`}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-[11px] text-white/50 font-medium mr-1">
            {selected.size} selected
          </span>
          <ActionBtn label="Reset Trial" color="amber" onClick={requestBulk} />
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[10px] text-white/25 hover:text-white/50 cursor-pointer transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-white/25 uppercase tracking-wider border-b border-white/[0.06]">
            <th className="pb-2 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-[var(--accent)] cursor-pointer"
              />
            </th>
            <th className="pb-2 font-medium">Device</th>
            <th className="pb-2 font-medium">Device ID</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Started</th>
            <th className="pb-2 font-medium">Expires</th>
            <th className="pb-2 font-medium">Remaining</th>
            <th className="pb-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr
              key={t.id}
              className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                selected.has(t.id) ? 'bg-white/[0.03]' : ''
              }`}
            >
              <td className="py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleOne(t.id)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-white/50">{t.device_name}</td>
              <td className="py-2.5">
                <CopyableId value={t.device_id} truncate={20} />
              </td>
              <td className="py-2.5">
                <StatusBadge status={t.status} />
              </td>
              <td className="py-2.5 text-white/25">{fmtDate(t.started_at)}</td>
              <td className="py-2.5 text-white/25">{fmtDate(t.expires_at)}</td>
              <td className="py-2.5 text-white/40">{fmtRelative(t.expires_at)}</td>
              <td className="py-2.5 text-right">
                <ActionBtn label="Reset" color="amber" onClick={() => handleReset(t.id)} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="py-12 text-center text-white/40 text-[12px]">
                {search.trim() ? 'No results match your search.' : 'No trials found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Bulk confirmation modal */}
      {bulkConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !bulkBusy && setBulkConfirm(null)}
        >
          <div
            className="w-[380px] rounded-xl border border-white/[0.08] p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface-floating)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-bold text-white/80">
              Reset Trial — {bulkConfirm.ids.length} trial{bulkConfirm.ids.length > 1 ? 's' : ''}
            </h2>
            <p className="text-[12px] text-white/40 leading-relaxed">
              Are you sure you want to reset {bulkConfirm.ids.length} trial(s)? This will delete the trial records so those devices can start a fresh trial.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBulkConfirm(null)}
                disabled={bulkBusy}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/30 border border-white/[0.06] cursor-pointer hover:text-white/50 transition-colors disabled:opacity-30"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBulk(bulkConfirm.ids)}
                disabled={bulkBusy}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all disabled:opacity-30 bg-white/[0.06] text-white/70 border-white/[0.08] hover:bg-white/[0.10]"
              >
                {bulkBusy ? 'Processing\u2026' : `Reset ${bulkConfirm.ids.length} trial(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section: Devices ─────────────────────────────────────────────────────────

function UpdatesSection() {
  const [updates, setUpdates] = useState<AdminUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUpdate | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Form state (full release-entry shape) ─────────────────────────────
  const [formTitle, setFormTitle] = useState('')
  const [formSummary, setFormSummary] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formVersion, setFormVersion] = useState('')
  const [formReleaseType, setFormReleaseType] = useState<ReleaseType>('patch')
  const [formForceUpdate, setFormForceUpdate] = useState(false)
  const [formMinVersion, setFormMinVersion] = useState('')
  const [formPlatform, setFormPlatform] = useState<UpdatePlatform>('both')
  // Absolute http(s) URLs pointing at the real installer files (DMG / EXE).
  // These end up in data/updates.json as UpdateEntry.downloadUrls.{mac,windows}
  // — the app's update checker reads them and hands them to shell.openExternal.
  const [formMacUrl, setFormMacUrl] = useState('')
  const [formWinUrl, setFormWinUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchAllUpdates()
      .then(setUpdates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const flash = (msg: string) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 2500)
  }

  const resetForm = () => {
    setFormTitle('')
    setFormSummary('')
    setFormBody('')
    setFormVersion('')
    setFormReleaseType('patch')
    setFormForceUpdate(false)
    setFormMinVersion('')
    setFormPlatform('both')
    setFormMacUrl('')
    setFormWinUrl('')
    setFormError(null)
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    resetForm()
  }

  const openEdit = (u: AdminUpdate) => {
    setCreating(false)
    setEditing(u)
    setFormTitle(u.title)
    setFormSummary(u.summary)
    setFormBody(u.body)
    setFormVersion(u.version)
    setFormReleaseType(u.release_type ?? 'patch')
    setFormForceUpdate(u.force_update ?? false)
    setFormMinVersion(u.min_version ?? '')
    setFormPlatform(u.platform ?? 'both')
    setFormMacUrl(u.mac_url ?? '')
    setFormWinUrl(u.win_url ?? '')
    setFormError(null)
  }

  const closeForm = () => {
    setEditing(null)
    setCreating(false)
  }

  /** Assemble the current form state into a validated `UpdateInput`. */
  const buildInput = (status?: 'draft' | 'published'): UpdateInput => ({
    title: formTitle.trim(),
    summary: formSummary,
    body: formBody,
    version: formVersion.trim(),
    releaseType: formReleaseType,
    forceUpdate: formForceUpdate,
    minVersion: formMinVersion.trim() || null,
    platform: formPlatform,
    // Download URLs: only include the sides the platform choice actually
    // targets. Selecting 'mac' clears any stale Windows URL from the payload
    // so the local store never ends up with a Windows installer pointer on
    // a macOS-only release (and vice versa).
    macUrl: formPlatform === 'windows' ? null : (formMacUrl.trim() || null),
    winUrl: formPlatform === 'mac'     ? null : (formWinUrl.trim() || null),
    status,
  })

  /**
   * Mirror the current form state into the local `data/updates.json` store
   * via the Electron update bridge. This is what the main app actually
   * reads on launch — Supabase remains the source-of-truth for admin UI,
   * but the client-update pipeline lives off this JSON file.
   *
   * `downloadUrls` is what `UpdateModal` eventually hands to shell.openExternal
   * via `update:open-download`. Omit the object entirely when no URL was
   * provided for either platform — the main-process `update:save` handler
   * falls back to auto-generating `/updates/{version}/{mac.dmg|windows.exe}`
   * relative paths (useful only if installers are bundled into `public/`).
   */
  const mirrorToLocalStore = async (input: UpdateInput, id?: string) => {
    if (typeof window === 'undefined' || !window.updateAPI) return
    const mapPlatform = (p: UpdatePlatform) =>
      p === 'mac' ? 'macOS' : p === 'windows' ? 'Windows' : 'Both'
    const mac = input.macUrl?.trim() || undefined
    const windows = input.winUrl?.trim() || undefined
    const downloadUrls = (mac || windows) ? { mac, windows } : undefined
    await window.updateAPI.save({
      id: id ?? `v${input.version.replace(/\./g, '_')}`,
      version: input.version,
      title: input.title,
      summary: input.summary,
      body: input.body,
      platform: mapPlatform(input.platform) as 'macOS' | 'Windows' | 'Both',
      force: input.forceUpdate,
      minimumVersion: input.minVersion || undefined,
      downloadUrls,
    })
  }

  const handleSave = async () => {
    const input = buildInput('draft')
    const v = validateUpdateInput(input, updates, editing?.id)
    if (v) { setFormError(v); return }
    setFormError(null)
    setSaving(true)
    if (creating) {
      const r = await createUpdate(input)
      flash(r.success ? 'Update created' : r.error ?? 'Failed')
    } else if (editing) {
      const r = await editUpdate({ ...input, id: editing.id })
      flash(r.success ? 'Update saved' : r.error ?? 'Failed')
    }
    // Draft entries are captured locally so admins can preview the client
    // behaviour without publishing first. Clients filter by presence of a
    // published flag separately (none yet — JSON entries are published).
    await mirrorToLocalStore(input, editing?.id)
    setSaving(false)
    closeForm()
    load()
  }

  const handleSaveAndPublish = async () => {
    const input = buildInput('published')
    const v = validateUpdateInput(input, updates, editing?.id)
    if (v) { setFormError(v); return }
    setFormError(null)
    setSaving(true)
    if (creating) {
      const r = await createUpdate(input)
      flash(r.success ? 'Update published' : r.error ?? 'Failed')
    } else if (editing) {
      await editUpdate({ ...input, id: editing.id })
      const r = await publishUpdate(editing.id)
      flash(r.success ? 'Update published' : r.error ?? 'Failed')
    }
    await mirrorToLocalStore(input, editing?.id)
    setSaving(false)
    closeForm()
    load()
  }

  const handlePublish = async (id: string) => {
    const r = await publishUpdate(id)
    flash(r.success ? 'Published' : r.error ?? 'Failed')
    load()
  }

  const handleUnpublish = async (id: string) => {
    const r = await unpublishUpdate(id)
    flash(r.success ? 'Unpublished' : r.error ?? 'Failed')
    load()
  }

  const handleDelete = async (id: string) => {
    const r = await deleteUpdate(id)
    flash(r.success ? 'Deleted' : r.error ?? 'Failed')
    setDeleteConfirm(null)
    load()
  }

  if (error) return <ErrorMsg msg={error} />
  if (loading) return <Loading />

  // Editor form
  if (creating || editing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={closeForm}
            className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer transition-colors"
          >
            &larr; Back
          </button>
          <h1 className="text-[18px] font-bold text-white/80">
            {creating ? 'New Update' : 'Edit Update'}
          </h1>
        </div>
        <div className="max-w-[560px] flex flex-col gap-4">
          {/* ── Version (required, semver) ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Version <span className="text-negative">*</span>
            </label>
            <input
              value={formVersion}
              onChange={(e) => setFormVersion(e.target.value)}
              placeholder="1.2.0"
              className={clsx(
                'w-full px-3 py-2 rounded-lg text-[12px] font-mono bg-white/[0.03] border text-white/80 placeholder:text-white/15 outline-none',
                formVersion.trim() && !isValidSemver(formVersion.trim())
                  ? 'border-negative focus:border-negative'
                  : 'border-edge-resting focus:border-edge-strong',
              )}
            />
            <p className="text-[10px] text-white/25 mt-1">Semantic format (x.y.z). Duplicates are blocked.</p>
          </div>

          {/* ── Release type (3-way toggle) ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Release Type <span className="text-negative">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['major', 'minor', 'patch'] as ReleaseType[]).map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setFormReleaseType(rt)}
                  className={clsx(
                    'btn-select py-2 rounded-lg text-[11px] font-semibold border capitalize',
                    formReleaseType === rt
                      ? 'bg-white/[0.10] border-white/20 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.05] hover:text-white/60',
                  )}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>

          {/* ── Title ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">Title</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="What's new..."
              className={ADMIN_INPUT_BASE}
            />
          </div>

          {/* ── Summary ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">Summary</label>
            <input
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
              placeholder="One-line summary"
              className={ADMIN_INPUT_BASE}
            />
          </div>

          {/* ── Body / full release notes ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">Body</label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Full release notes..."
              rows={8}
              className={`${ADMIN_INPUT_BASE} resize-y leading-relaxed`}
            />
          </div>

          {/* ── Platform (3-way toggle) ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Platform <span className="text-negative">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['mac', 'macOS'],
                ['windows', 'Windows'],
                ['both', 'Both'],
              ] as [UpdatePlatform, string][]).map(([pl, label]) => (
                <button
                  key={pl}
                  type="button"
                  onClick={() => setFormPlatform(pl)}
                  className={clsx(
                    'btn-select py-2 rounded-lg text-[11px] font-semibold border',
                    formPlatform === pl
                      ? 'bg-white/[0.10] border-white/20 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.05] hover:text-white/60',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Installer URLs ─────────────────────────────────────────────
              Absolute http(s) URL to the actual DMG / EXE file users will
              download when they hit "Update Now". Shown per-platform based
              on the Platform selection above. Leave blank to fall back to
              the bundled `/updates/{version}/...` path inside the app's
              public folder (only useful when installers ship with the app
              itself). */}
          <div className="flex flex-col gap-3 pt-1 pb-2 px-3 rounded-lg border border-white/[0.06] bg-white/[0.015]">
            <div className="flex items-baseline justify-between pt-2">
              <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                Installer File — Download URL
              </label>
              <span className="text-[10px] text-white/20">
                actual file users download
              </span>
            </div>
            {(formPlatform === 'mac' || formPlatform === 'both') && (
              <div>
                <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
                  macOS (.dmg) <span className="text-white/15">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formMacUrl}
                  onChange={(e) => setFormMacUrl(e.target.value)}
                  placeholder="https://downloads.nookra.com/1.2.0/Nookra.dmg"
                  spellCheck={false}
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border text-white/80 placeholder:text-white/15 outline-none',
                    formMacUrl.trim() && !isValidDownloadUrl(formMacUrl.trim())
                      ? 'border-negative focus:border-negative'
                      : 'border-edge-resting focus:border-edge-strong',
                  )}
                />
              </div>
            )}
            {(formPlatform === 'windows' || formPlatform === 'both') && (
              <div>
                <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
                  Windows (.exe) <span className="text-white/15">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formWinUrl}
                  onChange={(e) => setFormWinUrl(e.target.value)}
                  placeholder="https://downloads.nookra.com/1.2.0/Nookra-Setup.exe"
                  spellCheck={false}
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border text-white/80 placeholder:text-white/15 outline-none',
                    formWinUrl.trim() && !isValidDownloadUrl(formWinUrl.trim())
                      ? 'border-negative focus:border-negative'
                      : 'border-edge-resting focus:border-edge-strong',
                  )}
                />
              </div>
            )}
          </div>

          {/* ── Minimum supported version (optional, semver if provided) ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Minimum Supported Version <span className="text-white/15">(optional)</span>
            </label>
            <input
              value={formMinVersion}
              onChange={(e) => setFormMinVersion(e.target.value)}
              placeholder="1.0.0"
              className={clsx(
                'w-full px-3 py-2 rounded-lg text-[12px] font-mono bg-white/[0.03] border text-white/80 placeholder:text-white/15 outline-none',
                formMinVersion.trim() && !isValidSemver(formMinVersion.trim())
                  ? 'border-negative focus:border-negative'
                  : 'border-edge-resting focus:border-edge-strong',
              )}
            />
            <p className="text-[10px] text-white/25 mt-1">Clients below this version must update before continuing.</p>
          </div>

          {/* ── Force update toggle ── */}
          <div>
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Force Update
            </label>
            <button
              type="button"
              onClick={() => setFormForceUpdate((v) => !v)}
              className={clsx(
                'btn-select w-full flex items-center justify-between px-3 py-2 rounded-lg border',
                formForceUpdate
                  ? 'bg-warning-soft border-warning text-warning'
                  : 'bg-surface-resting border-edge-resting text-secondary hover:bg-surface-hover',
              )}
            >
              <span className="text-[12px] font-medium">
                {formForceUpdate ? 'Required — clients must update' : 'Optional — clients can defer'}
              </span>
              <span
                className={clsx(
                  'relative w-8 h-4 rounded-full transition-[background-color] duration-150',
                  formForceUpdate ? 'bg-warning' : 'bg-surface-active',
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150',
                    formForceUpdate ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </span>
            </button>
          </div>

          {/* ── Inline validation error ── */}
          {formError && (
            <div className="px-3 py-2 rounded-lg bg-negative-soft border border-negative text-[11px] text-negative">
              {formError}
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-white/60 border border-white/[0.08] cursor-pointer transition-all duration-150 ease-out hover:bg-white/[0.04] hover:-translate-y-[2px] active:translate-y-0 disabled:opacity-30"
            >
              {saving ? 'Saving\u2026' : 'Save as Draft'}
            </button>
            <button
              onClick={handleSaveAndPublish}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold text-white border border-white/[0.08] cursor-pointer transition-[filter,transform,opacity] duration-150 ease-out hover:brightness-[1.06] hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.98] disabled:opacity-30"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {saving ? 'Publishing\u2026' : 'Save & Publish'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-bold text-white/80">Updates</h1>
        <div className="flex items-center gap-3">
          {actionMsg && <span className="text-[11px] text-positive">{actionMsg}</span>}
          <button
            onClick={openCreate}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.04] hover:-translate-y-[2px] active:translate-y-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            + New Update
          </button>
        </div>
      </div>

      {updates.length === 0 ? (
        <p className="py-12 text-center text-white/30 text-[12px]">No updates yet. Create your first one.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {updates.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-4 px-4 py-3 rounded-lg border border-white/[0.05] hover:bg-white/[0.02] transition-colors"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-medium text-white/70 truncate">{u.title}</span>
                  {u.version && (
                    <span className="text-[10px] text-white/25 font-mono shrink-0">{u.version}</span>
                  )}
                  {u.release_type && (
                    <span className="text-[9px] uppercase tracking-wider text-white/30 shrink-0 px-1.5 py-px rounded border border-white/[0.08]">
                      {u.release_type}
                    </span>
                  )}
                  {u.platform && u.platform !== 'both' && (
                    <span className="text-[9px] uppercase tracking-wider text-white/30 shrink-0 px-1.5 py-px rounded border border-white/[0.08]">
                      {u.platform}
                    </span>
                  )}
                  {u.force_update && (
                    <span className="text-[9px] uppercase tracking-wider text-warning shrink-0 px-1.5 py-px rounded bg-warning-soft border border-warning">
                      Force
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <StatusBadge status={u.status === 'published' ? 'active' : 'disabled'} />
                  <span className="text-white/20">
                    {u.published_at ? fmtDate(u.published_at) : fmtDate(u.created_at)}
                  </span>
                  {u.summary && (
                    <span className="text-white/20 truncate">&mdash; {u.summary}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {u.status === 'draft' ? (
                  <ActionBtn label="Publish" color="blue" onClick={() => handlePublish(u.id)} />
                ) : (
                  <ActionBtn label="Unpublish" color="amber" onClick={() => handleUnpublish(u.id)} />
                )}
                <ActionBtn label="Edit" onClick={() => openEdit(u)} />
                <ActionBtn label="Delete" color="red" onClick={() => setDeleteConfirm(u.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-[380px] rounded-xl border border-white/[0.08] p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface-floating)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-bold text-white/80">Delete Update</h2>
            <p className="text-[12px] text-white/40 leading-relaxed">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/30 border border-white/[0.06] cursor-pointer hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all bg-negative-strong text-negative border-negative hover:bg-[rgba(239,68,68,0.22)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section: Key Generator ───────────────────────────────────────────────────

/** Validate key format: XXXX-XXXX-XXXX-XXXX (alphanumeric, 4 groups of 4) */
function isValidKeyFormat(k: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)
}

/** Normalize key input: uppercase, strip non-alphanumeric (except dashes), auto-insert dashes */
function normalizeKeyInput(raw: string): string {
  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const parts = [stripped.slice(0, 4), stripped.slice(4, 8), stripped.slice(8, 12), stripped.slice(12, 16)]
  return parts.filter(Boolean).join('-')
}

function KeyGenSection() {
  const [key, setKey] = useState(generateKeyString())
  const [licenseName, setLicenseName] = useState('')
  const [maxDevices, setMaxDevices] = useState(2)
  const [status, setStatus] = useState<'active' | 'disabled'>('active')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeKeyInput(e.target.value)
    setKey(normalized)
    setKeyError(null)
    setResult(null)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(key).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleGenerate = () => {
    setKey(generateKeyString())
    setKeyError(null)
    setResult(null)
  }

  const handleSave = async () => {
    // Validate key format
    if (!key.trim()) {
      setKeyError('License key cannot be empty')
      return
    }
    if (!isValidKeyFormat(key)) {
      setKeyError('Key must be XXXX-XXXX-XXXX-XXXX format (letters and numbers)')
      return
    }
    setKeyError(null)
    setSaving(true)
    setResult(null)
    const r = await createLicense({
      licenseKey: key,
      ownerName: licenseName.trim() || undefined,
      maxDevices,
      status,
    })
    setSaving(false)
    if (r.success) {
      setResult({ success: true, msg: 'License created successfully' })
    } else {
      setResult({ success: false, msg: r.error ?? 'Failed to create license' })
    }
  }

  return (
    <div>
      <h1 className="text-[18px] font-bold text-white/80 mb-6">Generate License Key</h1>
      <div className="max-w-[480px] flex flex-col gap-4">
        {/* Generated key */}
        <div>
          <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
            License Key
          </label>
          <div className="flex gap-2">
            <input
              value={key}
              onChange={handleKeyChange}
              maxLength={19}
              spellCheck={false}
              className={`flex-1 px-3 py-2.5 rounded-lg font-mono text-[14px] text-secondary bg-surface-resting border outline-none focus:border-edge-strong transition-colors ${keyError ? 'border-negative' : 'border-edge-resting'}`}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg text-[11px] font-medium border border-white/[0.08] text-white/40 hover:text-white/70 hover:-translate-y-[2px] active:translate-y-0 cursor-pointer transition-all duration-150 ease-out"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleGenerate}
              className="px-3 py-2 rounded-lg text-[11px] font-medium border border-white/[0.08] text-white/40 hover:text-white/70 hover:-translate-y-[2px] active:translate-y-0 cursor-pointer transition-all duration-150 ease-out"
            >
              New
            </button>
          </div>
          {keyError && (
            <p className="text-[11px] text-negative mt-1">{keyError}</p>
          )}
        </div>

        {/* License Name */}
        <div>
          <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
            License Name
          </label>
          <input
            value={licenseName}
            onChange={(e) => setLicenseName(e.target.value)}
            placeholder="Optional — set by user on first activation"
            className={ADMIN_INPUT_BASE}
          />
        </div>

        {/* Max devices + Status */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Max Devices
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxDevices}
              onChange={(e) => setMaxDevices(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-[12px] bg-white/[0.03] border border-white/[0.06] text-white/60 outline-none focus:border-white/15"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/25 uppercase tracking-wider font-medium block mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}
              className="w-full px-3 py-2 rounded-lg text-[12px] bg-white/[0.03] border border-white/[0.06] text-white/60 outline-none focus:border-white/15"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-lg text-[12px] font-semibold text-white border border-white/[0.08] cursor-pointer transition-all hover:-translate-y-[2px] active:translate-y-0 disabled:opacity-30"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {saving ? 'Saving\u2026' : 'Create License'}
        </button>

        {result && (
          <p
            className={`text-[11px] text-center ${result.success ? 'text-positive' : 'text-negative'}`}
          >
            {result.msg}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ActionBtn({
  label,
  color,
  onClick,
}: {
  label: string
  color?: string
  onClick: () => void
}) {
  const c =
    color === 'red'
      ? 'text-negative hover:text-[#f87171] border-negative hover:border-[rgba(239,68,68,0.30)] hover:bg-[rgba(239,68,68,0.12)]'
      : color === 'amber'
        ? 'text-warning hover:text-warning border-warning hover:border-warning hover:bg-warning-soft'
        : color === 'blue'
          ? 'btn-accent'
          : 'text-tertiary hover:text-primary border-edge-resting hover:border-edge-strong hover:bg-surface-hover'
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[10px] font-medium border cursor-pointer transition-all hover:-translate-y-[2px] active:translate-y-0 ${c}`}
    >
      {label}
    </button>
  )
}

function CopyableId({ value, truncate }: { value: string; truncate?: number }) {
  const [copied, setCopied] = useState(false)
  const display = truncate && value.length > truncate ? value.slice(0, truncate) + '\u2026' : value
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      onClick={handleCopy}
      title={value}
      className="group inline-flex items-center gap-1.5 font-mono text-[10px] text-white/25 hover:text-white/50 cursor-pointer transition-colors text-left"
    >
      <span>{display}</span>
      <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {copied ? '✓ copied' : 'copy'}
      </span>
    </button>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[9px] text-white/25 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-[12px] text-white/60 mt-0.5 ${mono ? 'font-mono' : ''} break-all`}>
        {value}
      </p>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-[11px] text-white/20">Loading…</span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-[11px] text-negative">{msg}</span>
    </div>
  )
}
