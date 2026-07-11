import { buildApp } from './app.js'
import { firstAdminHint } from './bootstrap-admin.js'
import { getDb } from './db.js'

const port = Number(process.env.PORT ?? 3030)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp()

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`bool server listening on ${address}`)
    const admins = getDb()
      .prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin'")
      .get() as { n: number }
    if (admins.n === 0 && (process.env.BOOL_ADMIN_IDS ?? '') === '') {
      // eslint-disable-next-line no-console
      console.log(firstAdminHint())
    }
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
