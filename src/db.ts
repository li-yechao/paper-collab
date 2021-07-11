import mongodb, { MongoClient } from 'mongodb'
import { Node, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'

export type Version = number

export type DocJson = { [key: string]: any }

export interface DBOptions {
  uri: string
  database: string
  collectionPaper: string
}

export default class DB {
  private static _shared: DB
  static get shared() {
    if (!this._shared) {
      if (!this._shared) {
        throw new Error('Please call DB.initShared() first')
      }
    }
    return this._shared
  }
  static initShared(config: DBOptions) {
    this._shared = new DB(config)
  }

  constructor(options: DBOptions) {
    this.client = new mongodb.MongoClient(options.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    this.collectionPaper = this.client
      .connect()
      .then(client => client.db(options.database))
      .then(db => db.collection(options.collectionPaper))
  }

  private client: MongoClient
  private collectionPaper: Promise<mongodb.Collection>

  async destroy() {
    await this.client.close()
  }

  async selectPaper(
    paperId: string,
    schema: Schema
  ): Promise<{ title: string | null; doc: Node; version: Version; updatedAt: number }> {
    const { title, doc, version, updatedAt } = await this._selectPaper(paperId)
    return {
      title,
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
  }): Promise<{ updatedAt: number }> {
    const title = doc.firstChild?.type.name === 'title' ? doc.firstChild.textContent : ''
    return await this._updatePaper({ paperId, title, doc: doc.toJSON(), version })
  }

  private async _selectPaper(paperId: string): Promise<{
    title: string | null
    doc: DocJson | null
    version: Version | null
    updatedAt: number
  }> {
    const paper = await (
      await this.collectionPaper
    ).findOne<{
      title: string | null
      doc: DocJson | null
      updated_at: number
      version: Version | null
    }>(
      { _id: paperId },
      { projection: { title: true, doc: true, updated_at: true, version: true } }
    )

    if (!paper) {
      throw new Error(`Paper not found ${paperId}`)
    }

    return {
      title: paper.title,
      doc: paper.doc,
      version: paper.version,
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
  }): Promise<{ updatedAt: number }> {
    const updatedAt = Date.now()

    await (
      await this.collectionPaper
    ).findOneAndUpdate(
      { _id: paperId },
      { $set: { updated_at: mongodb.Long.fromNumber(updatedAt), title, doc, version } }
    )
    return { updatedAt }
  }
}
