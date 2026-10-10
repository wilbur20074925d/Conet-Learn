const postgres = require('postgres')
const fs = require('fs')
const path = require('path')

// 读取数据库连接字符串
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error(
    "Database connection string not found. Please set DATABASE_URL in your .env.local file.\n" +
    "Format: postgresql://postgres:YOUR_PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres\n" +
    "Get your password from Supabase Dashboard > Settings > Database"
  )
  process.exit(1)
}

const sql = postgres(connectionString, {
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30
})

async function setupDatabase() {
  try {
    console.log('正在设置数据库表...')
    
    // 读取SQL文件
    const sqlFile = path.join(__dirname, '../lib/database-setup.sql')
    const sqlContent = fs.readFileSync(sqlFile, 'utf8')
    
    // 执行SQL
    await sql.unsafe(sqlContent)
    
    console.log('✅ 数据库表设置完成！')
    console.log('✅ user_consent 表已创建')
    
  } catch (error) {
    console.error('❌ 数据库设置失败:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

setupDatabase()
