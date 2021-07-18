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

import debounce from 'lodash/debounce'
import { Node, Schema } from 'prosemirror-model'
import { Step } from 'prosemirror-transform'
import DB, { DocJson, Version } from './db'
import { schema } from './schema'
import { StrictEventEmitter } from './typed-events'

export type ClientID = string | number

export interface InstanceOptions {
  autoSaveWaitMilliseconds: number
  autoReleaseInstanceWaitMilliseconds: number
}

export default class Instance extends StrictEventEmitter<
  {},
  {},
  { persistence: (e: { version: Version; updatedAt: number }) => void }
> {
  private static shared = new Map<string, Promise<Instance>>()
  private static gcTimerMap = new Map<string, NodeJS.Timeout>()
  static key = (id: { paperId: string }) => `paper-${id.paperId}`
  static keyInfo(key: string) {
    const { paperId } = key.match(/^paper-(?<paperId>[\d|a-f]+)$/)?.groups ?? {}
    return paperId ? { paperId } : undefined
  }
  static getInstance(id: { paperId: string }): Promise<Instance> {
    let instance = this.shared.get(this.key(id))
    if (!instance) {
      instance = DB.shared.selectPaper(id.paperId, schema).then(
        paper =>
          new Instance({
            paperId: id.paperId,
            schema,
            ...paper,
          })
      )
      this.shared.set(this.key(id), instance)
    }
    return instance
  }
  static markInstanceGC(id: { paperId: string }) {
    const key = this.key(id)

    const timer = this.gcTimerMap.get(key)
    timer && clearTimeout(timer)
    this.gcTimerMap.set(
      key,
      setTimeout(async () => {
        if (this.shared.has(key)) {
          const instance = this.shared.get(key)!
          this.shared.delete(key)
          await (await instance).dispose()
        }
      }, this.options.autoReleaseInstanceWaitMilliseconds)
    )
  }

  static async destroy() {
    for (const [_, instance] of this.shared) {
      await (await instance).dispose()
    }
  }

  private static _options: InstanceOptions
  private static get options() {
    if (!this._options) {
      throw new Error('Please call Instance.initShared() first')
    }
    return this._options
  }
  static initShared(options: InstanceOptions) {
    this._options = options
  }

  constructor(options: {
    schema: Schema
    paperId: string
    doc: Node
    version: Version
    updatedAt: number
    tags: string[] | null
  }) {
    super()
    this.schema = options.schema
    this.paperId = options.paperId
    this.doc = options.doc
    this.version = options.version
    this.tags = options.tags ?? []
    this._persistence = { version: options.version, updatedAt: options.updatedAt }
  }

  schema: Schema
  paperId: string
  doc: Node
  version: Version
  tags: string[]
  steps: (Step & { clientID: ClientID })[] = []

  private _saving = false

  private _persistence: { version: Version; updatedAt: number }
  get persistence() {
    return this._persistence
  }
  private set persistence(v) {
    if (this._persistence.version !== v.version || this._persistence.updatedAt !== v.updatedAt) {
      this._persistence = v
      this.emitReserved('persistence', v)
    }
  }

  get isPublic() {
    return this.tags.includes('public')
  }

  get isWritable() {
    return this.tags.includes('writable')
  }

  addEvents(version: Version, steps: DocJson[], clientID: ClientID): { version: Version } {
    this.checkVersion(version)
    if (version !== this.version) {
      throw new Error(`Invalid version ${version}`)
    }

    const _steps = steps.map(i => Step.fromJSON(this.schema, i)) as (Step & {
      clientID: ClientID
    })[]
    let doc = this.doc
    for (const step of _steps) {
      step.clientID = clientID
      const result = step.apply(doc)
      if (!result.doc) {
        throw new Error(result.failed || 'Apply step failed')
      }
      doc = result.doc
    }
    this.doc = doc
    const newVersion = this.version + steps.length
    this.version = newVersion
    this.steps = this.steps.concat(_steps)

    this.autoSave()

    return { version: newVersion }
  }

  getEvents(version: number) {
    this.checkVersion(version)
    const startIndex = this.steps.length - (this.version - version)
    if (startIndex < 0) {
      return
    }
    return {
      version: this.version,
      steps: this.steps.slice(startIndex),
    }
  }

  async save() {
    if (this._saving) {
      return
    }
    this._saving = true
    try {
      const { version } = this
      if (version > this.persistence.version) {
        const { updatedAt, tags } = await DB.shared.updatePaper(this)
        this.tags = tags
        this.persistence = {
          updatedAt,
          version,
        }
      }
    } finally {
      this._saving = false
    }
  }

  async dispose() {
    await this.save()
    this.removeAllListeners()
  }

  private checkVersion(version: number) {
    if (version < 0 || version > this.version) {
      throw new Error(`Invalid version ${version}`)
    }
  }

  private autoSave = debounce(() => {
    this.save()
  }, Instance.options.autoSaveWaitMilliseconds)
}
