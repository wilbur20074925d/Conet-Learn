export type CatalogMember = {
  id: string
  name: string
  role: string
}

export type CatalogGroup = {
  id: string
  name: string
  newintervene: number
  classSessionId: string | null
  members: CatalogMember[]
  chatSessionId: string | null
}

export type CatalogSession = {
  id: string
  classId: string
  title: string
  createdAt: string
  groups: CatalogGroup[]
}

export type CatalogClass = {
  id: string
  name: string
  createdAt: string
  sessions: CatalogSession[]
}
