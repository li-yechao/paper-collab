import mongodb from 'mongodb'
import Config from './config'
import { Document } from './doc'

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

  async selectPaperDocument(paperId: string): Promise<Document> {
    const title = (await (await this.paperCollection).findOne({ _id: paperId })).title
    const content = (await (await this.paperContentCollection).findOne({ _id: paperId })).content
    return { title, content }
  }

  async updatePaperDocument(paperId: string, doc: Document) {
    const oldContent = (await (await this.paperContentCollection).findOne({ _id: paperId })).content

    await (
      await this.paperCollection
    ).findOneAndUpdate(
      { _id: paperId },
      {
        $set: {
          updated_at: mongodb.Long.fromNumber(Date.now()),
          title: doc.title,
        },
      }
    )
    await (
      await this.paperContentCollection
    ).findOneAndUpdate(
      { _id: paperId },
      {
        $set: { content: doc.content },
        $push: {
          history: {
            $each: [{ content: oldContent }],
            $slice: -10,
          },
        },
      }
    )
  }
}
