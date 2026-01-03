# Bookmarks Speed Dial Dashboard

A beautiful, self-hosted bookmark manager inspired by Speed Dial 2, featuring automatic high-quality icon fetching from Wikimedia Commons, custom icon uploads, and category organization.

## Features

### Core Features
- **Category Organization** - Organize bookmarks into custom categories
- **Custom Naming** - Give bookmarks any name you want
- **Plus Icon Cards** - Easy bookmark addition with prominent plus cards in each category
- **Beautiful UI** - Modern gradient design with smooth animations

### Icon Management
- **Automatic Icon Fetching** - Search and download high-quality logos from Wikimedia Commons
- **Server-Side Caching** - Icons are downloaded once and cached on your server
- **Custom Upload** - Upload your own custom icons (with drag-and-drop support)
- **Favicon Fallback** - Automatically fetch and cache favicons for quick setup

### Data Management
- **Local Storage** - All bookmark data stored in browser localStorage
- **Export/Import** - Backup and restore your bookmarks as JSON
- **Delete Controls** - Easy deletion of individual bookmarks or entire categories

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js + Express
- **Image Processing**: Sharp (for icon optimization)
- **Icon Source**: Wikimedia Commons API
- **Storage**: Browser localStorage for data, filesystem for icons

## Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Run the automated deployment script
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/HNTBO/BookMark_Grid/claude/style-vps-dashboard-k3tgV/deploy.sh)"
```

### Option 2: Manual Installation

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed manual installation instructions.

## Icon Search Procedure

When adding a bookmark, you have three options for icons:

### 1. Use Favicon (Quick & Easy)
- Click "Use Favicon" button
- Automatically fetches the site's favicon
- Cached on server for fast loading

### 2. Search Wikimedia Commons (High Quality)
- Click "Search Wikimedia" button
- Enter search term (e.g., "Google", "Facebook", "GitHub")
- Browse high-quality logo results
- Click to select and automatically download to server
- Icons are optimized and cached

### 3. Upload Custom Icon
- Click "Upload Custom" or drag-and-drop image
- Supports: PNG, JPG, GIF, SVG, WebP, ICO
- Automatically optimized to 128x128px
- Stored on server

## How It Works

### Icon Workflow
1. **User searches** for icon on Wikimedia Commons
2. **Backend queries** Wikimedia Commons API
3. **Results displayed** in modal with thumbnails
4. **User selects** desired icon
5. **Backend downloads** full resolution image
6. **Sharp optimizes** to 128x128px PNG
7. **Server caches** in `/icons` directory
8. **Path stored** in bookmark data

### Benefits
- High-quality, professional logos
- No external dependencies after download
- Fast loading (local files)
- Consistent sizing and format
- Reduced bandwidth usage

## API Endpoints

### GET /api/search-icons
Search for icons on Wikimedia Commons
- Query param: `query` (search term)
- Returns: Array of icon objects with URLs

### POST /api/download-icon
Download and cache an icon from URL
- Body: `{ url, source }`
- Returns: `{ success, iconPath, cached }`

### POST /api/upload-icon
Upload a custom icon file
- Body: FormData with `icon` file
- Returns: `{ success, iconPath }`

### POST /api/get-favicon
Fetch and cache favicon for a URL
- Body: `{ url }`
- Returns: `{ success, iconPath, cached }`

## File Structure

```
BookMark_Grid/
├── public/
│   └── index.html          # Frontend application
├── icons/                  # Cached icons (auto-created)
├── server.js              # Express backend server
├── package.json           # Node.js dependencies
├── nginx.conf             # Nginx configuration
├── bookmarks.service      # Systemd service file
├── deploy.sh              # Automated deployment script
├── DEPLOYMENT.md          # Detailed deployment guide
└── README.md              # This file
```

## Configuration

### Changing Port
Edit `server.js` or set environment variable:
```bash
export PORT=3001
```

### Custom Domain
1. Update `nginx.conf` with your domain
2. Update SSL certificate paths
3. Reload nginx: `sudo systemctl reload nginx`

## Maintenance

### View Logs
```bash
# Application logs
journalctl -u bookmarks -f

# Nginx access logs
tail -f /var/log/nginx/bookmarks.fmotion.fr.access.log

# Nginx error logs
tail -f /var/log/nginx/bookmarks.fmotion.fr.error.log
```

### Update Application
```bash
cd /var/www/bookmarks.fmotion.fr
git pull
npm install
sudo systemctl restart bookmarks
```

### Backup Icons
```bash
# Backup icons directory
tar -czf icons-backup-$(date +%Y%m%d).tar.gz /var/www/bookmarks.fmotion.fr/icons
```

### Clear Icon Cache
```bash
# Remove all cached icons
sudo rm -rf /var/www/bookmarks.fmotion.fr/icons/*
```

## Troubleshooting

### Icons not loading
- Check icons directory permissions: `ls -la /var/www/bookmarks.fmotion.fr/icons`
- Verify service is running: `systemctl status bookmarks`
- Check logs: `journalctl -u bookmarks -n 50`

### Wikimedia search failing
- Verify internet connectivity from server
- Check API response in logs
- Try different search terms

### Upload failing
- Check nginx `client_max_body_size` setting
- Verify icons directory is writable
- Check disk space: `df -h`

## Security Notes

- All icons are processed and optimized server-side
- File uploads are restricted to image types only
- Maximum file size: 5MB (configurable in server.js)
- Icons stored outside public directory by default
- HTTPS enforced via nginx

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT

## Credits

- Icon source: [Wikimedia Commons](https://commons.wikimedia.org)
- Favicon service: Google Favicon API
- Inspired by: Speed Dial 2 Chrome Extension

## Support

For issues or questions:
1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for setup help
2. Review logs for error messages
3. Verify all dependencies are installed
4. Check file permissions

## Future Enhancements

- [ ] Multi-user support with authentication
- [ ] Drag-and-drop bookmark reordering
- [ ] Bookmark tags and search
- [ ] Dark/light theme toggle
- [ ] Browser extension for quick bookmark addition
- [ ] Icon preview before download
- [ ] Bulk icon update functionality
