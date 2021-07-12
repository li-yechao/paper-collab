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

import ipfs from 'ipfs-core'
import { ImportCandidateStream, ToFile } from 'ipfs-core-types/src/utils'
import HttpGateway from 'ipfs-http-gateway'

export interface IPFSOptions {
  path: string
  gateway: {
    port: number
  }
}

export default class IPFS {
  private static _shared: IPFS

  static get shared() {
    if (!this._shared) {
      if (!this._shared) {
        throw new Error('Please call IPFS.initShared() first')
      }
    }
    return this._shared
  }

  static initShared(options: IPFSOptions) {
    this._shared = new IPFS(options)
  }

  constructor(options: IPFSOptions) {
    this._ipfs = ipfs.create({
      repo: options.path,
      config: {
        Addresses: {
          Gateway: `/ip4/0.0.0.0/tcp/${options.gateway.port}`,
        },
        Bootstrap: [],
      },
    })
  }

  private _ipfs: Promise<ipfs.IPFS>
  private _httpGateway?: Promise<HttpGateway>

  async destroy() {
    await (await this._ipfs).stop()
    await (await this._httpGateway)?.stop()
  }

  async startHttpGateway() {
    if (!this._httpGateway) {
      this._httpGateway = this._ipfs.then(ipfs => new HttpGateway(ipfs).start())
    }
    return this._httpGateway
  }

  async addAll(source: ImportCandidateStream) {
    const ipfs = await this._ipfs
    return ipfs.addAll(source, { wrapWithDirectory: true })
  }

  async add(source: ToFile) {
    const ipfs = await this._ipfs
    return ipfs.add(source)
  }
}
