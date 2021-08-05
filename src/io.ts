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

import { RemoteSocket as _RemoteSocket, Socket as _Socket } from 'socket.io'
import { DocJson, Version } from './db'
import { ClientID } from './instance'

export type Socket<T = {}> = Omit<_Socket<IOListenEvents, IOEmitEvents>, 'data'> & { data: T }

export type RemoteSocket<T = {}> = Omit<_RemoteSocket<IOEmitEvents>, 'data'> & { data: T }

export type Error = { message: string }

export interface IOListenEvents {
  transaction: (
    e: { version: Version; steps: DocJson[] },
    cb?: (e: Error | { version: Version }) => void
  ) => void
  save: (cb?: (e?: Error) => void) => void
  createFile: (
    e: { source: CreateFileSource | CreateFileSource[] },
    cb?: (e: Error | { hash: string[] }) => void
  ) => void
}

export interface IOEmitEvents {
  error: (e: { message: string }) => void
  paper: (e: {
    clientID: ClientID
    version: Version
    doc: DocJson
    ipfsGatewayUri: string
    writable: boolean
  }) => void
  transaction: (e: { version: Version; steps: DocJson[]; clientIDs: ClientID[] }) => void
  persistence: (e: { version: Version; updatedAt: number; writable: boolean }) => void
}

export interface CreateFileSource {
  path: string
  content: ArrayBuffer
}
