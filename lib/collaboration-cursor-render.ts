import {
  studentFigureImageSrc,
  studentFigureIndexForUserId,
} from "@/lib/student-figure-avatars"

export type CollaborationAwarenessUser = {
  name?: string | null
  userName?: string | null
  color?: string | null
  userId?: string
  figureIndex?: number
}

function displayName(user: CollaborationAwarenessUser): string {
  const raw = (user.name || user.userName || "User").trim()
  return raw || "User"
}

function figureIndexForAwarenessUser(user: CollaborationAwarenessUser): number {
  if (typeof user.figureIndex === "number" && Number.isFinite(user.figureIndex)) {
    return user.figureIndex
  }
  if (user.userId) return studentFigureIndexForUserId(user.userId)
  return 0
}

/** TipTap CollaborationCursor `render` — caret + avatar chip + name. */
export function renderCollaborationCursor(user: CollaborationAwarenessUser): HTMLElement {
  const color = user.color || "#171717"
  const cursor = document.createElement("span")
  cursor.classList.add("collaboration-cursor__caret")
  cursor.setAttribute("style", `border-color: ${color}`)

  const label = document.createElement("div")
  label.classList.add("collaboration-cursor__label")
  label.setAttribute("style", `--cursor-accent: ${color}`)

  const avatar = document.createElement("img")
  avatar.classList.add("collaboration-cursor__avatar")
  avatar.src = studentFigureImageSrc(figureIndexForAwarenessUser(user))
  avatar.alt = ""
  avatar.draggable = false

  const name = document.createElement("span")
  name.classList.add("collaboration-cursor__name")
  name.textContent = displayName(user)

  label.appendChild(avatar)
  label.appendChild(name)
  cursor.appendChild(label)
  return cursor
}

export function buildCollaborationAwarenessUser(input: {
  userId: string
  name: string
  color: string
  figureIndex: number
}) {
  return {
    userId: input.userId,
    name: input.name,
    userName: input.name,
    color: input.color,
    figureIndex: input.figureIndex,
    timestamp: Date.now(),
  }
}
