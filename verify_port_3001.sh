#!/bin/bash
SERVER_IP="39.107.221.247"
USER="root"
PASS="YOUR_SERVER_PASSWORD"

/usr/bin/expect -c "
set timeout 20
spawn ssh $USER@$SERVER_IP
expect {
    \"*yes/no*\" { send \"yes\r\"; exp_continue }
    \"*assword:*\" { send \"$PASS\r\" }
}
expect \"*#*\"
send \"echo '=== CHECKING PORT 3001 ==='\r\"
send \"netstat -nltp | grep 3001\r\"
send \"echo '=== CHECKING PM2 PROCESS ==='\r\"
send \"pm2 list\r\"
send \"echo '=== CHECKING HTTP RESPONSE (3001) ==='\r\"
send \"curl -I localhost:3001\r\"
send \"exit\r\"
expect eof
"
