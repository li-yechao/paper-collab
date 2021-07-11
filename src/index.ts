import { program } from 'commander'
import jsonwebtoken from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'
import DB, { DocJson, Version } from './db'
import Instance, { ClientID } from './instance'
import IPFS from './ipfs'

export interface CreateFileSource {
  path: string
  content: ArrayBuffer
}

export interface IOListenEvents {
  transaction: (e: { version: Version; steps: DocJson[] }) => void
  save: () => void
  createFile: (
    e: { source: CreateFileSource | CreateFileSource[] },
    cb: (e: { hash: string[] }) => void
  ) => void
}

export interface IOEmitEvents {
  paper: (e: { clientID: ClientID; version: Version; doc: DocJson; ipfsGatewayUri: string }) => void
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
  .option(
    '-p, --port [port]',
    'Listening port',
    createIntParser(0, 65535, v => `Invalid port ${v}`),
    8080
  )
  .option(
    '--ipfs-gateway-port [port]',
    'IPFS gateway listening port',
    createIntParser(0, 65535, v => `Invalid ipfs gateway port ${v}`),
    8081
  )
  .requiredOption('--ipfs-gateway-uri [uri]', 'IPFS gateway uri, like https://example.com/ipfs')
  .requiredOption('--ipfs-repo-path [path]', 'IPFS repo path')
  .requiredOption('--access-token-secret [secret]', 'Access token secret')
  .option(
    '--auto-save-wait [milliseconds]',
    'Auto save wait milliseconds',
    createIntParser(0, Number.MAX_SAFE_INTEGER, v => `Invalid auto save wait milliseconds ${v}`),
    5000
  )
  .option(
    '--auto-release-instance-wait [milliseconds]',
    'Auto release instance wait milliseconds',
    createIntParser(
      0,
      Number.MAX_SAFE_INTEGER,
      v => `Invalid auto release instance wait milliseconds ${v}`
    ),
    60000
  )
  .requiredOption('--mongo-uri [uri]', 'Mongodb uri')
  .requiredOption('--mongo-database [database]', 'Mongodb database name')
  .requiredOption('--mongo-collection-paper [collection]', 'Mongodb paper collection name')
  .option(
    '--max-buffer-size [buffer size]',
    'Max buffer size',
    createIntParser(0, Number.MAX_SAFE_INTEGER, v => `Invalid max buffer size ${v}`),
    1 << 20
  )
  .action(
    async ({
      port,
      ipfsGatewayPort,
      ipfsGatewayUri,
      ipfsRepoPath,
      accessTokenSecret,
      mongoUri,
      mongoDatabase,
      mongoCollectionPaper,
      autoSaveWait,
      autoReleaseInstanceWait,
      maxBufferSize,
    }) => {
      IPFS.initShared({
        path: ipfsRepoPath,
        gateway: {
          port: ipfsGatewayPort,
        },
      })

      DB.initShared({
        uri: mongoUri,
        database: mongoDatabase,
        collectionPaper: mongoCollectionPaper,
      })

      Instance.initShared({
        autoSaveWaitMilliseconds: autoSaveWait,
        autoReleaseInstanceWaitMilliseconds: autoReleaseInstanceWait,
      })

      await IPFS.shared.startHttpGateway()
      console.info(`IPFS gateway started on port ${ipfsGatewayPort}`)

      const io = new Server<IOListenEvents, IOEmitEvents>(port, {
        cors: {},
        maxHttpBufferSize: maxBufferSize,
      })
      console.info(`Paper collab server started on port ${port}`)

      io.sockets.adapter
        .on('create-room', async room => {
          const key = Instance.keyInfo(room)
          if (key) {
            const instance = await Instance.getInstance(key)
            // NOTE: One instance only map to one room.
            // So we can remove all listeners of the instance.
            instance.removeAllListeners('persistence')
            instance.on('persistence', e => io.in(room).emit('persistence', e))
          }
        })
        .on('delete-room', async room => {
          const key = Instance.keyInfo(room)
          if (key) {
            Instance.markInstanceGC(key)
          }
        })

      io.on('connection', async socket => {
        console.info(`Client connected ${socket.handshake.address}`)

        try {
          const token = getToken(socket, accessTokenSecret)
          const { paperId } = socket.handshake.query
          if (token.paper_id !== paperId) {
            throw new Error(`Forbidden access paper ${paperId}`)
          }

          const key = Instance.key({ paperId })
          socket.join(key)
          const instance = await Instance.getInstance({ paperId })

          const { doc, version } = instance
          socket.data.version = version
          socket.emit('paper', { clientID: socket.id, version, doc: doc.toJSON(), ipfsGatewayUri })
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
          socket.on('createFile', async ({ source }, cb) => {
            if (Array.isArray(source)) {
              const hash: string[] = []
              for await (const r of await IPFS.shared.addAll(source)) {
                hash.push(r.cid.toString())
              }
              cb({ hash })
            } else {
              const { cid } = await IPFS.shared.add(source)
              cb({ hash: [cid.toString()] })
            }
          })
          socket.on('error', error => {
            console.error(error)
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

process.on('SIGINT', async () => {
  await Instance.destroy()
  await DB.shared.destroy()
  await IPFS.shared.destroy()
})

function createIntParser(min: number, max: number, message: (value: string) => string) {
  return (value: string) => {
    const n = parseInt(value)
    if (!Number.isSafeInteger(n) || n <= min || n >= max) {
      throw new Error(message(value))
    }
    return n
  }
}
