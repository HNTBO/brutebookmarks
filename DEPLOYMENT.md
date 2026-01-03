# Deployment Guide for bookmarks.fmotion.fr

This guide will help you deploy your Speed Dial bookmark dashboard to your VPS.

## Prerequisites

- VPS with root/sudo access
- Nginx installed
- Wildcard SSL certificate for *.fmotion.fr (or specific cert for bookmarks.fmotion.fr)
- DNS A record pointing bookmarks.fmotion.fr to your VPS IP

## Deployment Steps

### 1. Upload Files to VPS

```bash
# On your local machine, upload the project files
scp index.html user@your-vps-ip:/tmp/

# Or use git to clone directly on the VPS
ssh user@your-vps-ip
cd /var/www
sudo git clone https://github.com/HNTBO/BookMark_Grid.git bookmarks.fmotion.fr
```

### 2. Set Up Directory Structure

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Create the web directory if using scp method
sudo mkdir -p /var/www/bookmarks.fmotion.fr

# Move the index.html file
sudo mv /tmp/index.html /var/www/bookmarks.fmotion.fr/

# Set proper permissions
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr
sudo chmod -R 755 /var/www/bookmarks.fmotion.fr
```

### 3. Configure Nginx

```bash
# Copy the nginx configuration
sudo cp /var/www/bookmarks.fmotion.fr/nginx.conf /etc/nginx/sites-available/bookmarks.fmotion.fr

# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/bookmarks.fmotion.fr /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 4. SSL Certificate Setup (if not already configured)

If you already have a wildcard certificate for *.fmotion.fr, skip this step.

```bash
# Install certbot if not already installed
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get wildcard certificate (requires DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns -d "*.fmotion.fr" -d "fmotion.fr"

# Follow the prompts to add TXT records to your DNS
```

### 5. Verify Deployment

Visit https://bookmarks.fmotion.fr in your browser. You should see your Speed Dial dashboard.

## File Locations

- **Web files**: `/var/www/bookmarks.fmotion.fr/`
- **Nginx config**: `/etc/nginx/sites-available/bookmarks.fmotion.fr`
- **SSL certificates**: `/etc/letsencrypt/live/fmotion.fr/`
- **Logs**: `/var/log/nginx/bookmarks.fmotion.fr.*.log`

## Updating the Site

### Method 1: Git Pull (Recommended)

```bash
cd /var/www/bookmarks.fmotion.fr
sudo git pull origin claude/style-vps-dashboard-k3tgV
```

### Method 2: Manual Upload

```bash
# On local machine
scp index.html user@your-vps-ip:/tmp/

# On VPS
sudo mv /tmp/index.html /var/www/bookmarks.fmotion.fr/index.html
sudo chown www-data:www-data /var/www/bookmarks.fmotion.fr/index.html
```

## Troubleshooting

### Site not loading
```bash
# Check nginx status
sudo systemctl status nginx

# Check nginx error logs
sudo tail -f /var/log/nginx/bookmarks.fmotion.fr.error.log

# Check nginx access logs
sudo tail -f /var/log/nginx/bookmarks.fmotion.fr.access.log
```

### SSL certificate issues
```bash
# Test SSL certificate
sudo certbot certificates

# Renew certificates
sudo certbot renew --dry-run
```

### Permission issues
```bash
# Fix file permissions
sudo chown -R www-data:www-data /var/www/bookmarks.fmotion.fr
sudo chmod -R 755 /var/www/bookmarks.fmotion.fr
```

## Backup Your Data

Your bookmarks are stored in browser localStorage. To backup:

1. Click "Export Data" button in the dashboard
2. Save the JSON file
3. To restore, click "Import Data" and select the JSON file

## Auto-renewal for SSL (Certbot)

Certbot automatically sets up a systemd timer for certificate renewal:

```bash
# Check renewal timer status
sudo systemctl status certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

## Security Notes

- The nginx configuration includes security headers
- HTTP is automatically redirected to HTTPS
- Gzip compression is enabled for better performance
- Static assets are cached for 1 year

## Support

For issues with:
- **Domain/DNS**: Check your DNS provider settings
- **SSL**: Verify certificate paths in nginx.conf
- **Nginx**: Check logs and configuration syntax
