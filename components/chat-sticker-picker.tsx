"use client"

import { useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  CHAT_STICKER_CATEGORIES,
  CHAT_STICKERS,
  type ChatSticker,
  type ChatStickerCategory,
} from "@/lib/chat-stickers"

export function ChatStickerPicker({
  onStickerSelect,
  disabled = false,
}: {
  onStickerSelect: (sticker: ChatSticker) => void
  disabled?: boolean
}) {
  const [category, setCategory] = useState<ChatStickerCategory>("Reactions")

  const stickers = useMemo(
    () => CHAT_STICKERS.filter((sticker) => sticker.category === category),
    [category]
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 rounded-full transition-colors hover:bg-violet-100 hover:text-violet-700"
          aria-label="Send a reaction GIF"
          title="Reaction GIFs"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="end" sideOffset={8}>
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-900">Reaction GIFs</p>
          <p className="text-xs text-slate-500">Pick one to send. It plays in the chat.</p>
        </div>
        <div className="border-b border-slate-100 px-2 py-2">
          <div className="flex flex-wrap gap-1">
            {CHAT_STICKER_CATEGORIES.map((item) => (
              <Button
                key={item}
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 rounded-full px-2.5 text-xs ${
                  category === item
                    ? "bg-violet-100 font-semibold text-violet-800"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        <ScrollArea className="h-[220px] p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {stickers.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                title={sticker.label}
                onClick={() => onStickerSelect(sticker)}
                className="flex flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 transition hover:border-violet-200 hover:bg-violet-50"
              >
                <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sticker.gifUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] shadow ring-1 ring-slate-200">
                    {sticker.emoji}
                  </span>
                </span>
                <span className="line-clamp-2 w-full text-center text-[10px] font-medium leading-tight text-slate-600">
                  {sticker.label}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
