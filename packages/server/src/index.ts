import { buildApp } from './app.js'
import { firstAdminHint } from './bootstrap-admin.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'

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
