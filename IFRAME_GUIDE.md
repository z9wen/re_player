# iframe 嵌入使用指南

## 问题说明

当播放器被嵌套在其他网页的 iframe 中使用时，会遇到以下全屏问题：

1. **网页全屏失效**：网页全屏（fullscreenWeb）只能撑满 iframe 的视口，无法突破到父页面
2. **真全屏需要权限**：使用 Fullscreen API 时，需要父页面授权

## 解决方案

播放器已内置了 **iframe 环境检测** 和 **父子页面通信机制**，能够自动处理嵌入场景下的全屏问题。

### 工作原理

1. 播放器自动检测是否运行在 iframe 中
2. 在 iframe 环境下，当用户点击全屏按钮时，播放器会通过 `postMessage` 向父页面发送消息
3. 父页面接收消息后，调整 iframe 容器的样式来实现全屏效果

### 在父页面中使用

#### 1. 添加 iframe 标签

```html
<div id="playerContainer" class="player-container">
  <iframe 
    id="playerIframe"
    src="https://your-player-url.com?url=视频地址"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>
```

**重要属性说明：**
- `allow="fullscreen"` - 允许 iframe 内使用 Fullscreen API
- `allowfullscreen` - HTML5 全屏属性

#### 2. 添加 CSS 样式

```css
/* 正常状态 */
.player-container {
  width: 100%;
  max-width: 1200px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
}

/* 网页全屏状态 */
.player-container.web-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  z-index: 9999;
}

iframe {
  width: 100%;
  height: 100%;
  border: none;
}
```

#### 3. 添加 JavaScript 消息监听

```javascript
const playerContainer = document.getElementById('playerContainer');

// 监听来自播放器的消息
window.addEventListener('message', (event) => {
  // 🔒 生产环境中应该验证来源
  // if (event.origin !== 'https://your-player-domain.com') return;

  const { type, fullscreen, source } = event.data;

  // 确保消息来自播放器
  if (source !== 'artplayer') return;

  if (type === 'PLAYER_FULLSCREEN_WEB') {
    // 处理网页全屏
    if (fullscreen) {
      playerContainer.classList.add('web-fullscreen');
    } else {
      playerContainer.classList.remove('web-fullscreen');
    }
  } else if (type === 'PLAYER_FULLSCREEN') {
    // 处理真全屏（可选）
    console.log('真全屏状态:', fullscreen);
  }
});

// 支持 ESC 键退出网页全屏
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && playerContainer.classList.contains('web-fullscreen')) {
    playerContainer.classList.remove('web-fullscreen');
  }
});
```

### 消息协议

播放器会发送以下消息到父页面：

#### 网页全屏消息
```javascript
{
  type: 'PLAYER_FULLSCREEN_WEB',
  fullscreen: true,  // true=进入全屏, false=退出全屏
  source: 'artplayer'
}
```

#### 真全屏消息
```javascript
{
  type: 'PLAYER_FULLSCREEN',
  fullscreen: true,  // true=进入全屏, false=退出全屏
  source: 'artplayer'
}
```

## 完整示例

查看 `iframe-example.html` 文件，这是一个完整的嵌入示例，展示了：

- ✅ 如何正确嵌入播放器
- ✅ 如何处理网页全屏
- ✅ 如何处理真全屏
- ✅ 状态显示和调试信息

### 本地测试

1. 启动开发服务器：
```bash
npm run dev
```

2. 在另一个端口启动示例页面（或直接用文件协议打开）：
```bash
# 使用 Python 启动简单服务器
python3 -m http.server 8080
```

3. 访问 `http://localhost:8080/iframe-example.html`

## 参数配置

### M3U8Player 组件参数

```typescript
interface M3U8PlayerProps {
  url: string;                       // 视频地址
  poster?: string;                   // 封面图
  title?: string;                    // 视频标题
  type?: string;                     // 视频类型
  autoplay?: boolean;                // 自动播放
  enableIframeFullscreen?: boolean;  // 启用iframe全屏通信（默认true）
}
```

如果你不想在 iframe 环境中启用父子页面通信，可以设置：
```typescript
<M3U8Player 
  url="..."
  enableIframeFullscreen={false}
/>
```

## 安全建议

在生产环境中，建议验证 `postMessage` 的来源：

```javascript
window.addEventListener('message', (event) => {
  // 验证消息来源
  const allowedOrigins = [
    'https://your-player-domain.com',
    'https://cdn.your-domain.com'
  ];
  
  if (!allowedOrigins.includes(event.origin)) {
    console.warn('Received message from untrusted origin:', event.origin);
    return;
  }

  // 处理消息...
});
```

## 常见问题

### Q: 为什么真全屏不工作？
A: 确保 iframe 标签包含 `allow="fullscreen"` 和 `allowfullscreen` 属性。

### Q: 如何禁用网页全屏，只使用真全屏？
A: 修改播放器配置，设置 `fullscreenWeb: false`。

### Q: 跨域情况下如何通信？
A: `postMessage` 支持跨域通信，但需要在接收端验证 `event.origin`。

### Q: 如何自定义全屏容器样式？
A: 修改父页面的 `.web-fullscreen` CSS 类。

## 技术支持

如有其他问题，请查看：
- [Artplayer 官方文档](https://artplayer.org/)
- [postMessage API](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/postMessage)
- [Fullscreen API](https://developer.mozilla.org/zh-CN/docs/Web/API/Fullscreen_API)
