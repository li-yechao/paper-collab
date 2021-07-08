export interface ConfigOptions {
  port: number
  accessTokenSecret: string
  mongoUri: string
  mongoDatabase: string
  mongoCollectionPaper: string
  autoSaveWaitMilliseconds: number
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
    this.accessTokenSecret = config.accessTokenSecret
    this.mongoUri = config.mongoUri
    this.mongoDatabase = config.mongoDatabase
    this.mongoCollectionPaper = config.mongoCollectionPaper
    this.autoSaveWaitMilliseconds = config.autoSaveWaitMilliseconds
  }

  readonly port: number

  readonly accessTokenSecret: string

  readonly mongoUri: string

  readonly mongoDatabase: string

  readonly mongoCollectionPaper: string

  readonly autoSaveWaitMilliseconds: number
}
