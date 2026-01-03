# Deployment Guide for bookmarks.fmotion.fr

This guide will help you deploy your Speed Dial bookmark dashboard with Node.js backend to your VPS.

## Prerequisites

- VPS with root/sudo access
- Ubuntu/Debian Linux (or compatible)
- Nginx installed
- Wildcard SSL certificate for *.fmotion.fr (or specific cert for bookmarks.fmotion.fr)
- DNS A record pointing bookmarks.fmotion.fr to your VPS IP
- Git installed

## Quick Deployment (Automated)

The easiest way to deploy is using the automated script:

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Run the deployment script
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/HNTBO/BookMark_Grid/claude/style-vps-dashboard-k3tgV/deploy.sh)"
```

The script will:
1. Install Node.js (if not present)
2. Clone the repository
3. Install dependencies
4. Create necessary directories
5. Set up systemd service
6. Configure nginx
7. Start all services

## Manual Deployment

If you prefer manual installation, follow these steps:

### 1. Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Clone Repository

```bash
# Create web directory
sudo mkdir -p /var/www/bookmarks.fmotion.fr

# Clone the repository
sudo git clone -b claude/style-vps-dashboard-k3tgV \
  https://github.com/HNTBO/BookMark_Grid.git \
  /var/www/bookmarks.fmotion.fr

# Navigate to directory
cd /var/www/bookmarks.fmotion.fr
```

### 3. Install Dependencies

```bash
# Install Node.js packages
sudo npm install --production

# Create icons directory
sudo mkdir -p icons

# Set proper ownership
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr
sudo chmod -R 755 /var/www/bookmarks.fmotion.fr
```

### 4. Configure Systemd Service

```bash
# Copy service file
sudo cp bookmarks.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable bookmarks

# Start the service
sudo systemctl start bookmarks

# Check status
sudo systemctl status bookmarks
```

### 5. Configure Nginx

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/bookmarks.fmotion.fr

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/bookmarks.fmotion.fr \
           /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 6. SSL Certificate Setup

If you don't already have a wildcard certificate for *.fmotion.fr:

```bash
# Install certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get wildcard certificate (requires DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.fmotion.fr" -d "fmotion.fr"

# Follow the prompts to add TXT records to your DNS
```

For subdomain-specific certificate:

```bash
# Get certificate for bookmarks.fmotion.fr only
sudo certbot --nginx -d bookmarks.fmotion.fr
```

### 7. Verify Deployment

Visit https://bookmarks.fmotion.fr in your browser. You should see your Speed Dial dashboard.

## Architecture Overview

```
User Browser
     ↓
   HTTPS
     ↓
  Nginx (443) → SSL Termination
     ↓
  Proxy Pass
     ↓
Node.js/Express (3000)
     ↓
  ├── Static Files (public/)
  ├── API Endpoints
  ├── Icon Processing (Sharp)
  └── Icon Storage (icons/)
```

## File Locations

| Component | Location |
|-----------|----------|
| Application | `/var/www/bookmarks.fmotion.fr/` |
| Frontend | `/var/www/bookmarks.fmotion.fr/public/` |
| Backend | `/var/www/bookmarks.fmotion.fr/server.js` |
| Icons | `/var/www/bookmarks.fmotion.fr/icons/` |
| Nginx config | `/etc/nginx/sites-available/bookmarks.fmotion.fr` |
| Systemd service | `/etc/systemd/system/bookmarks.service` |
| SSL certificates | `/etc/letsencrypt/live/fmotion.fr/` |
| Nginx logs | `/var/log/nginx/bookmarks.fmotion.fr.*.log` |
| App logs | `journalctl -u bookmarks` |

## Updating the Site

### Using Git

```bash
cd /var/www/bookmarks.fmotion.fr
sudo git pull origin claude/style-vps-dashboard-k3tgV
sudo npm install
sudo systemctl restart bookmarks
```

### Manual Update

```bash
# Upload new files via scp
scp server.js user@your-vps:/tmp/
scp -r public user@your-vps:/tmp/

# On VPS
sudo cp /tmp/server.js /var/www/bookmarks.fmotion.fr/
sudo cp -r /tmp/public/* /var/www/bookmarks.fmotion.fr/public/
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr
sudo systemctl restart bookmarks
```

## Environment Configuration

### Port Configuration

Default port is 3000. To change:

**Option 1: Environment variable**
```bash
# Edit service file
sudo nano /etc/systemd/system/bookmarks.service

# Add or modify:
Environment=PORT=3001

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart bookmarks
```

**Option 2: Edit server.js**
```javascript
const PORT = process.env.PORT || 3001;
```

### Node Environment

Set production mode (recommended):

```bash
# In bookmarks.service
Environment=NODE_ENV=production
```

## Troubleshooting

### Service won't start

```bash
# Check service status
sudo systemctl status bookmarks

# View logs
sudo journalctl -u bookmarks -n 50

# Common issues:
# - Node.js not installed
# - Dependencies not installed (run npm install)
# - Port already in use
# - Permissions issues
```

### Icons not loading

```bash
# Check icons directory
ls -la /var/www/bookmarks.fmotion.fr/icons

# Fix permissions
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr/icons
sudo chmod -R 755 /var/www/bookmarks.fmotion.fr/icons

# Check disk space
df -h
```

### Nginx errors

```bash
# Test nginx configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/bookmarks.fmotion.fr.error.log

# Common issues:
# - SSL certificate paths incorrect
# - Port 3000 not accessible
# - Service not running
```

### SSL certificate issues

```bash
# List certificates
sudo certbot certificates

# Renew certificates
sudo certbot renew --dry-run

# Check certificate expiry
sudo openssl x509 -in /etc/letsencrypt/live/fmotion.fr/cert.pem -text -noout | grep "Not After"
```

### Wikimedia search not working

```bash
# Test internet connectivity
curl -I https://commons.wikimedia.org

# Check logs for API errors
sudo journalctl -u bookmarks -f

# Verify DNS resolution
nslookup commons.wikimedia.org
```

### Upload failures

```bash
# Check nginx upload size limit
grep client_max_body_size /etc/nginx/sites-available/bookmarks.fmotion.fr

# Should be: client_max_body_size 10M;

# Check server.js upload limit
grep fileSize /var/www/bookmarks.fmotion.fr/server.js

# Should be: limits: { fileSize: 5 * 1024 * 1024 }
```

## Monitoring

### View Real-Time Logs

```bash
# Application logs
sudo journalctl -u bookmarks -f

# Nginx access logs
sudo tail -f /var/log/nginx/bookmarks.fmotion.fr.access.log

# Nginx error logs
sudo tail -f /var/log/nginx/bookmarks.fmotion.fr.error.log

# All logs together
sudo multitail \
  -l "journalctl -u bookmarks -f" \
  /var/log/nginx/bookmarks.fmotion.fr.access.log \
  /var/log/nginx/bookmarks.fmotion.fr.error.log
```

### Check Service Status

```bash
# Service status
sudo systemctl status bookmarks

# Is it running?
ps aux | grep node

# Port usage
sudo netstat -tlnp | grep 3000
```

## Backup and Restore

### Backup

```bash
# Backup icons
sudo tar -czf bookmarks-icons-$(date +%Y%m%d).tar.gz \
  /var/www/bookmarks.fmotion.fr/icons/

# Backup entire application
sudo tar -czf bookmarks-full-$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  /var/www/bookmarks.fmotion.fr/
```

### Restore

```bash
# Restore icons
sudo tar -xzf bookmarks-icons-20240101.tar.gz -C /

# Restore full application
sudo tar -xzf bookmarks-full-20240101.tar.gz -C /
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr
cd /var/www/bookmarks.fmotion.fr && sudo npm install
sudo systemctl restart bookmarks
```

## Security Best Practices

1. **Keep system updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Firewall configuration**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

3. **SSL/TLS**
   - Use strong TLS versions (1.2, 1.3)
   - Keep certificates renewed
   - Use HSTS headers (optional)

4. **File permissions**
   - Application: www-data:www-data, 755
   - Icons: www-data:www-data, 755
   - Config files: root:root, 644

5. **Rate limiting** (optional)
   Add to nginx config:
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

   location /api/ {
       limit_req zone=api burst=20;
       proxy_pass http://localhost:3000;
   }
   ```

## Performance Optimization

### Enable Nginx Caching

```nginx
# Add to server block
proxy_cache_path /var/cache/nginx/bookmarks levels=1:2 keys_zone=bookmarks_cache:10m max_size=100m;

location / {
    proxy_cache bookmarks_cache;
    proxy_cache_valid 200 1h;
    # ... other proxy settings
}
```

### PM2 Alternative (Optional)

Instead of systemd, you can use PM2:

```bash
# Install PM2
sudo npm install -g pm2

# Start app
cd /var/www/bookmarks.fmotion.fr
pm2 start server.js --name bookmarks

# Save configuration
pm2 save

# Setup startup script
pm2 startup systemd
```

## Auto-renewal for SSL

Certbot automatically sets up renewal. Verify:

```bash
# Check timer
sudo systemctl status certbot.timer

# Test renewal
sudo certbot renew --dry-run

# Manual renewal if needed
sudo certbot renew
```

## Additional Configuration

### Custom Error Pages

Create custom error pages in nginx:

```nginx
error_page 404 /404.html;
error_page 500 502 503 504 /50x.html;
```

### Access Restrictions

Limit access by IP (optional):

```nginx
location / {
    allow 192.168.1.0/24;
    deny all;
    proxy_pass http://localhost:3000;
}
```

## Support

For issues:
1. Check logs: `journalctl -u bookmarks -n 100`
2. Verify configuration: `nginx -t`
3. Test connectivity: `curl localhost:3000`
4. Review README.md for troubleshooting
5. Check GitHub issues

## Maintenance Schedule

Recommended maintenance tasks:

- **Daily**: Monitor logs for errors
- **Weekly**: Check disk space, review access logs
- **Monthly**: Update dependencies (`npm update`)
- **Quarterly**: System updates, security audit
- **Annually**: Review and clean old cached icons
