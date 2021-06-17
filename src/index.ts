import { program } from 'commander'
import { Server } from 'socket.io'
import Config from './config'
import { DocJson, Version } from './db'
import { selectPaper } from './graphql'
import Instance, { ClientID } from './instance'

export interface IOListenEvents {
  transaction: (e: { version: Version; steps: DocJson[] }) => void
  save: () => void
}

export interface IOEmitEvents {
  paper: (e: { clientID: ClientID; version: Version; doc: DocJson }) => void
  transaction: (e: { version: Version; steps: DocJson[]; clientIDs: ClientID[] }) => void
  persistence: (e: { version: Version; updatedAt: number }) => void
}

program.name('paper-collab')

program
  .command('serve')
  .description('Start collab server')
  .option('-p, --port [port]', 'Listening port', '8080')
  .option('--auto-save-wait [milliseconds]', 'Auto save wait milliseconds', '5000')
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
      autoSaveWait,
    }) => {
      Config.initShared({
        port: Number(port),
        mongoUri,
        mongoDatabase,
        mongoPaperCollection,
        mongoPaperContentCollection,
        paperGraphqlUri,
        autoSaveWaitMilliseconds: Number(autoSaveWait),
      })

      const io = new Server<IOListenEvents, IOEmitEvents>(Config.shared.port, { cors: {} })

      console.info(`Paper collab server started on port ${Config.shared.port}`)

      io.sockets.adapter.on('create-room', async room => {
        const key = Instance.keyInfo(room)
        if (key) {
          const instance = await Instance.getInstance(key)
          instance.on('persistence', e => io.in(room).emit('persistence', e))
        }
      })

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
          socket.emit('paper', { clientID: socket.id, version, doc: doc.toJSON() })
          socket.emit('persistence', instance.persistence)

          socket.on('transaction', async ({ version, steps }) => {
            const e = instance.addEvents(version, steps, socket.id)
            socket.data.version = e.version

            for (const s of await socket.in(key).fetchSockets()) {
              const e = instance.getEvents(s.data.version)
              if (e) {
                const { version, steps } = e
                const clientIDs = steps.map(i => i.clientID)
                s.data.version = version
                s.emit('transaction', { version, steps, clientIDs })
              }
            }
          })
          socket.on('save', () => {
            instance.save()
          })
        } catch (error) {
          console.error(error)
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
