import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3030)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp()

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`bool server listening on ${address}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
