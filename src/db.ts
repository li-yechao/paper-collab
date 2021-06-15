import mongodb from 'mongodb'
import { Node, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import Config from './config'

export type Version = number

export type DocJson = { [key: string]: any }

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

  async selectPaper(
    paperId: string,
    schema: Schema
  ): Promise<{ doc: Node; version: Version; updatedAt: number }> {
    const { doc, version, updatedAt } = await this._selectPaper(paperId)
    return {
      doc: (doc && Node.fromJSON(schema, doc)) || EditorState.create({ schema }).doc,
      version: version ?? 0,
      updatedAt,
    }
  }

  async updatePaper({
    paperId,
    doc,
    version,
  }: {
    paperId: string
    doc: Node
    version: Version
  }): Promise<{ updatedAt: number; version: Version }> {
    const title = doc.firstChild?.type.name === 'title' ? doc.firstChild.textContent : ''
    return this._updatePaper({ paperId, title, doc: doc.toJSON(), version })
  }

  private async _selectPaper(
    paperId: string
  ): Promise<{ doc: DocJson | null; version: Version | null; updatedAt: number }> {
    const paper = await (
      await this.paperCollection
    ).findOne<{ updated_at: number }>({ _id: paperId }, { projection: { updated_at: true } })

    const content = await (
      await this.paperContentCollection
    ).findOne<{ doc: DocJson | null; version: Version | null }>(
      { _id: paperId },
      { projection: { doc: true, version: true } }
    )

    if (!paper || !content) {
      throw new Error(`Paper not found ${paperId}`)
    }

    return {
      doc: content.doc,
      version: content.version,
      updatedAt: paper.updated_at,
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
  }): Promise<{ updatedAt: number; version: Version }> {
    const updatedAt = Date.now()

    await (
      await this.paperCollection
    ).findOneAndUpdate(
      { _id: paperId },
      { $set: { updated_at: mongodb.Long.fromNumber(updatedAt), title } }
    )
    await (
      await this.paperContentCollection
    ).findOneAndUpdate({ _id: paperId }, { $set: { doc, version } })

    return { updatedAt, version }
  }
}
