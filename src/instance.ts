import debounce from 'lodash/debounce'
import fetch from 'node-fetch'
import { Node, Schema } from 'prosemirror-model'
import { Step } from 'prosemirror-transform'
import { ClientID, ClientNotifier } from './client'
import Config from './config'
import DB from './db'
import { documentToProsemirrorDoc, prosemirrorDocToDocument } from './doc'

const AUTO_SAVE_DEBOUNCE_WAIT = 1e4

export default class Instance {
  private static shared = new Map<string, Instance>()
  private static sharedKey = (id: { userId: string; paperId: string }) =>
    `${id.userId}-${id.paperId}`
  static getInstance(id: { userId: string; paperId: string }): Instance | undefined {
    return this.shared.get(this.sharedKey(id))
  }
  static setInstance(id: { userId: string; paperId: string }, instance: Instance | undefined) {
    if (instance) {
      this.shared.set(this.sharedKey(id), instance)
    } else {
      this.shared.delete(this.sharedKey(id))
    }
  }

  constructor(
    public userId: string,
    public paperId: string,
    public doc: Node,
    public schema: Schema
  ) {}

  version = 0
  steps: (Step & { clientID: ClientID })[] = []
  clients: Set<ClientNotifier> = new Set()

  static async newInstance(
    accessToken: string,
    userId: string,
    paperId: string
  ): Promise<Instance> {
    const result = await fetch(Config.shared.paperGraphqlUri, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query Paper($userId: String!, $paperId: String!) {
            user(identifier: {id: $userId}) {
              paper(paperId: $paperId) {
                canViewerWritePaper
              }
            }
          }
        `,
        variables: { userId, paperId },
      }),
    })

    const json = await result.json()
    if (json.errors?.[0]) {
      throw new Error(json.errors[0].message)
    }
    const paper = json.data?.user?.paper
    if (!paper) {
      throw new Error(`Query paper failed`)
    }

    const schema = new Schema({
      nodes: {
        doc: {
          content: 'title block+',
        },
        text: {
          group: 'inline',
        },
        title: {
          content: 'text*',
          defining: true,
        },
        paragraph: {
          content: 'inline*',
          group: 'block',
        },
        heading: {
          attrs: { level: { default: 1 } },
          content: 'text*',
          group: 'block',
          defining: true,
        },
        blockquote: {
          content: 'block+',
          group: 'block',
        },
        todo_list: {
          content: 'todo_item+',
          group: 'block',
        },
        todo_item: {
          attrs: { checked: { default: false } },
          content: 'paragraph block*',
          defining: true,
        },
        ordered_list: {
          content: 'list_item+',
          group: 'block',
        },
        bullet_list: {
          content: 'list_item+',
          group: 'block',
        },
        list_item: {
          content: 'paragraph block*',
          defining: true,
        },
        code_block: {
          attrs: { language: { default: null } },
          content: 'text*',
          group: 'block',
          code: true,
          defining: true,
          isolating: true,
          atom: true,
        },
        image_block: {
          attrs: { src: { default: null }, caption: { default: null } },
          group: 'block',
          defining: true,
          isolating: true,
          atom: true,
          draggable: true,
        },
        video_block: {
          attrs: { src: { default: null }, caption: { default: null } },
          group: 'block',
          defining: true,
          isolating: true,
          atom: true,
          draggable: true,
        },
      },
      marks: {
        link: {
          attrs: { href: { default: '' } },
          inclusive: false,
        },
        bold: {},
        italic: {},
        code: {},
        underline: {},
        strikethrough: {},
      },
    })
    const doc = Node.fromJSON(
      schema,
      documentToProsemirrorDoc(await DB.shared.selectPaperDocument(paperId))
    )
    return new Instance(userId, paperId, doc, schema)
  }

  addEvents(version: number, steps: Step[], clientID: string | number) {
    this.checkVersion(version)
    if (version !== this.version) {
      return
    }

    const _steps = steps as (Step & { clientID: ClientID })[]
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
    this.version += steps.length
    this.steps = this.steps.concat(_steps)

    this.notify()
    this.save()
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

  private notify() {
    for (const client of this.clients) {
      client.transaction(this)
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
      .updatePaperDocument(this.paperId, prosemirrorDocToDocument(this.doc))
      .then(() => {
        console.info(`Auto save ${this.paperId} success`)
      })
      .catch(err => {
        console.error(`Auto save ${this.paperId} failed`, err)
      })
  }, AUTO_SAVE_DEBOUNCE_WAIT)
}
