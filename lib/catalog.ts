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

export type CatalogStudent = {
  id: string
  name: string
}

export type CatalogSession = {
  id: string
  classId: string
  title: string
  createdAt: string
  students: CatalogStudent[]
  groups: CatalogGroup[]
}

export type CatalogClass = {
  id: string
  name: string
  createdAt: string
  students: CatalogStudent[]
  sessions: CatalogSession[]
}
