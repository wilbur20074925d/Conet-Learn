import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/[\r\n]/g, "").trim()
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.replace(/[\r\n]/g, "").trim()

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  process.exit(1)
}

const accounts = [
  {
    email: process.env.CONET_TEACHER_EMAIL,
    password: process.env.CONET_TEACHER_PASSWORD,
    name: "Teacher",
    role: "teacher",
  },
  {
    email: process.env.CONET_STUDENT_EMAIL,
    password: process.env.CONET_STUDENT_PASSWORD,
    name: "Yang Yuebo",
    role: "student",
  },
]

const supabase = createClient(url, key)

for (const account of accounts) {
  if (!account.email || !account.password) {
    console.error("Missing email or password for", account.role)
    process.exit(1)
  }
  const { data, error } = await supabase.auth.signUp({
    email: account.email,
    password: account.password,
    options: { data: { name: account.name, role: account.role } },
  })
  if (error) {
    console.log(`${account.role}: ${error.message}`)
    continue
  }
  console.log(
    `${account.role}: created=${Boolean(data.user)} session=${Boolean(data.session)} confirmed=${Boolean(data.user?.email_confirmed_at)}`
  )
}
