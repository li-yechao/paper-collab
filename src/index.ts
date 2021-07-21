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
import { Server } from 'socket.io'
import Client from './client'
import DB from './db'
import Instance from './instance'
import { IOEmitEvents, IOListenEvents, RemoteSocket } from './io'
import IPFS from './ipfs'

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

      io.on('connection', async socket => {
        console.info(`Client connected ${socket.handshake.address}`)
        Client.setup(socket, { ipfsGatewayUri, accessTokenSecret })
      })

      io.sockets.adapter
        .on('create-room', async room => {
          const key = Instance.keyInfo(room)
          if (key) {
            const instance = await Instance.getInstance(key)
            // NOTE: One instance only map to one room.
            // So we can remove all listeners of the instance.
            instance.removeAllListeners('persistence')
            instance.on('persistence', async () => {
              const sockets: RemoteSocket<{ client: Client }>[] = await io.in(room).fetchSockets()

              for (const s of sockets) {
                s.data.client.emitPersistence()
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

      process.on('SIGINT', async () => {
        try {
          io.removeAllListeners()
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
