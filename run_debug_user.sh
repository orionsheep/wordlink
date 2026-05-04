#!/bin/bash
SERVER_IP="39.107.221.247"
USER="root"
PASS="YOUR_SERVER_PASSWORD"
REMOTE_DIR="/www/wwwroot/LPTenglish"

# Upload
/usr/bin/expect -c "
set timeout 20
spawn scp debug_user.js $USER@$SERVER_IP:$REMOTE_DIR/
expect {
    \"*yes/no*\" { send \"yes\r\"; exp_continue }
    \"*assword:*\" { send \"$PASS\r\" }
}
expect eof
"

# Run
/usr/bin/expect -c "
set timeout 20
spawn ssh $USER@$SERVER_IP
expect {
    \"*yes/no*\" { send \"yes\r\"; exp_continue }
    \"*assword:*\" { send \"$PASS\r\" }
}
expect \"*#*\"
send \"cd $REMOTE_DIR\r\"
send \"node debug_user.js\r\"
send \"exit\r\"
expect eof
"
