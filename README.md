# WordLink 英语词汇裂变

WordLink 是一个基于 Next.js 的英语词汇学习应用，用词义关系、词库、测验、学习记录和 AI 辅助讲解来帮助学习者建立单词之间的连接。

## 主要功能

- 词汇裂变图谱：围绕目标单词展示同义词、释义和二级关联词。
- 单词详情：展示英文释义、中文释义、音标、例句和词形信息。
- 词库学习：支持内置词库浏览、分组学习和自定义用户词库。
- 测验练习：支持选择、拼写、回忆等练习模式。
- 学习记录：记录访问历史、测验结果、打卡和学习进度。
- 单词笔记：为单词创建笔记，并支持互动记录。
- AI 辅助：基于学习上下文和单词信息生成讲解与对话。
- 中英文界面：使用 `next-intl` 提供中文和英文文案。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Prisma
- PostgreSQL
- Tailwind CSS
- next-intl
- D3 Force / react-force-graph-2d

## 本地运行

先安装依赖：

```bash
npm install
```

创建 `.env` 文件，并配置数据库与 AI 服务环境变量：

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DATABASE?schema=LPT_english"
DEEPSEEK_APIKEY="YOUR_DEEPSEEK_API_KEY"
AUTH_API_BASE="https://auth.lifeplayertribe.com/api/v1"
```

生成 Prisma Client：

```bash
npx prisma generate
```

执行数据库迁移：

```bash
npx prisma migrate deploy
```

启动开发服务：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

## 常用命令

```bash
npm run dev       # 启动开发服务
npm run build     # 构建生产版本
npm run start     # 启动生产服务，默认端口 3011
npm run lint      # 运行 ESLint
npm run migrate   # 导入词库数据到数据库
npm run verify    # 验证数据迁移结果
```

## 数据目录

- `data/word_fission_data.csv`：词汇裂变关系数据。
- `data/ecdict_extracted.csv`：词典与中文释义数据。
- `data/word_chinese/`：单词中文增强数据。
- `data/word_text_database/`：单词 Markdown 详情数据。
- `data/word_library/`：内置词库数据。
- `data/ai_prompts/`：AI 对话提示词模板。

## 项目结构

```text
.
├── data/              # 词库、词典、AI 提示词和裂变关系数据
├── messages/          # 中英文界面文案
├── prisma/            # Prisma schema 和数据库迁移
├── public/            # 静态资源
├── scripts/           # 数据导入与迁移验证脚本
├── src/               # Next.js 应用源码
├── docker-compose.yml # 本地 PostgreSQL 开发环境
├── ecosystem.config.js# PM2 生产运行配置
├── next.config.js     # Next.js 配置
└── package.json       # 依赖与 npm 脚本
```

## 数据库

项目使用 Prisma 连接 PostgreSQL，默认 schema 为 `LPT_english`。数据库结构定义在：

```text
prisma/schema.prisma
```

迁移文件位于：

```text
prisma/migrations/
```

## 环境变量

`.env` 文件不会提交到仓库。部署时需要在服务器或平台环境变量中配置：

- `DATABASE_URL`
- `DEEPSEEK_APIKEY`
- `AUTH_API_BASE`

## 部署说明

生产服务使用：

```bash
npm run build
npm run start
```

`npm run start` 会通过 `next start -p 3011` 启动应用。实际部署时建议使用 PM2、systemd 或平台托管服务管理进程，并在 Nginx 中反向代理到 `3011` 端口。
