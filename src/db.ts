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
      doc: (paper.doc && Node.fromJSON(schema, paper.doc)) || EditorState.create({ schema }).doc,
      version: paper.version ?? 0,
      updatedAt: paper.updated_at,
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
    const tags: string[] = []
    const tagList = doc.maybeChild(1)
    if (tagList?.type.name === 'tag_list') {
      tagList.forEach(node => {
        const tag = node.textContent.trim()
        tag && tags.push(tag)
      })
    }

    const updatedAt = Date.now()
    await (
      await this.collectionPaper
    ).findOneAndUpdate(
      { _id: paperId },
      {
        $set: {
          updated_at: mongodb.Long.fromNumber(updatedAt),
          title,
          doc: doc.toJSON(),
          version,
          tags,
        },
      }
    )
    return { updatedAt }
  }
}
