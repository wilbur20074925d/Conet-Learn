// lib/db.ts
import postgres from 'postgres'

// Get database URL - you need to set this in your .env.local file
// Format: postgresql://postgres:YOUR_PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "Database connection string not found. Please set DATABASE_URL in your .env.local file.\n" +
    "Format: postgresql://postgres:1998614ny@db.lzvhzieiryzpqhioafwr.supabase.co:5432/postgres\n" +
    "Get your password from Supabase Dashboard > Settings > Database"
  )
}

const sql = postgres(connectionString, {
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30
})

export default sql
