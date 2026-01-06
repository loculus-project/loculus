#!/bin/sh
set -e

# Start FTP server in background
echo "Starting FTP server on port 21..."
python -c "from server import start_mock_ftp_server; start_mock_ftp_server(port=21, ssl=True); import time; time.sleep(999999)" &

# Give FTP server time to start
sleep 1

# Start HTTPS server in background
echo "Starting HTTPS server on port 443..."
uvicorn server:app --host 0.0.0.0 --port 443 --ssl-keyfile certs/server.key --ssl-certfile certs/chain.crt &

# Start HTTP server in foreground
echo "Starting HTTP server on port 80..."
exec uvicorn server:app --host 0.0.0.0 --port 80
