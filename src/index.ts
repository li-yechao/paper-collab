import { program } from 'commander'
import jsonwebtoken from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'
import Config from './config'
import { DocJson, Version } from './db'
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

export interface AccessTokenPayload {
  iat: number
  exp: number
  sub: string
  paper_id: string
  read_only?: boolean
}

program.name('paper-collab')

program
  .command('serve')
  .description('Start collab server')
  .option('-p, --port [port]', 'Listening port', '8080')
  .requiredOption('--access-token-secret [secret]', 'Access token secret')
  .option('--auto-save-wait [milliseconds]', 'Auto save wait milliseconds', '5000')
  .requiredOption('--mongo-uri [uri]', 'Mongodb uri')
  .requiredOption('--mongo-database [database]', 'Mongodb database name')
  .requiredOption('--mongo-collection-paper [collection]', 'Mongodb paper collection name')
  .action(
    ({ port, accessTokenSecret, mongoUri, mongoDatabase, mongoCollectionPaper, autoSaveWait }) => {
      Config.initShared({
        port: Number(port),
        accessTokenSecret,
        mongoUri,
        mongoDatabase,
        mongoCollectionPaper,
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

        try {
          const token = getToken(socket, Config.shared.accessTokenSecret)
          const { paperId } = socket.handshake.query
          if (token.paper_id !== paperId) {
            throw new Error(`Forbidden access paper ${paperId}`)
          }

          const key = Instance.key({ paperId })
          socket.join(key)
          const instance = await Instance.getInstance({ paperId })

          const { doc, version } = instance
          socket.data.version = version
          socket.emit('paper', { clientID: socket.id, version, doc: doc.toJSON() })
          socket.emit('persistence', instance.persistence)

          socket.on('transaction', async ({ version, steps }) => {
            if (!token.read_only) {
              throw new Error(`ReadOnly can not write anything`)
            }

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
            if (!token.read_only) {
              throw new Error(`ReadOnly can not write anything`)
            }

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

function getToken(socket: Socket, secret: jsonwebtoken.Secret): AccessTokenPayload {
  const { authorization } = socket.handshake.headers
  if (!authorization) {
    throw new Error('Required header Authorization is not present')
  }
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Invalid token type')
  }
  const payload = jsonwebtoken.verify(authorization.replace(/^Bearer\s/, ''), secret)
  if (
    typeof payload === 'object' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    typeof payload.sub === 'string' &&
    typeof payload.paper_id === 'string'
  ) {
    return {
      iat: payload.iat,
      exp: payload.exp,
      sub: payload.sub,
      paper_id: payload.paper_id,
      read_only: typeof payload.read_only === 'boolean' ? payload.read_only : true,
    }
  }
  throw new Error('Unsupported token')
}

program.parse(process.argv)

process.on('uncaughtException', e => {
  console.error(e)
})
