import mongodb from 'mongodb'
import { Node, Schema } from 'prosemirror-model'
import Config from './config'
import { DocJson } from './events'

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

  async selectPaperDocNode(paperId: string, schema: Schema): Promise<Node> {
    return Node.fromJSON(schema, await this.selectPaperDoc(paperId))
  }

  async updatePaperDocNode(paperId: string, node: Node) {
    const title = node.firstChild?.type.name === 'title' ? node.firstChild.textContent : ''
    await this.updatePaperDoc(paperId, title, node.toJSON())
  }

  async selectPaperDoc(paperId: string): Promise<DocJson> {
    return (
      (
        await (
          await this.paperContentCollection
        ).findOne({ _id: paperId }, { projection: { doc: true } })
      ).doc || {}
    )
  }

  async updatePaperDoc(paperId: string, title: string, doc: DocJson) {
    await (
      await this.paperCollection
    ).findOneAndUpdate(
      { _id: paperId },
      { $set: { updated_at: mongodb.Long.fromNumber(Date.now()), title } }
    )
    await (await this.paperContentCollection).findOneAndUpdate({ _id: paperId }, { $set: { doc } })
  }
}
