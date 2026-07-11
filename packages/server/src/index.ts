import { buildApp } from './app.js'
import { firstAdminHint } from './bootstrap-admin.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { runRetention } from './retention.js'

export function startRetention(intervalMs = 6 * 60 * 60 * 1000): NodeJS.Timeout {
  const tick = () => {
    try {
      const n = runRetention(Date.now())
      if (n > 0) console.log(`retention: pruned ${n} messages`)
    } catch (err) {
      console.error('retention error', err)
    }
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return timer
}

const port = Number(process.env.PORT ?? 3030)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp()

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`bool server listening on ${address}`)
    try {
      ensureAppSchema(getDb())
      const admins = getDb()
        .prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin'")
        .get() as { n: number }
      if (admins.n === 0 && (process.env.BOOL_ADMIN_IDS ?? '') === '') {
        // eslint-disable-next-line no-console
        console.log(firstAdminHint())
      }
      startRetention()
    } catch {
      // eslint-disable-next-line no-console
      console.log(
        'Database not migrated yet — run: pnpm --filter @bool/server db:migrate',
      )
    }
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
