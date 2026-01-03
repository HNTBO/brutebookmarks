const express = require('express');
const multer = require('multer');
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/icons', express.static('icons'));

// Ensure icons directory exists
const ICONS_DIR = path.join(__dirname, 'icons');
fs.mkdir(ICONS_DIR, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        await fs.mkdir(ICONS_DIR, { recursive: true });
        cb(null, ICONS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg|webp|ico/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Helper function to generate hash for URL
function generateHash(url) {
    return crypto.createHash('md5').update(url).digest('hex');
}

// Helper function to optimize image
async function optimizeImage(inputPath, outputPath) {
    try {
        await sharp(inputPath)
            .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toFile(outputPath);
        return true;
    } catch (error) {
        console.error('Error optimizing image:', error);
        return false;
    }
}

// API: Search for icons on Wikimedia Commons
app.get('/api/search-icons', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        // Search Wikimedia Commons for logo/icon images
        const searchUrl = 'https://commons.wikimedia.org/w/api.php';
        const params = {
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: `${query} logo OR ${query} icon`,
            srnamespace: 6, // File namespace
            srlimit: 10,
            origin: '*'
        };

        const searchResponse = await axios.get(searchUrl, { params });
        const searchResults = searchResponse.data.query.search;

        if (searchResults.length === 0) {
            return res.json({ icons: [] });
        }

        // Get image info for each result
        const titles = searchResults.map(r => r.title).join('|');
        const imageInfoParams = {
            action: 'query',
            format: 'json',
            titles: titles,
            prop: 'imageinfo',
            iiprop: 'url|size|mime',
            iiurlwidth: 128,
            origin: '*'
        };

        const imageInfoResponse = await axios.get(searchUrl, { params: imageInfoParams });
        const pages = imageInfoResponse.data.query.pages;

        const icons = Object.values(pages)
            .filter(page => page.imageinfo && page.imageinfo[0])
            .map(page => ({
                title: page.title.replace('File:', ''),
                url: page.imageinfo[0].url,
                thumbUrl: page.imageinfo[0].thumburl || page.imageinfo[0].url,
                width: page.imageinfo[0].width,
                height: page.imageinfo[0].height
            }))
            .filter(icon => {
                // Filter for reasonable icon sizes and formats
                const validFormats = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
                return icon.width <= 2000 && icon.height <= 2000;
            });

        res.json({ icons });
    } catch (error) {
        console.error('Error searching Wikimedia Commons:', error.message);
        res.status(500).json({ error: 'Failed to search for icons' });
    }
});

// API: Download and cache icon from URL
app.post('/api/download-icon', async (req, res) => {
    const { url, source = 'wikimedia' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Generate a hash-based filename
        const hash = generateHash(url);
        const tempPath = path.join(ICONS_DIR, `temp_${hash}`);
        const finalPath = path.join(ICONS_DIR, `${hash}.png`);

        // Check if already cached
        try {
            await fs.access(finalPath);
            return res.json({
                success: true,
                iconPath: `/icons/${hash}.png`,
                cached: true
            });
        } catch (error) {
            // File doesn't exist, continue with download
        }

        // Download the image
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 10000
        });

        // Save temporary file
        await fs.writeFile(tempPath, response.data);

        // Optimize and resize
        const optimized = await optimizeImage(tempPath, finalPath);

        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {});

        if (optimized) {
            res.json({
                success: true,
                iconPath: `/icons/${hash}.png`,
                cached: false
            });
        } else {
            res.status(500).json({ error: 'Failed to optimize image' });
        }
    } catch (error) {
        console.error('Error downloading icon:', error.message);
        res.status(500).json({ error: 'Failed to download icon' });
    }
});

// API: Upload custom icon
app.post('/api/upload-icon', upload.single('icon'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const originalPath = req.file.path;
        const optimizedFilename = `custom_${req.file.filename.replace(path.extname(req.file.filename), '.png')}`;
        const optimizedPath = path.join(ICONS_DIR, optimizedFilename);

        // Optimize the uploaded image
        const optimized = await optimizeImage(originalPath, optimizedPath);

        if (optimized) {
            // Remove original if optimization succeeded
            await fs.unlink(originalPath).catch(() => {});

            res.json({
                success: true,
                iconPath: `/icons/${optimizedFilename}`
            });
        } else {
            // If optimization failed, use original
            res.json({
                success: true,
                iconPath: `/icons/${req.file.filename}`
            });
        }
    } catch (error) {
        console.error('Error uploading icon:', error.message);
        res.status(500).json({ error: 'Failed to upload icon' });
    }
});

// API: Get favicon from URL
app.post('/api/get-favicon', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const domain = new URL(url).hostname;
        const hash = generateHash(domain);
        const faviconPath = path.join(ICONS_DIR, `favicon_${hash}.png`);

        // Check if already cached
        try {
            await fs.access(faviconPath);
            return res.json({
                success: true,
                iconPath: `/icons/favicon_${hash}.png`,
                cached: true
            });
        } catch (error) {
            // Not cached, fetch it
        }

        // Try Google's favicon service
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

        const response = await axios({
            method: 'GET',
            url: faviconUrl,
            responseType: 'arraybuffer',
            timeout: 5000
        });

        await fs.writeFile(faviconPath, response.data);

        res.json({
            success: true,
            iconPath: `/icons/favicon_${hash}.png`,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching favicon:', error.message);
        res.status(500).json({ error: 'Failed to fetch favicon' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Icons directory: ${ICONS_DIR}`);
});
