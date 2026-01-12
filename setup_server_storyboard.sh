#!/bin/bash

# ==========================================
# Storyboard Tool Server Setup Script
# Works on Ubuntu 22.04 and 24.04
# ==========================================

set -e # Exit on error

# Variables
APP_DIR="/var/www/storyboard"
PROJECTS_DIR="/var/www/Storyboard_Projects"
PORT=3000
DOMAIN="tools.fmotion.fr"
CERTBOT_EMAIL="you@fmotion.fr"

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Server Setup...${NC}"

# 1. Update System
echo -e "${GREEN}[1/5] Updating system packages...${NC}"
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw ca-certificates gnupg

# 2. Install Docker (Engine + Compose plugin)
echo -e "${GREEN}[2/5] Installing Docker...${NC}"
curl -fsSL https://get.docker.com | sh

# 3. Install and Configure Nginx + Certbot
echo -e "${GREEN}[3/5] Installing Nginx and Certbot...${NC}"
apt-get install -y nginx certbot python3-certbot-nginx

# Create Nginx Config
echo -e "${GREEN}Configuring Nginx Reverse Proxy...${NC}"
cat > /etc/nginx/sites-available/storyboard <<EOL
# Default: drop requests for unknown subdomains
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    server_name ${DOMAIN};

    # Max upload size for video files
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL

# Enable the site
ln -sf /etc/nginx/sites-available/storyboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and Restart Nginx
nginx -t
systemctl restart nginx

# Request SSL certificate (Let's Encrypt)
echo -e "${GREEN}Requesting SSL certificate for ${DOMAIN}...${NC}"
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${CERTBOT_EMAIL}

# 4. Setup Firewall (UFW)
echo -e "${GREEN}[4/5] Configuring Firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
# Enable UFW non-interactively
ufw --force enable

# 5. Create Application Directory
echo -e "${GREEN}[5/5] Setting up App Directory at ${APP_DIR}...${NC}"
mkdir -p ${APP_DIR}
mkdir -p ${PROJECTS_DIR}
# Set permissions so we can upload files later (assuming root for now, or use a specific user)
# For simplicity in this setup, we'll give ownership to root but allow group write if needed later.
# In a multi-user env, we'd create a 'deploy' user.
chmod -R 755 ${APP_DIR}
chmod -R 755 ${PROJECTS_DIR}

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "Next steps:"
echo -e "1. Upload your project files to: ${APP_DIR}"
echo -e "2. Run: docker compose up -d --build"
echo -e "3. Visit: https://${DOMAIN}"
