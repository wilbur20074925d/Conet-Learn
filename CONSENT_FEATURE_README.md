# 数据收集同意功能

## 功能概述

这个功能在用户登录后显示一个数据收集同意弹窗，让用户选择是否同意收集他们的学习过程数据。

## 功能特点

- ✅ 用户登录后自动显示同意弹窗（仅首次登录时）
- ✅ 详细说明数据收集类型和用途
- ✅ 明确的隐私保护承诺
- ✅ 用户可以随时更改同意状态
- ✅ 美观的UI设计，与现有界面保持一致

## 文件结构

### 新增文件

1. **`components/data-collection-consent.tsx`** - 主要的同意弹窗组件
2. **`components/consent-wrapper.tsx`** - 客户端包装器组件
3. **`app/api/user-consent/route.ts`** - 处理用户同意状态的API端点
4. **`app/api/user-consent-status/route.ts`** - 检查用户同意状态的API端点
5. **`lib/database-setup.sql`** - 数据库表创建脚本
6. **`scripts/setup-database.js`** - 数据库初始化脚本
7. **`app/test-consent/page.tsx`** - 测试页面（可选）

### 修改文件

1. **`app/page.tsx`** - 添加了同意弹窗组件
2. **`package.json`** - 添加了数据库设置脚本

## 数据库设置

### 1. 创建数据库表

运行以下命令来创建必要的数据库表：

```bash
npm run setup-db
```

或者手动执行SQL：

```sql
-- 在您的PostgreSQL数据库中执行以下SQL
CREATE TABLE IF NOT EXISTS user_consent (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consent_user_id ON user_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_consent_given ON user_consent(consent_given);
```

### 2. 环境变量

确保您的 `.env.local` 文件包含正确的数据库连接字符串：

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
```

## 使用方法

### 1. 启动应用

```bash
npm run dev
```

### 2. 测试功能

1. 访问登录页面
2. 使用有效的学生ID和姓名登录
3. 登录成功后，会自动显示数据收集同意弹窗
4. 选择同意或不同意，点击"确认选择"
5. 弹窗关闭，进入主界面

### 3. 测试功能

访问测试页面来验证功能：

```
http://localhost:3000/test-consent
```

这个页面允许您：
- 手动触发同意弹窗
- 测试同意和不同意的选择
- 查看功能说明和测试要点

### 4. 检查同意状态

您可以通过API端点检查用户的同意状态：

```bash
# 检查当前登录用户的同意状态
curl -X GET http://localhost:3000/api/user-consent-status

# 检查特定用户的同意状态
curl -X GET "http://localhost:3000/api/user-consent?userId=123"
```

## API 端点

### POST `/api/user-consent`

保存用户的同意状态

**请求体：**
```json
{
  "userId": 123,
  "consentGiven": true
}
```

**响应：**
```json
{
  "success": true,
  "message": "Consent status saved successfully"
}
```

### GET `/api/user-consent-status`

获取当前登录用户的同意状态

**响应：**
```json
{
  "hasConsentRecord": true,
  "consentGiven": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### GET `/api/user-consent?userId=123`

获取特定用户的同意状态

**响应：**
```json
{
  "hasConsentRecord": true,
  "consentGiven": false,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

## 功能逻辑

1. **首次登录检测**：当用户登录成功后，系统会检查用户是否已有同意记录
2. **弹窗显示**：如果没有记录，显示同意弹窗
3. **状态保存**：用户选择后，将同意状态保存到数据库
4. **后续登录**：已设置过同意状态的用户不会再次看到弹窗

## 自定义选项

### 修改弹窗内容

编辑 `components/data-collection-consent.tsx` 文件中的文本内容：

- 数据收集说明
- 数据使用目的
- 隐私保护承诺

### 修改样式

弹窗使用了与现有界面一致的样式，基于Tailwind CSS。您可以修改：

- 颜色主题
- 布局结构
- 动画效果

### 添加更多字段

如果需要收集更多用户偏好，可以：

1. 修改数据库表结构
2. 更新API端点
3. 修改弹窗组件

## 注意事项

1. **数据隐私**：确保遵守相关数据保护法规（如GDPR、CCPA等）
2. **用户权利**：用户应该能够随时更改或撤回同意
3. **数据安全**：确保用户数据的安全存储和传输
4. **透明度**：向用户清楚地说明数据收集的目的和范围

## 故障排除

### 弹窗不显示

1. 检查数据库表是否已创建
2. 确认API端点是否正常工作
3. 查看浏览器控制台是否有错误

### 数据库连接错误

1. 检查 `DATABASE_URL` 环境变量
2. 确认数据库服务是否运行
3. 验证数据库权限设置

### API 错误

1. 检查网络请求是否成功
2. 查看服务器日志
3. 确认用户认证状态

## 未来改进

- [ ] 添加同意状态的批量管理功能
- [ ] 实现同意状态的定期提醒
- [ ] 添加数据收集的详细统计
- [ ] 支持多种语言的同意声明
- [ ] 集成更完善的数据保护工具
