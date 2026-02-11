export const DEFAULT_LAYOUT = [
  {
    type: 'group' as const,
    name: 'Streaming',
    order: 1,
    categories: [
      {
        name: 'Video',
        order: 1,
        bookmarks: [
          { title: 'YouTube', url: 'https://youtube.com', order: 1 },
          { title: 'Netflix', url: 'https://netflix.com', order: 2 },
          { title: 'Twitch', url: 'https://twitch.tv', order: 3 },
          { title: 'Disney+', url: 'https://disneyplus.com', order: 4 },
          { title: 'Prime Video', url: 'https://primevideo.com', order: 5 },
        ],
      },
      {
        name: 'Music',
        order: 2,
        bookmarks: [
          { title: 'Spotify', url: 'https://spotify.com', order: 1 },
          { title: 'SoundCloud', url: 'https://soundcloud.com', order: 2 },
          { title: 'YouTube Music', url: 'https://music.youtube.com', order: 3 },
        ],
      },
    ],
  },
  {
    type: 'standalone' as const,
    name: 'Work',
    order: 2,
    categories: [
      {
        name: 'Work',
        order: 2,
        bookmarks: [
          { title: 'Gmail', url: 'https://mail.google.com', order: 1 },
          { title: 'Google Drive', url: 'https://drive.google.com', order: 2 },
          { title: 'Notion', url: 'https://notion.so', order: 3 },
          { title: 'ChatGPT', url: 'https://chatgpt.com', order: 4 },
          { title: 'GitHub', url: 'https://github.com', order: 5 },
          { title: 'Slack', url: 'https://slack.com', order: 6 },
        ],
      },
    ],
  },
  {
    type: 'group' as const,
    name: 'Browse',
    order: 3,
    categories: [
      {
        name: 'Social',
        order: 1,
        bookmarks: [
          { title: 'X / Twitter', url: 'https://x.com', order: 1 },
          { title: 'Reddit', url: 'https://reddit.com', order: 2 },
          { title: 'Instagram', url: 'https://instagram.com', order: 3 },
          { title: 'LinkedIn', url: 'https://linkedin.com', order: 4 },
        ],
      },
      {
        name: 'News',
        order: 2,
        bookmarks: [
          { title: 'Hacker News', url: 'https://news.ycombinator.com', order: 1 },
          { title: 'The Verge', url: 'https://theverge.com', order: 2 },
          { title: 'TechCrunch', url: 'https://techcrunch.com', order: 3 },
          { title: 'BBC News', url: 'https://bbc.com/news', order: 4 },
        ],
      },
    ],
  },
  {
    type: 'standalone' as const,
    name: 'Shopping',
    order: 4,
    categories: [
      {
        name: 'Shopping',
        order: 4,
        bookmarks: [
          { title: 'Amazon', url: 'https://amazon.com', order: 1 },
          { title: 'eBay', url: 'https://ebay.com', order: 2 },
          { title: 'AliExpress', url: 'https://aliexpress.com', order: 3 },
          { title: 'Etsy', url: 'https://etsy.com', order: 4 },
        ],
      },
    ],
  },
];
