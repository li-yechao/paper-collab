import { program } from 'commander'
import { Server } from 'socket.io'
import Config from './config'
import { EmitEvents, ListenEvents } from './events'
import { selectPaper } from './graphql'
import Instance from './instance'

program.name('paper-collab')

program
  .command('serve')
  .description('Start collab server')
  .option('-p, --port [port]', 'Listening port', '8080')
  .requiredOption('--mongo-uri [uri]', 'Mongodb uri')
  .requiredOption('--mongo-database [database]', 'Mongodb database name')
  .requiredOption('--mongo-paper-collection [collection]', 'Mongodb paper collection name')
  .requiredOption(
    '--mongo-paper-content-collection [collection]',
    'Mongodb paper content collection name'
  )
  .requiredOption('--paper-graphql-uri [uri]', 'Paper graphql uri')
  .action(
    ({
      port,
      mongoUri,
      mongoDatabase,
      mongoPaperCollection,
      mongoPaperContentCollection,
      paperGraphqlUri,
    }) => {
      Config.initShared({
        port: Number(port),
        mongoUri,
        mongoDatabase,
        mongoPaperCollection,
        mongoPaperContentCollection,
        paperGraphqlUri,
      })

      const io = new Server<ListenEvents, EmitEvents>(Config.shared.port, { cors: {} })

      console.info(`Paper collab server started on port ${Config.shared.port}`)

      io.on('connection', async socket => {
        console.info(`Client connected ${socket.handshake.address}`)
        const { accessToken, userId, paperId } = socket.handshake.query
        if (
          typeof accessToken !== 'string' ||
          typeof userId !== 'string' ||
          typeof paperId !== 'string'
        ) {
          socket._error('Required query parameters accessToken or userId or paperId is not present')
          socket.disconnect()
          return
        }

        try {
          const key = Instance.key({ userId, paperId })

          const paper = await selectPaper({ accessToken, userId, paperId })
          socket.data.paper = paper
          socket.join(key)
          const instance = await Instance.getInstance({ userId, paperId })
          const { doc, version } = instance
          socket.data.version = version
          socket.emit('paper', { version, doc: doc.toJSON() })

          socket.on('transaction', async ({ version, steps, clientID }) => {
            instance.addEvents(version, steps, clientID)
            for (const s of await socket.nsp.in(key).fetchSockets()) {
              const e = instance.getEvents(s.data.version)
              if (e) {
                const { version, steps } = e
                const clientIDs = steps.map(i => i.clientID)
                s.data.version = version
                s.emit('transaction', { version, steps, clientIDs })
              }
            }
          })
        } catch (error) {
          socket._error(error.message)
          socket.disconnect()
          return
        }
      })
    }
  )

program.parse(process.argv)

process.on('uncaughtException', e => {
  console.error(e)
})
