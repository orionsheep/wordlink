#!/bin/bash

# 自动部署脚本 - 使用密码认证
# Target: wordlink.lifeplayertribe.com

set -e

SERVER="39.107.221.247"
USER="root"
PASSWORD="YOUR_SERVER_PASSWORD"
APP_DIR="/www/wwwroot/wordlink.lifeplayertribe.com"

echo "🚀 开始自动部署到 wordlink.lifeplayertribe.com..."

# 检查是否安装了 sshpass
if ! command -v sshpass &> /dev/null; then
  echo "⚠️  sshpass 未安装，尝试安装..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
      brew install hudochenkov/sshpass/sshpass
    else
      echo "❌ 请先安装 Homebrew 或手动安装 sshpass"
      exit 1
    fi
  else
    # Linux
    sudo apt-get install -y sshpass || sudo yum install -y sshpass
  fi
fi

# 检查部署包
if [ ! -f "deploy.tar.gz" ]; then
  echo "❌ 错误：deploy.tar.gz 不存在"
  exit 1
fi

# 上传到服务器
echo "📤 上传部署包到服务器..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no deploy.tar.gz $USER@$SERVER:/tmp/

# 在服务器上部署
echo ""
echo "🔧 在服务器上执行部署..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
set -e

APP_DIR="/www/wwwroot/wordlink.lifeplayertribe.com"
APP_NAME="wordlink"

echo "📁 切换到应用目录..."
cd $APP_DIR

# 备份 .env
if [ -f ".env" ]; then
  echo "💾 备份 .env 文件..."
  cp .env /tmp/.env.backup
fi

# 解压
echo "📦 解压文件..."
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# 恢复 .env
if [ -f "/tmp/.env.backup" ]; then
  echo "♻️  恢复 .env 文件..."
  cp /tmp/.env.backup .env
  rm /tmp/.env.backup
fi

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 生成 Prisma Client
echo "🔧 生成 Prisma Client..."
npx prisma generate

# 重启 PM2
echo "🔄 重启应用..."
pm2 restart wordlink

# 清理 nginx 缓存
echo "🧹 清理 nginx 缓存..."
rm -rf /www/server/nginx/proxy_cache_dir/*
nginx -s reload

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 PM2 状态："
pm2 status wordlink

echo ""
echo "📝 最近日志："
pm2 logs wordlink --lines 10 --nostream

ENDSSH

echo ""
echo "✅ 部署成功完成！"
echo "🌐 应用地址: https://wordlink.lifeplayertribe.com"
echo ""
echo "📋 测试 CORS："
echo "curl -X OPTIONS https://wordlink.lifeplayertribe.com/api/user/libraries/collect \\"
echo "  -H 'Origin: https://echostream.lifeplayertribe.com' \\"
echo "  -H 'Access-Control-Request-Method: POST' -v"
