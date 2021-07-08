import debounce from 'lodash/debounce'
import { Node, Schema } from 'prosemirror-model'
import { Step } from 'prosemirror-transform'
import Config from './config'
import DB, { DocJson, Version } from './db'
import { schema } from './schema'
import { StrictEventEmitter } from './typed-events'

export type ClientID = string | number

export default class Instance extends StrictEventEmitter<
  {},
  {},
  { persistence: (e: { version: Version; updatedAt: number }) => void }
> {
  private static shared = new Map<string, Promise<Instance>>()
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

  constructor(options: {
    schema: Schema
    paperId: string
    doc: Node
    version: Version
    updatedAt: number
  }) {
    super()
    this.schema = options.schema
    this.paperId = options.paperId
    this.doc = options.doc
    this.version = options.version
    this._persistence = { version: options.version, updatedAt: options.updatedAt }
  }

  schema: Schema
  paperId: string
  doc: Node
  version: Version
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
        this.persistence = {
          ...(await DB.shared.updatePaper(this)),
          version,
        }
      }
    } finally {
      this._saving = false
    }
  }

  private checkVersion(version: number) {
    if (version < 0 || version > this.version) {
      throw new Error(`Invalid version ${version}`)
    }
  }

  private autoSave = debounce(() => {
    this.save()
  }, Config.shared.autoSaveWaitMilliseconds)
}
