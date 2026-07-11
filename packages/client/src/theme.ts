import { create } from 'zustand'

export type ThemeId = 'a' | 'b' | 'c' | 'shimmer'
export type Density = 'compact' | 'comfortable'

export function applyAppearance(theme: ThemeId, density: Density): void {
  const el = document.documentElement
  if (theme === 'a') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme === 'b' || theme === 'c' || theme === 'shimmer' ? theme : 'a')
  el.setAttribute('data-density', density)
}

interface AppearanceState {
  theme: ThemeId
  density: Density
  setTheme: (t: ThemeId) => void
  setDensity: (d: Density) => void
}

function readTheme(): ThemeId {
  try { return (localStorage.getItem('bool.theme') as ThemeId) ?? 'a' } catch { return 'a' }
}
function readDensity(): Density {
  try { return (localStorage.getItem('bool.density') as Density) ?? 'compact' } catch { return 'compact' }
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  theme: readTheme(),
  density: readDensity(),
  setTheme: (theme) => {
    localStorage.setItem('bool.theme', theme)
    applyAppearance(theme, get().density)
    set({ theme })
  },
  setDensity: (density) => {
    localStorage.setItem('bool.density', density)
    applyAppearance(get().theme, density)
    set({ density })
  },
}))
