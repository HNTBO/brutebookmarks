let extensionInstalled = false;

export function initExtensionDetection(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'BB_EXT_INSTALLED') {
      extensionInstalled = true;
    }
  });
}

export function isExtensionInstalled(): boolean {
  return extensionInstalled;
}

export interface BookmarkTreeNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

export function requestBrowserBookmarks(): Promise<BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Extension did not respond within 10 seconds.'));
    }, 10_000);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== 'BB_EXT_BOOKMARKS_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (event.data.success) {
        resolve(event.data.bookmarks as BookmarkTreeNode[]);
      } else {
        reject(new Error(event.data.error || 'Failed to read browser bookmarks.'));
      }
    }

    window.addEventListener('message', handler);
    window.postMessage(
      { type: 'BB_EXT_REQUEST_BOOKMARKS', requestId },
      window.location.origin,
    );
  });
}
