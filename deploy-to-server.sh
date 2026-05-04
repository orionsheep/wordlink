#!/bin/bash

# Deployment script for English Word Fission
# Target: 39.107.221.247:3003

set -e

SERVER="YOUR_SERVER_IP"
USER="root"
PASSWORD="YOUR_SERVER_PASSWORD"
APP_NAME="english-word-fission"
APP_DIR="/var/www/$APP_NAME"
PORT=3003

echo "🚀 Starting deployment to $SERVER:$PORT..."

# Build locally first
echo "🏗️  Building application locally..."
npm run build

# Create deployment package (exclude unnecessary files)
echo "📦 Creating deployment package..."
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='deploy.tar.gz' \
  --exclude='scripts' \
  --exclude='test-*.ts' \
  --exclude='check-*.ts' \
  --exclude='.next/cache' \
  .

# Upload to server using sshpass
echo "📤 Uploading to server..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no deploy.tar.gz $USER@$SERVER:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
set -e

APP_NAME="english-word-fission"
APP_DIR="/var/www/$APP_NAME"
PORT=3003

# Create app directory if it doesn't exist
echo "📁 Creating application directory..."
mkdir -p $APP_DIR

# Extract files
echo "📦 Extracting files..."
cd $APP_DIR
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# Create .env file on server
echo "⚙️  Creating .env file..."
cat > .env << 'EOF'
# Database Configuration
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DATABASE?schema=LPT_english"

# AI API Configuration
DEEPSEEK_APIKEY=YOUR_DEEPSEEK_API_KEY

# LPT Auth API Configuration
AUTH_API_BASE=https://auth.lifeplayertribe.com/api/v1
EOF

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Set up PM2 ecosystem file
echo "📝 Creating PM2 configuration..."
cat > ecosystem.config.js << 'EOFPM2'
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
EOFPM2

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Restart with PM2
echo "🔄 Restarting application with PM2..."
pm2 delete english-word-fission 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "✅ Deployment complete!"
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📝 Recent logs:"
pm2 logs english-word-fission --lines 20 --nostream

ENDSSH

# Cleanup
rm deploy.tar.gz

echo ""
echo "✅ Deployment finished successfully!"
echo "🌐 Application should be running at http://$SERVER:$PORT"
echo ""
echo "📋 Useful commands:"
echo "  - View logs: ssh root@$SERVER 'pm2 logs english-word-fission'"
echo "  - Restart app: ssh root@$SERVER 'pm2 restart english-word-fission'"
echo "  - Stop app: ssh root@$SERVER 'pm2 stop english-word-fission'"
