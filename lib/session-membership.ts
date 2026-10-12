type Membership = {
  groupId: string
  groupName: string
  newintervene: number
}

type MembershipContext = {
  memberships: Membership[]
  groupIds: string[]
}

export function membershipFor<T extends Membership>(ctx: { memberships: T[] }, groupId?: string | null) {
  if (groupId) {
    const found = ctx.memberships.find((item) => item.groupId === groupId)
    if (found) return found
  }
  return ctx.memberships[0] ?? null
}

export function inGroup(ctx: MembershipContext, groupId: string) {
  return ctx.groupIds.includes(groupId)
}
