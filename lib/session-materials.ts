export type SessionMaterial = {
  id: string
  title: string
  url: string
  note: string
  fileName?: string
}

export type SessionBrief = {
  title: string
  instructions: string
  materials: SessionMaterial[]
  updatedAt: string | null
}

export const EMPTY_SESSION_BRIEF: SessionBrief = {
  title: "",
  instructions: "",
  materials: [],
  updatedAt: null,
}
