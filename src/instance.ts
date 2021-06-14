import debounce from 'lodash/debounce'
import { Node, Schema } from 'prosemirror-model'
import { Step } from 'prosemirror-transform'
import DB from './db'
import { ClientID, DocJson, Version } from './events'
import { schema } from './schema'

const AUTO_SAVE_DEBOUNCE_WAIT = 1e4

export default class Instance {
  private static shared = new Map<string, Instance>()
  static key = (id: { userId: string; paperId: string }) => `${id.userId}-${id.paperId}`
  static async getInstance(id: { userId: string; paperId: string }): Promise<Instance> {
    let instance = this.shared.get(this.key(id))
    if (!instance) {
      instance = new Instance({
        paperId: id.paperId,
        schema,
        ...(await DB.shared.selectPaper(id.paperId, schema)),
      })
      this.shared.set(this.key(id), instance)
    }
    return instance
  }

  constructor(options: { schema: Schema; paperId: string; doc: Node; version: Version }) {
    this.schema = options.schema
    this.paperId = options.paperId
    this.doc = options.doc
    this.version = options.version
  }

  schema: Schema
  paperId: string
  doc: Node
  version: Version
  steps: (Step & { clientID: ClientID })[] = []

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

    this.save()

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

  private checkVersion(version: number) {
    if (version < 0 || version > this.version) {
      throw new Error(`Invalid version ${version}`)
    }
  }

  private save = debounce(() => {
    console.info(`Auto save ${this.paperId} start`)
    DB.shared
      .updatePaper(this)
      .then(() => {
        console.info(`Auto save ${this.paperId} success`)
      })
      .catch(err => {
        console.error(`Auto save ${this.paperId} failed`, err)
      })
  }, AUTO_SAVE_DEBOUNCE_WAIT)
}
