// Shared website constants. Anything imported here should appear in 2+
// places — values used once should live next to their consumer.
//
// The support email was duplicated five times across Footer.tsx and FAQ.tsx
// (Contact link + three doc-modal bodies + the FAQ inline link). Pulling
// it here means a future address change is a one-line edit.

export const SUPPORT_EMAIL = 'nookratradingjournal@gmail.com'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`
