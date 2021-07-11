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
