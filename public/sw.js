// Service Worker for M3U8/HLS caching
const CACHE_NAME = 'hls-cache-v1';
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB 最大缓存
const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2小时过期（防止播放地址失效）

// 需要缓存的文件类型
const CACHEABLE_EXTENSIONS = ['.m3u8', '.ts', '.mp4', '.webm'];

// 检查URL是否应该被缓存
function shouldCache(url) {
  return CACHEABLE_EXTENSIONS.some(ext => url.includes(ext));
}

// 添加时间戳到缓存响应
async function cacheWithTimestamp(cache, request, response) {
  const clonedResponse = response.clone();
  const blob = await clonedResponse.blob();

  const responseToCache = new Response(blob, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });

  // 添加缓存时间戳
  responseToCache.headers.set('sw-cache-time', Date.now().toString());

  await cache.put(request, responseToCache);
}

// 检查缓存是否过期
function isCacheExpired(response) {
  const cacheTime = response.headers.get('sw-cache-time');
  if (!cacheTime) return true;

  const age = Date.now() - parseInt(cacheTime);
  return age > CACHE_EXPIRY;
}

// 管理缓存大小
async function manageCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();

  let totalSize = 0;
  const items = [];

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      const size = blob.size;
      const cacheTime = response.headers.get('sw-cache-time') || '0';

      items.push({
        request,
        size,
        time: parseInt(cacheTime)
      });

      totalSize += size;
    }
  }

  // 如果超过限制，删除最旧的条目
  if (totalSize > MAX_CACHE_SIZE) {
    items.sort((a, b) => a.time - b.time);

    for (const item of items) {
      if (totalSize <= MAX_CACHE_SIZE * 0.8) break; // 清理到80%

      await cache.delete(item.request);
      totalSize -= item.size;
      console.log('[SW] Deleted old cache:', item.request.url);
    }
  }
}

// 安装事件
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 只缓存视频相关资源
  if (!shouldCache(url)) {
    return event.respondWith(fetch(request));
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 尝试从缓存获取
      const cachedResponse = await cache.match(request);

      // 如果有缓存且未过期，直接返回
      if (cachedResponse && !isCacheExpired(cachedResponse)) {
        console.log('[SW] Cache hit:', url);

        // 后台更新 m3u8 文件（保持播放列表最新）
        if (url.includes('.m3u8')) {
          fetch(request).then(async (response) => {
            if (response.ok) {
              await cacheWithTimestamp(cache, request, response);
              console.log('[SW] Background updated m3u8:', url);
            }
          }).catch(() => {});
        }

        return cachedResponse;
      }

      // 从网络获取
      try {
        console.log('[SW] Fetching from network:', url);
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
          // 缓存成功的响应
          await cacheWithTimestamp(cache, request, networkResponse.clone());
          console.log('[SW] Cached:', url);

          // 异步管理缓存大小
          manageCacheSize().catch(console.error);
        }

        return networkResponse;
      } catch (error) {
        console.error('[SW] Fetch failed:', url, error);

        // 如果网络失败但有过期缓存，返回过期缓存
        if (cachedResponse) {
          console.log('[SW] Returning expired cache:', url);
          return cachedResponse;
        }

        throw error;
      }
    })
  );
});

// 监听消息（用于清除缓存等操作）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('[SW] Cache cleared');
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
    );
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys();
        let totalSize = 0;

        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }

        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            size: totalSize,
            count: keys.length
          });
        }
      })
    );
  }
});