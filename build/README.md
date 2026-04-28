# build/ — electron-builder resources

This directory holds the static assets electron-builder picks up automatically
when packaging Nookra for macOS and Windows. Drop the files below into this
directory before running `npm run dist`.

## Required assets

### `icon.icns` — macOS app icon
- Format: Apple `.icns` (multi-resolution)
- Must include `1024×1024` slice for Retina
- Used as: the app icon inside the DMG (and inside `/Applications` after drag)
- Referenced by: `electron-builder.json → mac.icon`

### `icon.ico` — Windows app icon
- Format: multi-resolution `.ico` (16, 32, 48, 64, 128, 256)
- Referenced by: `electron-builder.json → win.icon`

### `dmg-background.png` — DMG drag-to-install backdrop
- **Size: 600 × 400 px** (matches the DMG window configured in
  `electron-builder.json → dmg.window`). Retina users will also pick up
  `dmg-background@2x.png` at **1200 × 800 px** if you provide one.
- Design guidance (brand language):
  - Matte near-black canvas (`#09090b`) — same as the app shell
  - Single centered subtle accent touch (e.g. faint radial glow, wordmark at
    the top, or a hairline divider) — **no heavy graphics**
  - Leave the middle/bottom area clean: the Nookra app icon sits at
    `(160, 200)` and the Applications alias sits at `(440, 200)`
  - Optional: a faint arrow between them to reinforce "drag right to install"
- Referenced by: `electron-builder.json → dmg.background`

## Fallback behavior

If `dmg-background.png` is missing when you run `npm run dist`, electron-builder
falls back to the solid `backgroundColor` (`#09090b`) set in the config. The
icon positions still apply, so the layout stays clean — just without the
custom image.

If `icon.icns` is missing, electron-builder uses the default Electron icon.
The DMG will still build successfully either way.

## Icon layout (configured in `electron-builder.json`)

```
┌──────── Nookra (600 × 400) ─────────┐
│                                      │
│                                      │
│         ●                  ●         │
│       Nookra           Applications  │
│      (160, 200)         (440, 200)   │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

Icon size: 104 px. Label size: 12 pt. Symmetrical, with breathing room at the
top for an optional wordmark in the background image.
