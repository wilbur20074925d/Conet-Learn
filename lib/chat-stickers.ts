export type ChatStickerCategory =
  | "Reactions"
  | "Cheers"
  | "Study vibes"
  | "Feelings"
  | "Fun"
  | "Support"

export type ChatSticker = {
  id: string
  label: string
  emoji: string
  category: ChatStickerCategory
  gifUrl: string
}

const local = (file: string) => `/chat-stickers/${file}.gif`

/** GIFs saved in public/chat-stickers. Remote Giphy links often return a placeholder, so chat uses these files. */
export const CHAT_STICKERS: ChatSticker[] = [
  { id: "thumbs-up", label: "Thumbs up", emoji: "👍", category: "Reactions", gifUrl: local("thumbs-up") },
  { id: "ok", label: "OK", emoji: "👌", category: "Reactions", gifUrl: local("ok") },
  { id: "yes", label: "Yes!", emoji: "✅", category: "Reactions", gifUrl: local("yes") },
  { id: "no-way", label: "No way", emoji: "🙅", category: "Reactions", gifUrl: local("no-way") },
  { id: "shrug", label: "Not sure", emoji: "🤷", category: "Reactions", gifUrl: local("shrug") },
  { id: "hello", label: "Hello", emoji: "👋", category: "Reactions", gifUrl: local("hello") },
  { id: "goodbye", label: "Goodbye", emoji: "👋", category: "Reactions", gifUrl: local("goodbye") },
  { id: "mind-blown", label: "Mind blown", emoji: "🤯", category: "Reactions", gifUrl: local("mind-blown") },
  { id: "slow-clap", label: "Slow clap", emoji: "👏", category: "Cheers", gifUrl: local("slow-clap") },
  { id: "high-five", label: "High five", emoji: "🙌", category: "Cheers", gifUrl: local("high-five") },
  { id: "applause", label: "Applause", emoji: "👏", category: "Cheers", gifUrl: local("applause") },
  { id: "party", label: "Party time", emoji: "🎉", category: "Cheers", gifUrl: local("party") },
  { id: "celebrate", label: "Celebrate", emoji: "🥳", category: "Cheers", gifUrl: local("celebrate") },
  { id: "well-done", label: "Well done", emoji: "⭐", category: "Cheers", gifUrl: local("well-done") },
  { id: "thinking", label: "Thinking", emoji: "🤔", category: "Study vibes", gifUrl: local("thinking") },
  { id: "great-idea", label: "Great idea", emoji: "💡", category: "Study vibes", gifUrl: local("great-idea") },
  { id: "keep-going", label: "Keep going", emoji: "💪", category: "Study vibes", gifUrl: local("keep-going") },
  { id: "focus", label: "Focus mode", emoji: "📚", category: "Study vibes", gifUrl: local("focus") },
  { id: "love-it", label: "Love it", emoji: "❤️", category: "Feelings", gifUrl: local("love-it") },
  { id: "love-that", label: "Love that", emoji: "😍", category: "Feelings", gifUrl: local("love-that") },
  { id: "facepalm", label: "Facepalm", emoji: "🤦", category: "Feelings", gifUrl: local("facepalm") },
  { id: "shocked", label: "Shocked", emoji: "😱", category: "Feelings", gifUrl: local("shocked") },
  { id: "sleepy", label: "So tired", emoji: "😴", category: "Feelings", gifUrl: local("sleepy") },
  { id: "nervous", label: "Nervous", emoji: "😅", category: "Feelings", gifUrl: local("nervous") },
  { id: "lol", label: "LOL", emoji: "😂", category: "Fun", gifUrl: local("lol") },
  { id: "too-funny", label: "Too funny", emoji: "😭", category: "Fun", gifUrl: local("too-funny") },
  { id: "happy-dance", label: "Happy dance", emoji: "💃", category: "Fun", gifUrl: local("happy-dance") },
  { id: "cool", label: "So cool", emoji: "😎", category: "Fun", gifUrl: local("cool") },
  { id: "hug", label: "Group hug", emoji: "🤗", category: "Support", gifUrl: local("hug") },
  { id: "you-got-this", label: "You got this", emoji: "🔥", category: "Support", gifUrl: local("you-got-this") },
  { id: "thanks", label: "Thank you", emoji: "🙏", category: "Support", gifUrl: local("thanks") },
]

export const CHAT_STICKER_CATEGORIES: ChatStickerCategory[] = [
  "Reactions",
  "Cheers",
  "Study vibes",
  "Feelings",
  "Fun",
  "Support",
]

export function formatStickerMessage(sticker: ChatSticker) {
  return `![sticker:${sticker.label}](${sticker.gifUrl})`
}

export function isStickerAlt(alt: string) {
  return alt.trim().toLowerCase().startsWith("sticker:")
}

export function stickerLabelFromAlt(alt: string) {
  return alt.replace(/^sticker:\s*/i, "").trim() || "Reaction"
}

/** Prefer the local file. Older messages stored a Giphy URL that often does not play. */
export function resolveChatSticker(label: string, storedSrc: string) {
  const normalized = label.trim().toLowerCase()
  const byLabel = CHAT_STICKERS.find((sticker) => sticker.label.toLowerCase() === normalized)
  if (byLabel) return byLabel
  const bySrc = CHAT_STICKERS.find((sticker) => sticker.gifUrl === storedSrc)
  if (bySrc) return bySrc
  if (storedSrc.startsWith("/chat-stickers/") && storedSrc.endsWith(".gif")) {
    return { id: storedSrc, label: label || "Reaction", emoji: "✨", category: "Reactions" as const, gifUrl: storedSrc }
  }
  return null
}
