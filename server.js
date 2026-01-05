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

// Ensure data directory exists for persistent storage
const DATA_DIR = path.join(__dirname, 'data');
const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');
fs.mkdir(DATA_DIR, { recursive: true }).catch(console.error);

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

        const searchResponse = await axios.get(searchUrl, {
            params,
            headers: { 'User-Agent': 'BruteBookmarks/1.0 (https://github.com)' }
        });
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

        const imageInfoResponse = await axios.get(searchUrl, {
            params: imageInfoParams,
            headers: { 'User-Agent': 'BruteBookmarks/1.0 (https://github.com)' }
        });
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
            timeout: 10000,
            headers: { 'User-Agent': 'BruteBookmarks/1.0 (https://github.com)' }
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

        // Use DuckDuckGo's favicon service (more reliable)
        const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

        const response = await axios({
            method: 'GET',
            url: faviconUrl,
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'BruteBookmarks/1.0' }
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

// API: Search for emojis (using Twemoji - Twitter's emoji library)
// Twemoji provides high-quality, consistent emoji images
const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg';

// Comprehensive emoji mappings for search
const EMOJI_KEYWORDS = {
    // Faces & Expressions
    'smile': '1f604', 'happy': '1f604', 'grin': '1f600', 'joy': '1f602', 'laugh': '1f923',
    'wink': '1f609', 'cool': '1f60e', 'love': '1f60d', 'kiss': '1f618', 'blush': '1f60a',
    'think': '1f914', 'thinking': '1f914', 'sad': '1f622', 'cry': '1f62d', 'angry': '1f620',
    'shock': '1f632', 'surprise': '1f62e', 'fear': '1f628', 'sleep': '1f634', 'sick': '1f912',
    'nerd': '1f913', 'devil': '1f608', 'angel': '1f607', 'clown': '1f921', 'ghost': '1f47b',
    'skull': '1f480', 'alien': '1f47d', 'robot': '1f916', 'poop': '1f4a9', 'monkey': '1f648',
    
    // Gestures & Body
    'thumbs': '1f44d', 'like': '1f44d', 'good': '1f44d', 'thumbsdown': '1f44e', 'bad': '1f44e',
    'clap': '1f44f', 'wave': '1f44b', 'ok': '1f44c', 'peace': '270c', 'fist': '1f44a',
    'punch': '1f44a', 'point': '1f449', 'muscle': '1f4aa', 'strong': '1f4aa', 'pray': '1f64f',
    'hand': '270b', 'stop': '270b', 'eyes': '1f440', 'look': '1f440', 'brain': '1f9e0',
    
    // Hearts & Love
    'heart': '2764', 'red': '2764', 'orange': '1f9e1', 'yellow': '1f49b', 'green': '1f49a',
    'blue': '1f499', 'purple': '1f49c', 'black': '1f5a4', 'white': '1f90d', 'broken': '1f494',
    'spark': '1f496', 'grow': '1f497', 'cupid': '1f498', 'gift': '1f49d', 'ribbon': '1f49d',
    
    // Nature & Animals
    'sun': '2600', 'moon': '1f319', 'star': '2b50', 'stars': '2728', 'sparkles': '2728',
    'cloud': '2601', 'rain': '1f327', 'snow': '2744', 'thunder': '26a1', 'lightning': '26a1',
    'fire': '1f525', 'hot': '1f525', 'flame': '1f525', 'rainbow': '1f308', 'water': '1f4a7',
    'tree': '1f333', 'flower': '1f33a', 'rose': '1f339', 'plant': '1f331', 'leaf': '1f343',
    'dog': '1f436', 'cat': '1f431', 'bear': '1f43b', 'panda': '1f43c', 'fox': '1f98a',
    'lion': '1f981', 'tiger': '1f42f', 'horse': '1f434', 'unicorn': '1f984', 'cow': '1f42e',
    'pig': '1f437', 'bird': '1f426', 'eagle': '1f985', 'owl': '1f989', 'butterfly': '1f98b',
    'fish': '1f41f', 'shark': '1f988', 'whale': '1f433', 'dolphin': '1f42c', 'octopus': '1f419',
    'snake': '1f40d', 'dragon': '1f409', 'dinosaur': '1f996', 'bug': '1f41b', 'bee': '1f41d',
    
    // Food & Drink
    'food': '1f354', 'burger': '1f354', 'pizza': '1f355', 'hotdog': '1f32d', 'taco': '1f32e',
    'sushi': '1f363', 'rice': '1f35a', 'noodles': '1f35c', 'ramen': '1f35c', 'bread': '1f35e',
    'cake': '1f382', 'cookie': '1f36a', 'donut': '1f369', 'ice': '1f368', 'candy': '1f36c',
    'chocolate': '1f36b', 'popcorn': '1f37f', 'egg': '1f373', 'salad': '1f957', 'fruit': '1f34e',
    'apple': '1f34e', 'banana': '1f34c', 'orange': '1f34a', 'lemon': '1f34b', 'grape': '1f347',
    'strawberry': '1f353', 'watermelon': '1f349', 'peach': '1f351', 'avocado': '1f951',
    'coffee': '2615', 'tea': '2615', 'beer': '1f37a', 'wine': '1f377', 'cocktail': '1f378',
    'drink': '1f379', 'juice': '1f9c3', 'milk': '1f95b', 'water': '1f4a7', 'bottle': '1f37e',
    
    // Activities & Sports
    'game': '1f3ae', 'gaming': '1f3ae', 'controller': '1f3ae', 'dice': '1f3b2', 'puzzle': '1f9e9',
    'ball': '26bd', 'soccer': '26bd', 'football': '1f3c8', 'basketball': '1f3c0', 'baseball': '26be',
    'tennis': '1f3be', 'golf': '26f3', 'hockey': '1f3d2', 'ski': '26f7', 'snowboard': '1f3c2',
    'swim': '1f3ca', 'surf': '1f3c4', 'bike': '1f6b4', 'run': '1f3c3', 'gym': '1f3cb',
    'trophy': '1f3c6', 'medal': '1f3c5', 'win': '1f3c6', 'award': '1f3c6', 'prize': '1f3c6',
    'target': '1f3af', 'goal': '1f3af', 'dart': '1f3af', 'bowling': '1f3b3', 'boxing': '1f94a',
    
    // Music & Art
    'music': '1f3b5', 'song': '1f3b5', 'note': '1f3b5', 'notes': '1f3b6', 'guitar': '1f3b8',
    'piano': '1f3b9', 'drum': '1f941', 'microphone': '1f3a4', 'headphones': '1f3a7', 'radio': '1f4fb',
    'art': '1f3a8', 'paint': '1f3a8', 'palette': '1f3a8', 'brush': '1f58c', 'pen': '1f58a',
    'pencil': '270f', 'crayon': '1f58d', 'camera': '1f4f7', 'photo': '1f4f7', 'video': '1f3ac',
    'movie': '1f3ac', 'film': '1f3ac', 'clapperboard': '1f3ac', 'theater': '1f3ad', 'mask': '1f3ad',
    
    // Technology
    'computer': '1f4bb', 'laptop': '1f4bb', 'desktop': '1f5a5', 'keyboard': '2328', 'mouse': '1f5b1',
    'phone': '1f4f1', 'mobile': '1f4f1', 'tablet': '1f4f1', 'watch': '231a', 'tv': '1f4fa',
    'speaker': '1f50a', 'battery': '1f50b', 'plug': '1f50c', 'disk': '1f4bf', 'usb': '1f4be',
    'printer': '1f5a8', 'satellite': '1f4e1', 'antenna': '1f4e1', 'code': '1f4bb', 'dev': '1f4bb',
    
    // Work & Office
    'work': '1f4bc', 'briefcase': '1f4bc', 'office': '1f4bc', 'job': '1f4bc', 'business': '1f4bc',
    'calendar': '1f4c5', 'date': '1f4c5', 'schedule': '1f4c5', 'clock': '1f551', 'time': '23f0',
    'alarm': '23f0', 'folder': '1f4c1', 'file': '1f4c4', 'document': '1f4c4', 'page': '1f4c3',
    'clipboard': '1f4cb', 'pin': '1f4cc', 'pushpin': '1f4cd', 'paperclip': '1f4ce', 'ruler': '1f4cf',
    'chart': '1f4ca', 'graph': '1f4ca', 'stats': '1f4ca', 'analytics': '1f4ca', 'trend': '1f4c8',
    'mail': '1f4e7', 'email': '1f4e7', 'envelope': '2709', 'inbox': '1f4e5', 'outbox': '1f4e4',
    'book': '1f4d6', 'read': '1f4d6', 'notebook': '1f4d3', 'bookmark': '1f516', 'label': '1f3f7',
    
    // Home & Buildings
    'home': '1f3e0', 'house': '1f3e0', 'building': '1f3e2', 'office': '1f3e2', 'hotel': '1f3e8',
    'hospital': '1f3e5', 'bank': '1f3e6', 'store': '1f3ea', 'shop': '1f6d2', 'school': '1f3eb',
    'church': '26ea', 'castle': '1f3f0', 'factory': '1f3ed', 'tent': '26fa', 'stadium': '1f3df',
    
    // Transport
    'car': '1f697', 'auto': '1f697', 'drive': '1f697', 'taxi': '1f695', 'bus': '1f68c',
    'truck': '1f69a', 'ambulance': '1f691', 'fire': '1f692', 'police': '1f693', 'bike': '1f6b2',
    'motorcycle': '1f3cd', 'train': '1f683', 'metro': '1f687', 'tram': '1f68a', 'ship': '1f6a2',
    'boat': '26f5', 'plane': '2708', 'flight': '2708', 'helicopter': '1f681', 'rocket': '1f680',
    'ufo': '1f6f8', 'satellite': '1f6f0', 'anchor': '2693', 'fuel': '26fd', 'traffic': '1f6a6',
    
    // Symbols & Objects
    'money': '1f4b0', 'cash': '1f4b0', 'dollar': '1f4b5', 'euro': '1f4b6', 'coin': '1fa99',
    'gem': '1f48e', 'diamond': '1f48e', 'ring': '1f48d', 'crown': '1f451', 'magic': '1fa84',
    'key': '1f511', 'lock': '1f512', 'unlock': '1f513', 'bell': '1f514', 'notification': '1f514',
    'search': '1f50d', 'find': '1f50d', 'magnify': '1f50e', 'link': '1f517', 'chain': '26d3',
    'tool': '1f527', 'wrench': '1f527', 'hammer': '1f528', 'axe': '1fa93', 'pick': '26cf',
    'gear': '2699', 'settings': '2699', 'config': '2699', 'shield': '1f6e1', 'sword': '1f5e1',
    'bomb': '1f4a3', 'gun': '1f52b', 'pill': '1f48a', 'syringe': '1f489', 'dna': '1f9ec',
    'microscope': '1f52c', 'telescope': '1f52d', 'crystal': '1f52e', 'candle': '1f56f',
    'bulb': '1f4a1', 'light': '1f4a1', 'idea': '1f4a1', 'lamp': '1f4a1', 'flashlight': '1f526',
    
    // Flags & Signs
    'flag': '1f3f3', 'checkered': '1f3c1', 'triangular': '1f6a9', 'crossed': '1f38c',
    'check': '2705', 'done': '2705', 'yes': '2705', 'correct': '2705', 'tick': '2714',
    'cross': '274c', 'no': '274c', 'wrong': '274c', 'x': '274c', 'cancel': '274c',
    'warning': '26a0', 'caution': '26a0', 'alert': '26a0', 'danger': '2620', 'hazard': '2622',
    'info': '2139', 'question': '2753', 'exclamation': '2757', 'important': '2757',
    'plus': '2795', 'add': '2795', 'minus': '2796', 'multiply': '2716', 'divide': '2797',
    'infinity': '267e', 'recycle': '267b', 'peace': '262e', 'yin': '262f', 'om': '1f549',
    
    // Celebration
    'party': '1f389', 'celebrate': '1f389', 'confetti': '1f38a', 'balloon': '1f388',
    'gift': '1f381', 'present': '1f381', 'wrapped': '1f381', 'birthday': '1f382',
    'christmas': '1f384', 'tree': '1f384', 'santa': '1f385', 'fireworks': '1f386',
    'sparkler': '1f387', 'ribbon': '1f380', 'medal': '1f3c5', 'first': '1f947'
};

app.get('/api/search-emojis', (req, res) => {
    const { query } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const searchTerm = query.toLowerCase().trim();
    const results = [];
    
    // Search through emoji keywords
    for (const [keyword, code] of Object.entries(EMOJI_KEYWORDS)) {
        if (keyword.includes(searchTerm) || searchTerm.includes(keyword)) {
            const url = `${TWEMOJI_CDN}/${code}.svg`;
            // Avoid duplicates
            if (!results.find(r => r.code === code)) {
                results.push({
                    code,
                    keyword,
                    url,
                    thumbUrl: url
                });
            }
        }
    }
    
    res.json({ emojis: results.slice(0, 20) });
});

app.post('/api/download-emoji', async (req, res) => {
    const { code } = req.body;
    
    if (!code) {
        return res.status(400).json({ error: 'Emoji code is required' });
    }
    
    try {
        const emojiPath = path.join(ICONS_DIR, `emoji_${code}.png`);
        
        // Check if already cached
        try {
            await fs.access(emojiPath);
            return res.json({
                success: true,
                iconPath: `/icons/emoji_${code}.png`,
                cached: true
            });
        } catch (error) {
            // Not cached, download it
        }
        
        // Download SVG from Twemoji
        const svgUrl = `${TWEMOJI_CDN}/${code}.svg`;
        const response = await axios({
            method: 'GET',
            url: svgUrl,
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'BruteBookmarks/1.0' }
        });
        
        // Convert SVG to PNG using sharp
        await sharp(Buffer.from(response.data))
            .resize(128, 128)
            .png()
            .toFile(emojiPath);
        
        res.json({
            success: true,
            iconPath: `/icons/emoji_${code}.png`,
            cached: false
        });
    } catch (error) {
        console.error('Error downloading emoji:', error.message);
        res.status(500).json({ error: 'Failed to download emoji' });
    }
});

// Default categories for new users
const DEFAULT_CATEGORIES = [
    {
        id: 'productivity',
        name: 'Productivity',
        bookmarks: [
            { id: 'b1', title: 'Clockify', url: 'https://app.clockify.me', iconPath: null },
            { id: 'b2', title: 'Todoist', url: 'https://todoist.com', iconPath: null },
            { id: 'b3', title: 'Notion', url: 'https://www.notion.so', iconPath: null }
        ]
    },
    {
        id: 'google',
        name: 'Google Services',
        bookmarks: [
            { id: 'g1', title: 'Gmail', url: 'https://mail.google.com', iconPath: null },
            { id: 'g2', title: 'Google Drive', url: 'https://drive.google.com', iconPath: null },
            { id: 'g3', title: 'Google Calendar', url: 'https://calendar.google.com', iconPath: null }
        ]
    }
];

// API: Get bookmark data
app.get('/api/data', async (req, res) => {
    try {
        const data = await fs.readFile(BOOKMARKS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return default categories
            res.json(DEFAULT_CATEGORIES);
        } else {
            console.error('Error reading bookmark data:', error.message);
            res.status(500).json({ error: 'Failed to load data' });
        }
    }
});

// API: Save bookmark data
app.post('/api/data', async (req, res) => {
    try {
        const data = req.body;
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Data must be an array of categories' });
        }
        await fs.writeFile(BOOKMARKS_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving bookmark data:', error.message);
        res.status(500).json({ error: 'Failed to save data' });
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
