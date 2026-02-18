import { useMemo } from 'react';

interface PlayerParams {
  url: string | null;
  poster?: string;
  title?: string;
  type?: string;
  autoplay?: boolean;
  enableIframeFullscreen?: boolean;
}

export function useURLParams(): PlayerParams {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);

    return {
      url: params.get('url'),
      poster: params.get('poster') || undefined,
      title: params.get('title') || undefined,
      type: params.get('type') || undefined,
      autoplay: params.get('autoplay') !== 'false',
      enableIframeFullscreen: params.get('enableIframeFullscreen') !== 'false'
    };
  }, []);
}