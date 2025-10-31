import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

interface M3U8PlayerProps {
  url: string;
  poster?: string;
  title?: string;
  type?: string; // 视频类型: hls, dash, flv, mp4, webm, ogg, mov, etc
  autoplay?: boolean;
}

// 存储播放进度的key
const STORAGE_KEY_PREFIX = 'artplayer_progress_';

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

export default function M3U8Player({ url, poster, title, type, autoplay = true }: M3U8PlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const artPlayerRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!artRef.current || !url) return;

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
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      flip: true,
      rotate: true
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
              console.log('[HLS] Manifest parsed, levels:', hls.levels.length);
            });

            hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
              console.log('[HLS] Fragment loaded:', data.frag.sn, 'duration:', data.frag.duration);
            });

            hls.on(Hls.Events.ERROR, (_event, data) => {
              console.error('[HLS] Error:', data.type, data.details);

              // 致命错误处理
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('[HLS] Network error, trying to recover...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('[HLS] Media error, trying to recover...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('[HLS] Fatal error, cannot recover');
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
                console.log(`[HLS] Buffer: ${bufferInfo.buffered.toFixed(1)}s ahead`);
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // iOS Safari 原生支持
            video.src = url;
            console.log('[HLS] Using native HLS support');
          }
        }
      };
    }

    const art = new Artplayer(config);

    artPlayerRef.current = art;

    // 播放器加载完成后，恢复上次保存的播放时间
    art.on('ready', () => {
      const savedTime = getSavedTime(url);
      if (savedTime > 0) {
        art.currentTime = savedTime;
        console.log(`Restored playback time: ${savedTime}s`);
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
      console.log('Video playing');
    });

    art.on('pause', () => {
      // 暂停时立即保存当前时间
      savePlayTime(url, art.currentTime);
      console.log('Video paused, time saved');
    });

    art.on('error', (error) => {
      console.error('Playback error:', error);
    });

    // 视频播放结束时保存进度
    art.on('ended', () => {
      savePlayTime(url, art.currentTime);
      console.log('Video ended, time saved');
    });

    // 页面关闭前保存进度
    const handleBeforeUnload = () => {
      if (artPlayerRef.current) {
        savePlayTime(url, artPlayerRef.current.currentTime);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // 清理资源前保存当前播放时间
      if (artPlayerRef.current) {
        savePlayTime(url, artPlayerRef.current.currentTime);
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      window.removeEventListener('beforeunload', handleBeforeUnload);

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
      ref={artRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    />
  );
}