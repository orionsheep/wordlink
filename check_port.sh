#!/bin/bash
SERVER_IP="39.107.221.247"
USER="root"
PASS="YOUR_SERVER_PASSWORD"

/usr/bin/expect -c "
set timeout 20
spawn ssh $USER@$SERVER_IP \"curl -I localhost:3000\"
expect {
    \"*yes/no*\" { send \"yes\r\"; exp_continue }
    \"*assword:*\" { send \"$PASS\r\" }
}
expect eof
"
