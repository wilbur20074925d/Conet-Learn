import { redirect } from "next/navigation"
import TeacherAccountsScreen from "@/components/teacher-accounts-screen"
import { getSessionContext } from "@/lib/actions"
import { listManagedAccounts } from "@/lib/account-actions"

export const dynamic = "force-dynamic"

export default async function TeacherAccountsPage() {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    redirect("/dashboard")
  }
  if (session.ctx.role !== "teacher") redirect("/dashboard")

  const accounts = await listManagedAccounts()
  if (!accounts.ok) {
    return (
      <TeacherAccountsScreen
        name={session.ctx.name}
        profileId={session.ctx.profileId}
        students={[]}
        teachers={[]}
        setupError={accounts.error}
      />
    )
  }

  return (
    <TeacherAccountsScreen
      name={session.ctx.name}
      profileId={session.ctx.profileId}
      students={accounts.students}
      teachers={accounts.teachers}
    />
  )
}
