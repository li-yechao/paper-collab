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

import jsonwebtoken from 'jsonwebtoken'
import Instance from './instance'
import { IOListenEvents, RemoteSocket, Socket } from './io'
import IPFS from './ipfs'

export interface AccessTokenPayload {
  iat: number
  exp: number
  sub: string
  paper_id: string
  writable?: boolean
}

export interface ClientConfig {
  accessTokenSecret: string
  ipfsGatewayUri: string
}

export default class Client {
  static async setup(socket: Socket, config: ClientConfig) {
    try {
      const { paperId } = socket.handshake.query
      if (typeof paperId !== 'string') {
        throw new Error(`Invalid paperId ${paperId}`)
      }

      const key = Instance.key({ paperId })
      socket.join(key)

      const instance = await Instance.getInstance({ paperId })
      new Client(socket, instance, config)
    } catch (error) {
      socket.emit('error', { message: error.message })
      socket.disconnect()
    }
  }

  private constructor(socket: Socket, private instance: Instance, private config: ClientConfig) {
    this.socket = socket as any
    this.socket.data.client = this

    this.token = getToken(socket, config.accessTokenSecret) ?? null
    this.clientVersion = this.instance.version

    if (!this.readable) {
      throw new Error('Forbidden')
    }

    this.socket
      .on('transaction', this.onTransaction)
      .on('save', this.onSave)
      .on('createFile', this.onCreateFile)

    this.emitPaper()
    this.emitPersistence()
  }

  private socket: Socket<{ client: Client }>

  private token: AccessTokenPayload | null

  get id() {
    return this.socket.id
  }

  get readable() {
    return this.instance.isPublic || this.token?.paper_id === this.instance.paperId
  }

  get writable() {
    return this.instance.isWritable || this.token?.writable === true
  }

  clientVersion: number

  private onTransaction: IOListenEvents['transaction'] = async ({ version, steps }, cb) => {
    if (!this.writable) {
      cb({ message: 'Forbidden' })
      return
    }

    try {
      const result = this.instance.addEvents(version, steps, this.id)
      cb({ version: result.version })
    } catch (error) {
      cb({ message: error.message })
      return
    }

    this.emitTransaction()

    const sockets: RemoteSocket<{ client: Client }>[] = await this.socket
      .in(this.instance.key)
      .fetchSockets()

    for (const s of sockets) {
      s.data.client.emitTransaction()
    }
  }

  private onSave: IOListenEvents['save'] = async cb => {
    if (!this.writable) {
      cb({ message: 'Forbidden' })
      return
    }
    try {
      await this.instance.save()
      cb()
    } catch (error) {
      cb({ message: error.message })
    }
  }

  private onCreateFile: IOListenEvents['createFile'] = async ({ source }, cb) => {
    if (!this.writable) {
      cb({ message: 'Forbidden' })
      return
    }

    try {
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
    } catch (error) {
      cb({ message: error.message })
    }
  }

  emitPaper() {
    if (!this.readable) {
      return
    }

    const {
      writable,
      instance: { doc, version },
      config: { ipfsGatewayUri },
    } = this
    this.socket.emit('paper', {
      clientID: this.socket.id,
      version,
      doc: doc.toJSON(),
      ipfsGatewayUri,
      writable,
    })
    this.clientVersion = version
  }

  emitPersistence() {
    if (!this.readable) {
      return
    }

    const {
      writable,
      instance: {
        persistence: { version, updatedAt },
      },
    } = this
    this.socket.emit('persistence', {
      version,
      updatedAt,
      writable,
    })
  }

  emitTransaction() {
    if (!this.readable) {
      return
    }

    const e = this.instance.getEvents(this.clientVersion)
    if (e) {
      const { version, steps } = e
      const clientIDs = steps.map(i => i.clientID)
      this.clientVersion = version
      this.socket.emit('transaction', { version, steps, clientIDs })
    }
  }
}

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
