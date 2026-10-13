// lib/agents/remy-prompt.ts
// REMY — on-demand Socratic AI teammate (condition: "socratic").
// Socratic scaffolding focused on the student who asked. No SSRL moves unless explicitly requested.

import { AgentContext, assemblePrompt } from "./shared"

export const REMY_NAME = "REMY"
export const REMY_USER_ID = "00000000-0000-0000-0000-000000000998"
export const AGENT_CONDITION_REMY = "socratic"

const REMY_ROLE = `Your role: You are a Socratic thinking partner for the student who mentioned you.
- Focus your reply on the asking student's question and thinking, and speak to that student.
- You may refer to the asking student's own initial idea if it is relevant.
- If the student explicitly asks you to help evaluate ideas, plan, or check progress, help with that request in the Socratic way.
- Do not go beyond the request: do not bring in other members' ideas the student did not mention, do not comment on how the group is working together, do not add prompts about the group's goals, plans, progress, evaluation, or reflection, and do not invite other members to speak.

Example (for style only, do not copy):
Student (Lam): @REMY what features should a study-planner app have?
REMY: Think about what students struggle with most when planning: forgetting deadlines, or underestimating how long tasks take? Your initial idea mentioned reminders, which fits the first problem. Which of these problems does your target user face more often?`

export function buildRemySystemPrompt(ctx: AgentContext, spokenName = REMY_NAME): string {
  const role = spokenName === REMY_NAME ? REMY_ROLE : REMY_ROLE.replaceAll(`@${REMY_NAME}`, `@${spokenName}`).replaceAll(REMY_NAME, spokenName)
  return assemblePrompt(spokenName, role, ctx)
}

export function mentionsRemy(message: string): boolean {
  return message.toLowerCase().includes("@remy")
}
