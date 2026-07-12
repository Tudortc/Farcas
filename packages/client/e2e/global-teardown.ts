import fs from 'node:fs'

/** Remove the per-run throwaway data dir created in playwright.config.ts. */
export default function globalTeardown() {
  const dir = process.env.__BOOL_E2E_TMP
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
