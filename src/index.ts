// Copyright 2021 LiYechao
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  error: (e: { message: string }) => void
  paper: (e: {
    clientID: ClientID
    version: Version
    doc: DocJson
    ipfsGatewayUri: string
    readable: boolean
    writable: boolean
  }) => void
  transaction: (e: { version: Version; steps: DocJson[]; clientIDs: ClientID[] }) => void
  persistence: (e: {
    version: Version
    updatedAt: number
    readable: boolean
    writable: boolean
  }) => void
}

export interface AccessTokenPayload {
  iat: number
  exp: number
  sub: string
  paper_id: string
  writable?: boolean
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
            instance.on('persistence', async e => {
              for (const s of await io.in(room).fetchSockets()) {
                s.emit('persistence', {
                  ...e,
                  readable: s.data.readable(),
                  writable: s.data.writable(),
                })
              }
            })
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
          const { paperId } = socket.handshake.query
          if (typeof paperId !== 'string') {
            throw new Error(`Invalid paperId ${paperId}`)
          }

          const key = Instance.key({ paperId })
          socket.join(key)
          const instance = await Instance.getInstance({ paperId })

          socket.data.token = getToken(socket, accessTokenSecret)
          socket.data.writable = () => {
            return instance.isWritable || socket.data.token?.writable === true
          }
          socket.data.readable = () => {
            return instance.isPublic || socket.data.token?.paper_id === paperId
          }

          if (!socket.data.readable()) {
            throw new Error('Forbidden')
          }

          const { doc, version } = instance
          socket.data.version = version
          socket.emit('paper', {
            clientID: socket.id,
            version,
            doc: doc.toJSON(),
            ipfsGatewayUri,
            readable: socket.data.readable(),
            writable: socket.data.writable(),
          })
          socket.emit('persistence', {
            ...instance.persistence,
            readable: socket.data.readable(),
            writable: socket.data.writable(),
          })

          socket.on('transaction', async ({ version, steps }) => {
            if (!socket.data.writable()) {
              throw new Error(`Can not write anything`)
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
            if (!socket.data.writable()) {
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
        } catch (error) {
          console.error(error)
          socket.emit('error', { message: error.message })
          socket.disconnect()
          return
        }
      })

      process.on('SIGINT', async () => {
        try {
          io.sockets.disconnectSockets(true)
          await new Promise<void>((resolve, reject) =>
            io.close(err => (err ? reject(err) : resolve()))
          )
          await Instance.destroy()
          await DB.shared.destroy()
          await IPFS.shared.destroy()
          console.info('Stop server success')
          process.exit(0)
        } catch (error) {
          console.info('Stop server failure')
          console.error(error)
          process.exit(1)
        }
      })
    }
  )

function getToken(socket: Socket, secret: jsonwebtoken.Secret): AccessTokenPayload | undefined {
  const { authorization } = socket.handshake.headers
  if (!authorization) {
    return
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
      writable: typeof payload.writable === 'boolean' ? payload.writable : false,
    }
  }
  throw new Error('Unsupported token')
}

program.parse(process.argv)

process.on('uncaughtException', e => {
  console.error(e)
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
