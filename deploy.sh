#!/bin/bash

# Deployment script for bookmarks.fmotion.fr
# This script should be run on your VPS

set -e  # Exit on error

echo "====================================="
echo "Deploying bookmarks.fmotion.fr"
echo "====================================="

# Configuration
DOMAIN="bookmarks.fmotion.fr"
WEB_ROOT="/var/www/${DOMAIN}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
SERVICE_FILE="/etc/systemd/system/bookmarks.service"
REPO_URL="https://github.com/HNTBO/BookMark_Grid.git"
BRANCH="claude/style-vps-dashboard-k3tgV"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root or with sudo"
    exit 1
fi

echo ""
echo "Step 1: Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "Node.js installed successfully"
else
    echo "Node.js is already installed: $(node --version)"
fi

echo ""
echo "Step 2: Creating web directory..."
mkdir -p ${WEB_ROOT}

# Check if git repo exists
if [ -d "${WEB_ROOT}/.git" ]; then
    echo ""
    echo "Step 3: Updating existing repository..."
    cd ${WEB_ROOT}
    git fetch origin
    git checkout ${BRANCH}
    git pull origin ${BRANCH}
else
    echo ""
    echo "Step 3: Cloning repository..."
    git clone -b ${BRANCH} ${REPO_URL} ${WEB_ROOT}
    cd ${WEB_ROOT}
fi

echo ""
echo "Step 4: Installing Node.js dependencies..."
npm install --production

echo ""
echo "Step 5: Creating icons directory..."
mkdir -p ${WEB_ROOT}/icons
chown -R www-data:www-data ${WEB_ROOT}/icons

echo ""
echo "Step 6: Setting permissions..."
chown -R www-data:www-data ${WEB_ROOT}
chmod -R 755 ${WEB_ROOT}

echo ""
echo "Step 7: Configuring systemd service..."
if [ -f "${WEB_ROOT}/bookmarks.service" ]; then
    cp ${WEB_ROOT}/bookmarks.service ${SERVICE_FILE}
    systemctl daemon-reload
    systemctl enable bookmarks
    echo "Service configured and enabled"
fi

echo ""
echo "Step 8: Configuring Nginx..."
if [ -f "${WEB_ROOT}/nginx.conf" ]; then
    cp ${WEB_ROOT}/nginx.conf ${NGINX_AVAILABLE}

    # Enable site if not already enabled
    if [ ! -L "${NGINX_ENABLED}" ]; then
        ln -s ${NGINX_AVAILABLE} ${NGINX_ENABLED}
        echo "Nginx site enabled"
    else
        echo "Nginx site already enabled"
    fi
else
    echo "Warning: nginx.conf not found in repository"
fi

echo ""
echo "Step 9: Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "Step 10: Starting services..."
    systemctl restart bookmarks
    systemctl reload nginx
    echo "Services started successfully"
else
    echo "Nginx configuration test failed. Please check the configuration."
    exit 1
fi

echo ""
echo "Step 11: Checking service status..."
sleep 2
systemctl status bookmarks --no-pager || true

echo ""
echo "====================================="
echo "Deployment completed successfully!"
echo "====================================="
echo ""
echo "Your site should be available at: https://${DOMAIN}"
echo ""
echo "Useful commands:"
echo "  - View app logs:    journalctl -u bookmarks -f"
echo "  - View access logs: tail -f /var/log/nginx/${DOMAIN}.access.log"
echo "  - View error logs:  tail -f /var/log/nginx/${DOMAIN}.error.log"
echo "  - Restart app:      systemctl restart bookmarks"
echo "  - Update site:      cd ${WEB_ROOT} && git pull && npm install && systemctl restart bookmarks"
echo ""
