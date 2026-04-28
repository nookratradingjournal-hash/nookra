// ── Tutorial Scene Context ──────────────────────────────────────────────────
// Bridges the stateless action runner (services/tutorial/actions.ts) to the
// real app-level setters that live in App.tsx. App.tsx constructs a
// TutorialSceneContext object from its own hooks (setWidgetMenuOpen, etc.)
// and wraps its children in <TutorialSceneProvider value={ctx}>. The runner
// pulls the context via useTutorialScene() and calls through.
//
// Why a context and not prop-drilling? Because the action runner lives
// inside <TutorialProvider> (one level down from App), and we don't want
// every tutorial callsite to pass eight callbacks around. A context with
// a narrow interface keeps the coupling explicit but the call sites clean.

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import type { TutorialSceneContext } from './actions'

const SceneContext = createContext<TutorialSceneContext | null>(null)

export function TutorialSceneProvider({
  value,
  children,
}: {
  value: TutorialSceneContext
  children: ReactNode
}) {
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>
}

/**
 * Returns the scene context, or null if no provider is mounted. The runner
 * tolerates null — during tests or storybooks without the app shell, steps
 * with `onEnter` actions simply skip. Production code always has a provider
 * (App.tsx wraps the tree in one).
 */
export function useTutorialScene(): TutorialSceneContext | null {
  return useContext(SceneContext)
}
