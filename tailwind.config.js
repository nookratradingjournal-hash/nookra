/** @type {import('tailwindcss').Config} */
//
// ── Design System Tokens ───────────────────────────────────────────────────
// Strict type scale + semantic colors. Everything in the UI should pull from
// this file instead of inventing ad-hoc `text-[NNpx]` or `text-white/NN`
// values. Scale is modelled after macOS Human Interface Guidelines + Claude
// UI — tight ratios, no intermediate increments.
//
// TYPE SCALE (pick one of these — do not invent in-between values):
//   ui-xs      11px / 16px  → captions, timestamps, meta
//   ui-sm      12px / 17px  → labels, secondary ui chrome
//   ui-base    14px / 20px  → body / input / button text
//   ui-md      15px / 22px  → emphasized body, welcome copy
//   ui-lg      16px / 24px  → subtitles
//   title-sm   22px / 28px  → panel titles ("Activate Nookra")
//   title-md   24px / 30px  → feature titles
//   title-lg   28px / 34px  → hero / numeric display
//
// FONT WEIGHTS:
//   400 regular — body copy
//   500 medium  — labels, emphasized body, most buttons
//   600 semibold — titles + primary CTAs
//   (700+ avoided — too heavy for the macOS feel)
//
// TEXT OPACITY TIERS (use these exact values — see --text-* CSS vars in
// index.css for runtime reference):
//   primary    rgba(255,255,255,0.90)   headlines + critical body
//   secondary  rgba(255,255,255,0.65)   standard body copy
//   tertiary   rgba(255,255,255,0.45)   supporting / captions
//   quaternary rgba(255,255,255,0.28)   placeholder / disabled
//   ghost      rgba(255,255,255,0.15)   iconography chrome only
//
export default {
  content: ['./index.html', './admin.html', './website.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    'text-ui-xs', 'text-ui-sm', 'text-ui-base', 'text-ui-md', 'text-ui-lg',
    'text-title-sm', 'text-title-md', 'text-title-lg',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'] },
      fontSize: {
        'ui-xs':   ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'ui-sm':   ['12px', { lineHeight: '17px', letterSpacing: '0.005em' }],
        'ui-base': ['14px', { lineHeight: '20px', letterSpacing: '0' }],
        'ui-md':   ['15px', { lineHeight: '22px', letterSpacing: '0' }],
        'ui-lg':   ['16px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        'title-sm':['22px', { lineHeight: '28px', letterSpacing: '-0.015em' }],
        'title-md':['24px', { lineHeight: '30px', letterSpacing: '-0.02em' }],
        'title-lg':['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      },
      colors: {
        surface: {
          0: '#080808',
          1: '#0f0f0f',
          2: '#161616',
          3: '#1e1e1e',
          4: '#2a2a2a',
        },
        // Semantic text tokens — match CSS variable tiers in index.css
        text: {
          primary:    'rgba(255,255,255,0.90)',
          secondary:  'rgba(255,255,255,0.65)',
          tertiary:   'rgba(255,255,255,0.45)',
          quaternary: 'rgba(255,255,255,0.28)',
          ghost:      'rgba(255,255,255,0.15)',
        },
      },
      borderRadius: {
        // macOS panel / control radius scale — softer, more "floating card"
        // Panel radius bumped 22 → 28 to feel clearly more rounded on modals
        // and drawers (premium Mac-style). Card bumped 18 → 22 to keep the
        // proportional hierarchy intact so inner cards don't look sharper
        // than the shell they sit inside.
        control: '12px',  // buttons, inputs, small controls
        card:    '22px',  // cards, tab surfaces
        panel:   '32px',  // windows, modals (bumped 22 → 28 → 32 for clearly premium softness)
      },
    },
  },
  plugins: [],
}
