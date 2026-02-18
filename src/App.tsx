import M3U8Player from './components/M3U8Player';
import { useURLParams } from './hooks/useURLParams';
import './App.css'

function App() {
  const { url, poster, title, type, autoplay } = useURLParams();

  if (!url) {
    return (
      <div className="app-container" style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>re:Player</h1>
        <p>Usage: /?url=&lt;video-url&gt;</p>
        <p>Supported Formats: HLS (m3u8), DASH (mpd), MP4, WebM, FLV, OGG, MOV, MKV, AVI, WMV, TS, and more</p>
        <p>Optional parameters:</p>
        <ul>
          <li><code>url</code> - Video URL (required)</li>
          <li><code>type</code> - Video type (auto-detected if not specified)</li>
          <li><code>poster</code> - Poster image URL</li>
          <li><code>title</code> - Video title</li>
          <li><code>autoplay</code> - Auto play (default: true)</li>
        </ul>
        <h3>Examples:</h3>
        <div style={{ marginTop: '10px', textAlign: 'left', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          <p><strong>M3U8 Stream (auto-detected):</strong></p>
          <code>?url=https://example.com/video.m3u8</code>
          <p style={{ marginTop: '10px' }}><strong>MP4 with poster (auto-detected):</strong></p>
          <code>?url=https://example.com/video.mp4&amp;poster=https://example.com/poster.jpg&amp;title=My%20Video</code>
          <p style={{ marginTop: '10px' }}><strong>Manual type specification:</strong></p>
          <code>?url=https://example.com/video&amp;type=mp4&amp;title=My%20Video</code>
        </div>
      </div>
    );
  }

  return <M3U8Player url={url} poster={poster} title={title} type={type} autoplay={autoplay} />;
}

export default App
