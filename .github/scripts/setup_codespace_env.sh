#! /bin/sh
sudo wget https://github.com/mikefarah/yq/releases/download/v4.6.1/yq_linux_amd64 -O /usr/bin/yq &&sudo chmod +x /usr/bin/yq
wget -q -O - https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash


# Wait for Docker to be available
until docker info >/dev/null 2>&1; do
    echo "Waiting for Docker to start..."
    sleep 1
done
echo "Docker is up and running!"

./deploy.py cluster --dev
./deploy.py helm --dev --enableProcessing

./deploy.py config

cd website || exit
cp .env.example .env
npm install

echo "alias loculusWebsite='cd /workspaces/loculus/website && npm run start'" >> ~/.bashrc

echo "alias loculusBackend='cd /workspaces/loculus/backend && ./start_dev.sh'" >> ~/.bashrc

echo "alias loculusPort='gh codespace ports visibility 8079:public -c $CODESPACE_NAME && gh codespace ports visibility 8079:public -c $CODESPACE_NAME'" >> ~/.bashrc
