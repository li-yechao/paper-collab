export interface ConfigOptions {
  port: number
  mongoUri: string
  mongoDatabase: string
  mongoPaperCollection: string
  mongoPaperContentCollection: string
  paperGraphqlUri: string
}

export default class Config {
  private static _shared: Config
  static get shared() {
    if (!this._shared) {
      throw new Error('Please call Config.initShared() first')
    }
    return this._shared
  }
  static initShared(config: ConfigOptions) {
    this._shared = new Config(config)
  }

  private constructor(config: ConfigOptions) {
    this.port = config.port
    this.mongoUri = config.mongoUri
    this.mongoDatabase = config.mongoDatabase
    this.mongoPaperCollection = config.mongoPaperCollection
    this.mongoPaperContentCollection = config.mongoPaperContentCollection
    this.paperGraphqlUri = config.paperGraphqlUri
  }

  readonly port: number

  readonly mongoUri: string

  readonly mongoDatabase: string

  readonly mongoPaperCollection: string

  readonly mongoPaperContentCollection: string

  readonly paperGraphqlUri: string
}
