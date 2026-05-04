#!/bin/bash
SERVER_IP="39.107.221.247"
USER="root"
PASS="YOUR_SERVER_PASSWORD"
REMOTE_DIR="/www/wwwroot/LPTenglish"

echo "========================================"
echo "NUKING SERVER (NO REDEPLOY) - $SERVER_IP"
echo "========================================"

/usr/bin/expect -c "
set timeout 60
spawn ssh $USER@$SERVER_IP
expect {
    \"*yes/no*\" { send \"yes\r\"; exp_continue }
    \"*assword:*\" { send \"$PASS\r\" }
}
expect \"*#*\"

# 1. STOP NGINX
send \"/etc/init.d/nginx stop\r\"

# 2. KILL EVERYTHING
send \"pm2 kill\r\"
send \"killall -9 node\r\"
send \"pkill -9 node\r\"

# 3. DELETE FILES
send \"rm -rf $REMOTE_DIR\r\"

# 4. VERIFY
send \"echo '=== PROCESS CHECK ==='\r\"
send \"ps aux | grep node\r\"
send \"echo '=== FOLDER CHECK ==='\r\"
send \"ls -ld $REMOTE_DIR\r\"

send \"exit\r\"
expect eof
"
