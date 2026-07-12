export type ThemeId =
  | 'a' | 'a-light'
  | 'b' | 'b-light'
  | 'c' | 'c-light'
  | 'shimmer'
  | 'solarized-dark' | 'solarized-light'
  | 'gruvbox-dark' | 'gruvbox-light'
  | 'dracula' | 'nord' | 'monokai'

export type ThemeGroup = 'bool' | 'classic'

export interface ThemeMeta {
  id: ThemeId
  label: string
  group: ThemeGroup
  light: boolean
  /** Representative palette chips for the picker preview: [bg, surface, fg, accent, accent2]. */
  swatch: string[]
}

export const THEME_CATALOG: ThemeMeta[] = [
  // ---- bool group ----
  { id: 'a',        label: 'Terminal',     group: 'bool', light: false, swatch: ['#0a0c0d', '#151a1d', '#e6efe9', '#39e08b', '#ffb454'] },
  { id: 'a-light',  label: 'Terminal Light', group: 'bool', light: true,  swatch: ['#ffffff', '#eaeeec', '#141a18', '#0f9d58', '#c47f00'] },
  { id: 'b',        label: 'Editorial',    group: 'bool', light: false, swatch: ['#17130f', '#231d17', '#f3ece1', '#a3c48f', '#e8a76b'] },
  { id: 'b-light',  label: 'Editorial Light', group: 'bool', light: true,  swatch: ['#faf5ec', '#efe7da', '#2b2318', '#6f8f4e', '#c9793a'] },
  { id: 'c',        label: 'Aurora',       group: 'bool', light: false, swatch: ['#0b0b16', '#181733', '#f0eefe', '#a6f065', '#8b7dff'] },
  { id: 'c-light',  label: 'Aurora Light', group: 'bool', light: true,  swatch: ['#ffffff', '#eef0fb', '#16142e', '#6a5af0', '#4b9e2f'] },
  { id: 'shimmer',  label: 'Shimmer',      group: 'bool', light: false, swatch: ['#141109', '#2b251c', '#f3ead9', '#9db665', '#e08159'] },
  // ---- classic group ----
  { id: 'solarized-dark',  label: 'Solarized Dark',  group: 'classic', light: false, swatch: ['#002b36', '#073642', '#93a1a1', '#268bd2', '#859900'] },
  { id: 'solarized-light', label: 'Solarized Light', group: 'classic', light: true,  swatch: ['#fdf6e3', '#eee8d5', '#586e75', '#268bd2', '#859900'] },
  { id: 'gruvbox-dark',    label: 'Gruvbox Dark',    group: 'classic', light: false, swatch: ['#282828', '#3c3836', '#ebdbb2', '#fe8019', '#b8bb26'] },
  { id: 'gruvbox-light',   label: 'Gruvbox Light',   group: 'classic', light: true,  swatch: ['#fbf1c7', '#ebdbb2', '#3c3836', '#af3a03', '#79740e'] },
  { id: 'dracula',         label: 'Dracula',         group: 'classic', light: false, swatch: ['#282a36', '#44475a', '#f8f8f2', '#bd93f9', '#50fa7b'] },
  { id: 'nord',            label: 'Nord',            group: 'classic', light: false, swatch: ['#2e3440', '#3b4252', '#eceff4', '#88c0d0', '#a3be8c'] },
  { id: 'monokai',         label: 'Monokai',         group: 'classic', light: false, swatch: ['#272822', '#3e3d32', '#f8f8f2', '#f92672', '#a6e22e'] },
]
