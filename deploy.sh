#!/bin/bash

# Deployment script for English Word Fission
# Target: 39.107.221.247:3003

SERVER="39.107.221.247"
USER="root"
APP_NAME="english-word-fission"
APP_DIR="/var/www/$APP_NAME"
PORT=3003

echo "🚀 Starting deployment to $SERVER:$PORT..."

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='deploy.tar.gz' \
  --exclude='scripts' \
  --exclude='*.ts' \
  --exclude='test-*.ts' \
  --exclude='check-*.ts' \
  .

# Upload to server
echo "📤 Uploading to server..."
scp deploy.tar.gz $USER@$SERVER:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
ssh $USER@$SERVER << 'ENDSSH'
set -e

APP_NAME="english-word-fission"
APP_DIR="/var/www/$APP_NAME"
PORT=3003

# Create app directory if it doesn't exist
mkdir -p $APP_DIR

# Extract files
cd $APP_DIR
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# Install dependencies and build
echo "📦 Installing dependencies..."
npm install --production=false

echo "🏗️  Building application..."
npm run build

# Set up PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'english-word-fission',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3003',
    cwd: '/var/www/english-word-fission',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3003
    }
  }]
};
EOF

# Restart with PM2
echo "🔄 Restarting application with PM2..."
pm2 delete english-word-fission 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "✅ Deployment complete!"
pm2 status

ENDSSH

# Cleanup
rm deploy.tar.gz

echo "✅ Deployment finished successfully!"
echo "🌐 Application should be running at http://$SERVER:$PORT"
