// ── Semantic Version Comparison ──────────────────────────────────────────
// Tiny, zero-dependency semver compare.
//
// Exports:
//   * compareVersions(a, b) — returns -1 | 0 | 1. Handles normal releases
//     with numeric (not string) segment compare, orders pre-release tags
//     below the matching stable (`1.2.0-rc.1 < 1.2.0 < 1.2.1`), and
//     ignores build metadata per the semver spec.

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

interface Parsed {
  major: number
  minor: number
  patch: number
  pre: string[]   // empty = stable release
}

function parse(v: string): Parsed | null {
  const m = v.trim().match(SEMVER_RE)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  }
}

/**
 * Compare two semver strings.
 * Returns:
 *   -1  a < b
 *    0  a == b (ignoring build metadata)
 *    1  a > b
 * Invalid inputs compare as 0 — callers should pre-validate if they care.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0

  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1

  // Same x.y.z — pre-release versions are LOWER than the stable release.
  //   1.2.0-rc.1 < 1.2.0
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1

  // Both have pre-release tags — compare identifier by identifier.
  const len = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < len; i++) {
    const aId = pa.pre[i]
    const bId = pb.pre[i]
    if (aId === undefined) return -1   // shorter = lower (1.0.0-alpha < 1.0.0-alpha.1)
    if (bId === undefined) return 1
    const aNum = /^\d+$/.test(aId)
    const bNum = /^\d+$/.test(bId)
    if (aNum && bNum) {
      const na = Number(aId), nb = Number(bId)
      if (na !== nb) return na < nb ? -1 : 1
    } else if (aNum !== bNum) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return aNum ? -1 : 1
    } else if (aId !== bId) {
      return aId < bId ? -1 : 1
    }
  }
  return 0
}

