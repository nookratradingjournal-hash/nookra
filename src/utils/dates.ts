/**
 * Timezone-safe date utilities.
 *
 * Root bug: `new Date().toISOString().slice(0,10)` returns the UTC date.
 * For users in negative UTC offsets (e.g. UTC-4 Eastern), after ~8 PM local
 * time UTC rolls to the next calendar day — the app shows tomorrow's date.
 *
 * Fix: use Intl.DateTimeFormat with the user's IANA timezone to compute the
 * correct local calendar date, then format it as YYYY-MM-DD.
 */

/**
 * Get today's date as YYYY-MM-DD in the given IANA timezone.
 * Uses `en-CA` locale which natively formats as YYYY-MM-DD.
 */
export function localToday(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    }).format(new Date())
  } catch {
    // Fallback: use local Date accessors (still better than toISOString)
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/**
 * Get the YYYY-MM-DD date N calendar days before today in the given timezone.
 * Uses local date arithmetic so month/year boundaries are handled correctly.
 */
export function daysAgoInTz(tz: string, n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    }).format(d)
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/**
 * Parse a YYYY-MM-DD string into a local-time Date (noon on that day).
 *
 * DO NOT use `new Date('YYYY-MM-DD')` — the spec treats bare date strings as
 * UTC midnight, which shifts to the previous calendar day for users west of UTC
 * (e.g. UTC-4 sees April 12 become April 11 at 8 PM).
 *
 * DO NOT use `new Date('YYYY-MM-DDT12:00:00')` — JavaScript without an
 * explicit timezone suffix is implementation-defined and behaves as UTC in
 * strict ISO parse mode on many engines.
 *
 * This function uses the local-time constructor `new Date(y, m, d)` which is
 * unambiguously local time in every browser and Node version.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── Display formatters ────────────────────────────────────────────────────────

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const MONTHS_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/** "April 12, 2025" */
export function fmtDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "Monday, April 12, 2025" */
export function fmtDateFull(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${DOW_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "Mon, Apr 12" */
export function fmtDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${DOW_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

// ── Timezone options ──────────────────────────────────────────────────────────

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HST, UTC−10)'        },
  { value: 'America/Anchorage',   label: 'Alaska (AKT, UTC−9)'         },
  { value: 'America/Los_Angeles', label: 'Pacific (PT, UTC−8/−7)'      },
  { value: 'America/Denver',      label: 'Mountain (MT, UTC−7/−6)'     },
  { value: 'America/Chicago',     label: 'Central (CT, UTC−6/−5)'      },
  { value: 'America/New_York',    label: 'Eastern (ET, UTC−5/−4)'      },
  { value: 'America/Toronto',     label: 'Toronto (ET, UTC−5/−4)'      },
  { value: 'America/Vancouver',   label: 'Vancouver (PT, UTC−8/−7)'    },
  { value: 'America/Sao_Paulo',   label: 'São Paulo (BRT, UTC−3)'      },
  { value: 'UTC',                 label: 'UTC (UTC±0)'                  },
  { value: 'Europe/London',       label: 'London (GMT/BST, UTC±0/+1)'  },
  { value: 'Europe/Paris',        label: 'Paris (CET, UTC+1/+2)'       },
  { value: 'Europe/Berlin',       label: 'Berlin (CET, UTC+1/+2)'      },
  { value: 'Europe/Zurich',       label: 'Zurich (CET, UTC+1/+2)'      },
  { value: 'Europe/Amsterdam',    label: 'Amsterdam (CET, UTC+1/+2)'   },
  { value: 'Europe/Stockholm',    label: 'Stockholm (CET, UTC+1/+2)'   },
  { value: 'Europe/Moscow',       label: 'Moscow (MSK, UTC+3)'         },
  { value: 'Asia/Dubai',          label: 'Dubai (GST, UTC+4)'          },
  { value: 'Asia/Kolkata',        label: 'India (IST, UTC+5:30)'       },
  { value: 'Asia/Singapore',      label: 'Singapore (SGT, UTC+8)'      },
  { value: 'Asia/Shanghai',       label: 'China (CST, UTC+8)'          },
  { value: 'Asia/Hong_Kong',      label: 'Hong Kong (HKT, UTC+8)'      },
  { value: 'Asia/Tokyo',          label: 'Tokyo (JST, UTC+9)'          },
  { value: 'Asia/Seoul',          label: 'Seoul (KST, UTC+9)'          },
  { value: 'Australia/Sydney',    label: 'Sydney (AEDT, UTC+10/+11)'   },
  { value: 'Pacific/Auckland',    label: 'Auckland (NZDT, UTC+12/+13)' },
]

/** Detect the browser's IANA timezone name. */
export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
