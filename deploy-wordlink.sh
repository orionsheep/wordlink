#!/bin/bash

# Deployment script for WordLink (English Word Fission)
# Target: wordlink.lifeplayertribe.com (39.107.221.247:3011)

set -e

SERVER="39.107.221.247"
USER="root"
APP_NAME="wordlink"
APP_DIR="/www/wwwroot/wordlink.lifeplayertribe.com"
PORT=3011

echo "🚀 Starting deployment to wordlink.lifeplayertribe.com..."

# Build locally first
echo "🏗️  Building application locally..."
npm run build

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='deploy*.tar.gz' \
  --exclude='scripts' \
  --exclude='test-*.ts' \
  --exclude='check-*.ts' \
  --exclude='.next/cache' \
  --exclude='*.md' \
  --exclude='messages' \
  --exclude='docs' \
  .

# Upload to server
echo "📤 Uploading to server..."
scp deploy.tar.gz $USER@$SERVER:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
ssh $USER@$SERVER << 'ENDSSH'
set -e

APP_DIR="/www/wwwroot/wordlink.lifeplayertribe.com"
APP_NAME="wordlink"

# Backup current .env
if [ -f "$APP_DIR/.env" ]; then
  echo "💾 Backing up .env file..."
  cp $APP_DIR/.env /tmp/.env.backup
fi

# Extract files
echo "📦 Extracting files..."
cd $APP_DIR
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# Restore .env if it was backed up
if [ -f "/tmp/.env.backup" ]; then
  echo "♻️  Restoring .env file..."
  cp /tmp/.env.backup $APP_DIR/.env
  rm /tmp/.env.backup
fi

# Install dependencies (production only)
echo "📦 Installing dependencies..."
npm install --production

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Restart with PM2
echo "🔄 Restarting application with PM2..."
pm2 restart wordlink

# Clear nginx cache
echo "🧹 Clearing nginx cache..."
rm -rf /www/server/nginx/proxy_cache_dir/*
nginx -s reload

echo "✅ Deployment complete!"
echo ""
echo "📊 PM2 Status:"
pm2 status wordlink

echo ""
echo "📝 Recent logs:"
pm2 logs wordlink --lines 20 --nostream

ENDSSH

# Cleanup
rm deploy.tar.gz

echo ""
echo "✅ Deployment finished successfully!"
echo "🌐 Application is running at https://wordlink.lifeplayertribe.com"
echo ""
echo "📋 Useful commands:"
echo "  - View logs: ssh root@$SERVER 'pm2 logs wordlink'"
echo "  - Restart app: ssh root@$SERVER 'pm2 restart wordlink'"
echo "  - Check status: ssh root@$SERVER 'pm2 status wordlink'"
