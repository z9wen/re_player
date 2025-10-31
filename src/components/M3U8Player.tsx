import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';

interface M3U8PlayerProps {
  url: string;
  poster?: string;
  title?: string;
  type?: string; // 视频类型: hls, dash, flv, mp4, webm, ogg, mov, etc
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

export default function M3U8Player({ url, poster, title, type }: M3U8PlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const artPlayerRef = useRef<Artplayer | null>(null);
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
      autoplay: true,
      fullscreen: true,
      fullscreenWeb: true,
      hotkey: true,
      pip: true,
      mutex: true
    };

    // 只在poster存在时才添加
    if (poster) {
      config.poster = poster;
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

    return () => {
      // 清理资源
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (artPlayerRef.current) {
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      }
    };
  }, [url, poster, title, type]);

  return (
    <div
      ref={artRef}
      style={{
        width: '100%',
        height: '100vh',
        backgroundColor: '#000'
      }}
    />
  );
}