import EventEmitter from 'events'
import { Step } from 'prosemirror-transform'
import WebSocket from 'ws'
import Instance from './instance'

export type DocJson = { [key: string]: any }
export type ClientID = string | number

export type MessageDataSend =
  | { type: 'paper'; data: { version: number; doc: DocJson } }
  | { type: 'transaction'; data: { version: number; steps: DocJson[]; clientIDs: ClientID[] } }

export type MessageDataRecv =
  | { type: 'paper'; data: { accessToken: string; userId: string; paperId: string } }
  | { type: 'transaction'; data: { version: number; steps: DocJson[]; clientID: ClientID } }

export interface ClientNotifier {
  transaction(instance: Instance): void
}

declare interface Client {
  on(
    event: 'paper',
    listener: (e: { accessToken: string; userId: string; paperId: string }) => void
  ): this
  on(
    event: 'transaction',
    listener: (e: { version: number; steps: DocJson[]; clientID: ClientID }) => void
  ): this
}

class Client extends EventEmitter implements ClientNotifier {
  constructor(private ws: WebSocket) {
    super()
    ws.onmessage = this.handleMessage
    ws.onclose = this.handleClose
  }

  private version = 0
  private id?: { userId: string; paperId: string }

  get instance(): Instance | undefined {
    return this.id && Instance.getInstance(this.id)
  }
  set instance(instance: Instance | undefined) {
    if (this.id) {
      Instance.setInstance(this.id, instance)
    }
  }

  transaction() {
    const { instance } = this
    const e = instance?.getEvents(this.version)
    if (!e) {
      return
    }
    this.version = e.version
    this.send({
      type: 'transaction',
      data: {
        version: e.version,
        steps: e.steps,
        clientIDs: e.steps.map(i => i.clientID),
      },
    })
  }

  paper() {
    if (!this.instance) {
      return
    }
    const { doc, version } = this.instance
    this.version = version
    this.send({ type: 'paper', data: { version, doc } })
  }

  private handleMessage = async ({ data }: WebSocket.MessageEvent) => {
    if (typeof data !== 'string') {
      return
    }

    const m: MessageDataRecv = JSON.parse(data)
    switch (m.type) {
      case 'paper': {
        const { accessToken, userId, paperId } = m.data
        this.id = { userId, paperId }
        if (!this.instance) {
          this.instance = await Instance.newInstance(accessToken, userId, paperId)
        }
        this.instance.clients.add(this)
        this.paper()
        break
      }
      case 'transaction': {
        const { instance } = this
        if (instance) {
          instance.addEvents(
            m.data.version,
            m.data.steps.map(i => Step.fromJSON(instance.schema, i)),
            m.data.clientID
          )
        }
        break
      }
    }
  }

  private handleClose = () => {
    this.instance?.clients.delete(this)
  }

  private send(m: MessageDataSend) {
    this.ws.send(JSON.stringify(m))
  }
}

export default Client
