import mongodb from 'mongodb'
import { Node, Schema } from 'prosemirror-model'
import Config from './config'
import { DocJson, Version } from './events'

export interface DBOptions {
  uri: string
  database: string
  paperCollection: string
  paperContentCollection: string
}

export default class DB {
  private static _shared: DB
  static get shared() {
    if (!this._shared) {
      this._shared = new DB({
        uri: Config.shared.mongoUri,
        database: Config.shared.mongoDatabase,
        paperCollection: Config.shared.mongoPaperCollection,
        paperContentCollection: Config.shared.mongoPaperContentCollection,
      })
    }
    return this._shared
  }

  constructor(options: DBOptions) {
    const db = new mongodb.MongoClient(options.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
      .connect()
      .then(client => client.db(options.database))
    this.paperCollection = db.then(db => db.collection(options.paperCollection))
    this.paperContentCollection = db.then(db => db.collection(options.paperContentCollection))
  }

  private paperCollection: Promise<mongodb.Collection>
  private paperContentCollection: Promise<mongodb.Collection>

  async selectPaper(paperId: string, schema: Schema): Promise<{ doc: Node; version: Version }> {
    const { doc, version } = await this._selectPaper(paperId)
    return {
      doc: Node.fromJSON(schema, doc),
      version,
    }
  }

  async updatePaper({ paperId, doc, version }: { paperId: string; doc: Node; version: Version }) {
    const title = doc.firstChild?.type.name === 'title' ? doc.firstChild.textContent : ''
    await this._updatePaper({ paperId, title, doc: doc.toJSON(), version })
  }

  private async _selectPaper(paperId: string): Promise<{ doc: DocJson; version: Version }> {
    const paper = await (
      await this.paperContentCollection
    ).findOne({ _id: paperId }, { projection: { doc: true, version: true } })

    if (!paper) {
      throw new Error(`Paper not found ${paperId}`)
    }

    return {
      doc: paper.doc || {},
      version: paper.version || 0,
    }
  }

  private async _updatePaper({
    paperId,
    title,
    doc,
    version,
  }: {
    paperId: string
    title: string
    doc: DocJson
    version: Version
  }) {
    await (
      await this.paperCollection
    ).findOneAndUpdate(
      { _id: paperId },
      { $set: { updated_at: mongodb.Long.fromNumber(Date.now()), title } }
    )
    await (
      await this.paperContentCollection
    ).findOneAndUpdate({ _id: paperId }, { $set: { doc, version } })
  }
}
