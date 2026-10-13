import LoadingScreen from "@/components/loading-screen"

export type LoadStage = "finding" | "opening" | "joining" | "connecting"

const STAGE_COPY: Record<LoadStage, { label: string; message: string }> = {
  finding: { label: "Finding", message: "Finding your document…" },
  opening: { label: "Opening", message: "Opening the session…" },
  joining: { label: "Joining", message: "Joining your group…" },
  connecting: { label: "Connecting", message: "Connecting live sync…" },
}

export function DocumentSessionLoader({
  stage,
}: {
  sessionTitle: string
  userName: string
  stage: LoadStage
}) {
  const copy = STAGE_COPY[stage]
  return <LoadingScreen className="h-full min-h-[28rem]" label={copy.label} message={copy.message} />
}
