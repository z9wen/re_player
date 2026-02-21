import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 注册 Service Worker 用于缓存 M3U8 分片
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((_registration) => {
        // console.log('[SW] Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
