# 部署说明

## 部署包已创建

文件：`deploy.tar.gz` (106MB)

## 手动部署步骤

### 1. 上传部署包到服务器

```bash
scp deploy.tar.gz root@39.107.221.247:/tmp/
```

### 2. SSH 登录到服务器

```bash
ssh root@39.107.221.247
```

### 3. 在服务器上执行部署

```bash
# 设置变量
APP_DIR="/www/wwwroot/wordlink.lifeplayertribe.com"
APP_NAME="wordlink"

# 备份当前 .env 文件
if [ -f "$APP_DIR/.env" ]; then
  echo "💾 Backing up .env file..."
  cp $APP_DIR/.env /tmp/.env.backup
fi

# 解压文件
echo "📦 Extracting files..."
cd $APP_DIR
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# 恢复 .env 文件
if [ -f "/tmp/.env.backup" ]; then
  echo "♻️  Restoring .env file..."
  cp /tmp/.env.backup $APP_DIR/.env
  rm /tmp/.env.backup
fi

# 安装依赖（仅生产环境）
echo "📦 Installing dependencies..."
npm install --production

# 生成 Prisma Client
echo "🔧 Generating Prisma client..."
npx prisma generate

# 重启 PM2
echo "🔄 Restarting application with PM2..."
pm2 restart wordlink

# 清理 nginx 缓存
echo "🧹 Clearing nginx cache..."
rm -rf /www/server/nginx/proxy_cache_dir/*
nginx -s reload

# 查看状态
echo "✅ Deployment complete!"
echo ""
echo "📊 PM2 Status:"
pm2 status wordlink

echo ""
echo "📝 Recent logs:"
pm2 logs wordlink --lines 20 --nostream
```

### 4. 验证部署

访问：https://wordlink.lifeplayertribe.com

测试 CORS API：
```bash
curl -X OPTIONS https://wordlink.lifeplayertribe.com/api/user/libraries/collect \
  -H "Origin: https://echostream.lifeplayertribe.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

预期响应头应包含：
- `Access-Control-Allow-Origin: https://echostream.lifeplayertribe.com`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`

## 快速部署（一键命令）

如果你已经配置了 SSH 密钥，可以直接运行：

```bash
./deploy-wordlink.sh
```

## 常用命令

```bash
# 查看日志
ssh root@39.107.221.247 'pm2 logs wordlink'

# 重启应用
ssh root@39.107.221.247 'pm2 restart wordlink'

# 查看状态
ssh root@39.107.221.247 'pm2 status wordlink'

# 清理 nginx 缓存
ssh root@39.107.221.247 'rm -rf /www/server/nginx/proxy_cache_dir/* && nginx -s reload'
```

## 部署内容

本次部署包含以下更新：

### 1. CORS 支持
- 创建了 `src/lib/cors.ts` CORS 工具函数
- 所有用户库 API 都添加了 CORS 支持
- 支持跨域访问（阅读平台 → wordlink 平台）

### 2. 修改的 API
- `/api/user/libraries/collect` - 单词收集接口
- `/api/user/libraries/import` - 批量导入接口
- `/api/user/libraries` - 获取/创建单词库
- `/api/user/libraries/[id]` - 单词库详情/更新/删除
- `/api/user/libraries/[id]/words` - 单词列表/添加/删除
- `/api/user/libraries/[id]/groups` - 分组信息

### 3. 允许的跨域源
- `https://wordlink.lifeplayertribe.com` (主站)
- `https://echostream.lifeplayertribe.com` (阅读平台)
- `http://localhost:3000` (本地开发)
- `http://localhost:3001` (本地开发)
- `http://localhost:5173` (本地开发 - Vite)
- `http://localhost:8080` (本地开发)

### 4. 文档更新
- 更新了 `USER_LIBRARY_API_DOCUMENTATION.md`
- 添加了 CORS 配置说明
- 添加了常见问题解答

## 注意事项

1. 部署前确保 `.env` 文件存在且配置正确
2. 部署会自动备份和恢复 `.env` 文件
3. nginx 缓存会被清理，确保新的 CORS 头生效
4. PM2 会重启应用，可能有几秒钟的停机时间
