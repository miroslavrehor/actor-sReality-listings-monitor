# sReality Listings Monitor

Search and monitor sReality listings

## Install

GIT
sudo apt install git
git clone https://github.com/miroslavrehor/actor-sReality-listings-monitor.git

NODE
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

APIFY
npm install apify crawlee playwright

CHROME
sudo wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb

CRON
crontab -e
0 17 * * * node /home/king/actor-sReality-listings-monitor/src/main.js houses-sale
0 19 * * * node /home/king/actor-sReality-listings-monitor/src/main.js appartments-sale
0 21 * * * node /home/king/actor-sReality-listings-monitor/src/main.js appartments-rent

