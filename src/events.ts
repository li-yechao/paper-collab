export type Version = number

export type DocJson = { [key: string]: any }

export type ClientID = string | number

export interface ListenEvents {
  transaction: (e: { version: Version; steps: DocJson[]; clientID: ClientID }) => void
}

export interface EmitEvents {
  paper: (e: { version: Version; doc: DocJson }) => void
  transaction: (e: { version: Version; steps: DocJson[]; clientIDs: ClientID[] }) => void
  persistence: (e: { version: Version; updatedAt: number }) => void
}
