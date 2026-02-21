import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import './M3U8Player.css';

interface M3U8PlayerProps {
  url: string;
  poster?: string;
  title?: string;
  type?: string; // 视频类型: hls, dash, flv, mp4, webm, ogg, mov, etc
  autoplay?: boolean;
  enableIframeFullscreen?: boolean; // 在iframe中启用全屏通信
}

// 存储播放进度的key
const STORAGE_KEY_PREFIX = 'artplayer_progress_';
// 存储上一个播放视频URL的key
const LAST_VIDEO_URL_KEY = 'artplayer_last_video_url';

// 获取保存的播放时间
function getSavedTime(url: string): number {
  try {
    const key = STORAGE_KEY_PREFIX + btoa(url); // 使用Base64编码URL作为key
    const saved = localStorage.getItem(key);
    return saved ? parseFloat(saved) : 0;
  } catch {
    return 0;
  }
}

// 获取上一个播放的视频URL
function getLastVideoUrl(): string | null {
  try {
    return localStorage.getItem(LAST_VIDEO_URL_KEY);
  } catch {
    return null;
  }
}

// 保存当前视频URL
function saveCurrentVideoUrl(url: string): void {
  try {
    localStorage.setItem(LAST_VIDEO_URL_KEY, url);
  } catch (e) {
    console.warn('Failed to save current video URL:', e);
  }
}

// 保存播放时间
function savePlayTime(url: string, time: number): void {
  try {
    const key = STORAGE_KEY_PREFIX + btoa(url);
    localStorage.setItem(key, time.toString());
  } catch (e) {
    console.warn('Failed to save play time:', e);
  }
}

// 自动检测视频类型
function detectVideoType(url: string, manualType?: string): string {
  if (manualType) {
    return manualType;
  }

  // 提取URL中的文件扩展名（忽略查询参数）
  const urlWithoutQuery = url.split('?')[0];
  const extension = urlWithoutQuery.split('.').pop()?.toLowerCase() || '';

  // 映射扩展名到artplayer支持的类型
  const typeMap: Record<string, string> = {
    'm3u8': 'hls',
    'mpd': 'dash',
    'flv': 'flv',
    'mp4': 'mp4',
    'webm': 'webm',
    'ogg': 'ogg',
    'ogv': 'ogg',
    'mov': 'mov',
    'mkv': 'mkv',
    'avi': 'avi',
    'wmv': 'wmv',
    'ts': 'ts',
    'm4v': 'mp4'
  };

  return typeMap[extension] || 'hls'; // 默认为HLS
}

// 检测是否在 iframe 中运行
function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // 跨域iframe会抛出异常
  }
}

// 清理上一个视频的缓存
async function clearPreviousVideoCache(previousUrl: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    // console.log('[Player] Service Worker not available, skipping cache clear');
    return;
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      if (event.data.success) {
        // console.log(`[Player] Successfully cleared previous video cache: ${event.data.deletedCount} items, ${(event.data.deletedSize / 1024 / 1024).toFixed(2)}MB`);
      } else {
        console.warn('[Player] Failed to clear previous video cache:', event.data.error);
      }
      resolve();
    };

    navigator.serviceWorker.controller!.postMessage(
      {
        type: 'CLEAR_PREVIOUS_VIDEO',
        url: previousUrl
      },
      [messageChannel.port2]
    );

    // 超时保护
    setTimeout(resolve, 5000);
  });
}

export default function M3U8Player({ url, poster, title, type, autoplay = true, enableIframeFullscreen = true }: M3U8PlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const artPlayerRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const previousUrlRef = useRef<string | null>(null);
  const isInIframeEnv = useRef<boolean>(isInIframe());

  // 添加调试日志
  // // console.log('[Player] 初始化参数:', {
  //   isInIframe: isInIframeEnv.current,
  //   enableIframeFullscreen,
  //   url
  // });

  useEffect(() => {
    if (!artRef.current || !url) return;

    // 获取上一个播放的视频URL（从 localStorage 或 ref）
    const lastVideoUrl = previousUrlRef.current || getLastVideoUrl();

    // 检测 URL 变化，清理上一个视频的缓存
    if (lastVideoUrl && lastVideoUrl !== url) {
      // console.log('[Player] URL changed, clearing previous video cache...');
      clearPreviousVideoCache(lastVideoUrl).catch(console.error);
    }

    // 保存当前 URL 到 localStorage 和 ref
    previousUrlRef.current = url;
    saveCurrentVideoUrl(url);

    // 销毁旧的player实例
    if (artPlayerRef.current) {
      artPlayerRef.current.destroy();
    }

    // 自动检测视频类型
    const videoType = detectVideoType(url, type);

    // 构建配置对象，只包含定义了的值
    const config: any = {
      container: artRef.current,
      url,
      type: videoType,
      autoplay,
      fullscreen: true,
      fullscreenWeb: true,
      hotkey: true,
      pip: true,
      mutex: true,
      autoSize: false, // 禁用autoSize，改用objectFit控制
      autoMini: true,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      flip: true,
      rotate: true,
      theme: '#00a1d6',
      style: {
        width: '100%',
        height: '100%'
      },
      cssVar: {
        '--art-bottom-height': '44px',      // 控制栏高度（默认 38px）
        '--art-control-height': '44px',     // 单个按钮高度
        '--art-bottom-gap': '5px',          // 按钮左右间距（默认 5px）
        '--art-control-icon-size': '26px',  // 图标尺寸（默认 22px）
        '--art-progress-height': '4px',     // 进度条高度常驻 4px
      },
      icons: {
        // 替换缓冲/加载图标为自定义 SVG 动画
        loading: `<svg class="art-custom-loading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50" height="50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="#00a1d6" stroke-width="4" stroke-linecap="round"
            stroke-dasharray="80 40" transform="rotate(-90 25 25)"/>
        </svg>`,

        // 中央播放/暂停状态图标
        state: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
          <circle cx="40" cy="40" r="38" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>
          <polygon points="32,22 60,40 32,58" fill="white"/>
        </svg>`,

        // 播放按钮
        play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>`,

        // 暂停按钮
        pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>`,

        // 音量按钮
        volume: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>`,

        // 静音按钮
        volumeClose: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>`,

        // 设置按钮
        setting: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>`,

        // 截图按钮
        screenshot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3z"/>
        </svg>`,

        // 画中画按钮
        pip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/>
        </svg>`,

        // 网页全屏
        fullscreenWeb: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 5h-5v2h7v-7h-2v5z"/>
        </svg>`,

        // 网页全屏退出
        fullscreenWebOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M8 3v3H5V3H3v5h7V3H8zm8 0h-2v5h7V3h-2v3h-3V3zM8 19H5v-3H3v5h7v-5H8v3zm8 0v-3h2v3h-2v2h5v-5h-7v5h2z"/>
        </svg>`,

        // 全屏
        fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
        </svg>`,

        // 全屏退出
        fullscreenOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="white">
          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
        </svg>`,
      }
    };

    // 只在poster存在时才添加
    if (poster) {
      config.poster = poster;
    }

    // 只在title存在时才添加
    if (title) {
      config.title = title;
    }

    // 为 HLS 添加自定义类型处理（使用 hls.js 增强）
    if (videoType === 'hls' || videoType === 'm3u8') {
      config.customType = {
        m3u8: (video: HTMLVideoElement, url: string) => {
          if (Hls.isSupported()) {
            // 销毁旧的 HLS 实例
            if (hlsRef.current) {
              hlsRef.current.destroy();
            }

            // 创建 HLS 实例，配置预加载策略（混合优化方案）
            const hls = new Hls({
              // 缓冲配置 - 平衡流畅度与资源消耗
              maxBufferLength: 60,           // 预缓冲60秒（保持1分钟预加载）
              maxMaxBufferLength: 120,       // 最大缓冲上限120秒（保持2分钟上限）
              maxBufferSize: 50 * 1000 * 1000, // 最大缓冲50MB（降低内存占用）
              maxBufferHole: 0.5,            // 缓冲区间隙容忍度
              backBufferLength: 10,          // 只保留10秒已播放内容（节省内存）

              // 加载优化
              enableWorker: true,            // 使用 Web Worker 处理，不阻塞主线程
              lowLatencyMode: false,         // 非直播模式，优先缓冲

              // 分片加载策略
              maxLoadingDelay: 4,            // 最大加载延迟
              maxFragLookUpTolerance: 0.25,  // 分片查找容忍度

              // 网络优化
              manifestLoadingTimeOut: 10000, // manifest 加载超时
              manifestLoadingMaxRetry: 3,    // manifest 加载最大重试次数
              levelLoadingTimeOut: 10000,    // 级别加载超时
              levelLoadingMaxRetry: 4,       // 级别加载最大重试次数
              fragLoadingTimeOut: 20000,     // 分片加载超时
              fragLoadingMaxRetry: 6,        // 分片加载最大重试次数

              // 启用更激进的预加载
              startFragPrefetch: true,       // 启动时预加载
              testBandwidth: true,           // 测试带宽以优化质量选择
            });

            hlsRef.current = hls;

            // 加载源
            hls.loadSource(url);
            hls.attachMedia(video);

            // HLS 事件监听
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              // console.log('[HLS] Manifest parsed, levels:', hls.levels.length);
            });

            hls.on(Hls.Events.FRAG_LOADED, (_event, _data) => {
              // console.log('[HLS] Fragment loaded:', data.frag.sn, 'duration:', data.frag.duration);
            });

            hls.on(Hls.Events.ERROR, (_event, data) => {
              console.error('[HLS] Error:', data.type, data.details);

              // 致命错误处理
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    // console.log('[HLS] Network error, trying to recover...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    // console.log('[HLS] Media error, trying to recover...');
                    hls.recoverMediaError();
                    break;
                  default:
                    // console.log('[HLS] Fatal error, cannot recover');
                    hls.destroy();
                    break;
                }
              }
            });

            // 缓冲状态监控
            hls.on(Hls.Events.BUFFER_APPENDING, () => {
              const bufferInfo = hls.media ? {
                currentTime: hls.media.currentTime,
                buffered: hls.media.buffered.length > 0
                  ? hls.media.buffered.end(hls.media.buffered.length - 1) - hls.media.currentTime
                  : 0
              } : null;

              if (bufferInfo && bufferInfo.buffered > 0) {
                // console.log(`[HLS] Buffer: ${bufferInfo.buffered.toFixed(1)}s ahead`);
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // iOS Safari 原生支持
            video.src = url;
            // console.log('[HLS] Using native HLS support');
          }
        }
      };
    }

    const art = new Artplayer(config);

    artPlayerRef.current = art;

    // 如果在iframe中且启用了iframe全屏通信
    if (isInIframeEnv.current && enableIframeFullscreen) {
      // 监听网页全屏事件
      art.on('fullscreenWeb', (isFullscreenWeb) => {
        try {
          // 通知父页面进行全屏切换
          window.parent.postMessage({
            type: 'PLAYER_FULLSCREEN_WEB',
            fullscreen: isFullscreenWeb,
            source: 'artplayer'
          }, '*');
          // console.log(`[Player] Sent fullscreenWeb message to parent: ${isFullscreenWeb}`);
        } catch (e) {
          console.warn('[Player] Failed to communicate with parent window:', e);
        }
      });

      // 监听真全屏事件
      art.on('fullscreen', (isFullscreen) => {
        try {
          window.parent.postMessage({
            type: 'PLAYER_FULLSCREEN',
            fullscreen: isFullscreen,
            source: 'artplayer'
          }, '*');
          // console.log(`[Player] Sent fullscreen message to parent: ${isFullscreen}`);
        } catch (e) {
          console.warn('[Player] Failed to communicate with parent window:', e);
        }
      });
    }

    // 播放器加载完成后，恢复上次保存的播放时间
    art.on('ready', () => {
      const savedTime = getSavedTime(url);
      if (savedTime > 0) {
        art.currentTime = savedTime;
        // console.log(`Restored playback time: ${savedTime}s`);
      }
    });

    // 监听时间更新，定期保存播放进度（每秒最多保存一次）
    art.on('timeupdate', () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        savePlayTime(url, art.currentTime);
      }, 1000); // 每秒钟保存一次
    });

    // 监听播放和暂停事件
    art.on('play', () => {
      // console.log('Video playing');
    });

    art.on('pause', () => {
      // 暂停时立即保存当前时间
      savePlayTime(url, art.currentTime);
      // console.log('Video paused, time saved');
    });

    art.on('error', (error) => {
      const video = art.video;
      const mediaErr = video?.error;
      const codeMap: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED（用户中止）',
        2: 'MEDIA_ERR_NETWORK（网络错误，URL 可能已失效）',
        3: 'MEDIA_ERR_DECODE（解码错误）',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED（格式不支持）',
      };
      console.error('[Player] Playback error:', {
        code: mediaErr?.code,
        reason: mediaErr ? (codeMap[mediaErr.code] ?? '未知') : '无 MediaError',
        message: mediaErr?.message,
        url: url,
        event: error,
      });
    });

    // 视频播放结束时保存进度
    art.on('ended', () => {
      savePlayTime(url, art.currentTime);
      // // console.log('[Player] Video ended, time saved');
      // // console.log('[Player] isInIframeEnv:', isInIframeEnv.current);
      // // console.log('[Player] enableIframeFullscreen:', enableIframeFullscreen);
      
      // 如果在iframe中，通知父页面视频播放结束
      if (isInIframeEnv.current && enableIframeFullscreen) {
        try {
          window.parent.postMessage({
            type: 'PLAYER_ENDED',
            source: 'artplayer'
          }, '*');
          // // console.log('[Player] Sent ended message to parent');
        } catch (e) {
          console.warn('[Player] Failed to send ended message:', e);
        }
      }
    });

    // 页面关闭前保存进度
    const handleBeforeUnload = () => {
      if (artPlayerRef.current) {
        savePlayTime(url, artPlayerRef.current.currentTime);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 额外添加原生 video 元素的 ended 事件监听（作为备份）
    const videoElement = art.video;
    const handleVideoEnded = () => {
      // // console.log('[Player] Native video ended event triggered');
      
      // 如果在iframe中，通知父页面视频播放结束
      if (isInIframeEnv.current && enableIframeFullscreen) {
        try {
          window.parent.postMessage({
            type: 'PLAYER_ENDED',
            source: 'artplayer'
          }, '*');
          // // console.log('[Player] Sent ended message to parent (from native event)');
        } catch (e) {
          console.warn('[Player] Failed to send ended message:', e);
        }
      }
    };
    videoElement.addEventListener('ended', handleVideoEnded);

    return () => {
      // 清理资源前保存当前播放时间
      if (artPlayerRef.current) {
        savePlayTime(url, artPlayerRef.current.currentTime);
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      window.removeEventListener('beforeunload', handleBeforeUnload);
      videoElement.removeEventListener('ended', handleVideoEnded);

      // 销毁 HLS 实例
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (artPlayerRef.current) {
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      }
    };
  }, [url, poster, title, type, autoplay]);

  return (
    <div
      style={{
        width: '100vw',
        // dvh = dynamic viewport height，会随手机浏览器地址栏显隐动态调整
        // 降级为 100vh（不支持 dvh 的旧浏览器）
        height: '100dvh',
        backgroundColor: '#000',
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      <div
        ref={artRef}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
    </div>
  );
}
