# DragonAtlas3D 开发聊天记录 — 2026-06-12

## 1. 项目理解与分析

- 阅读了整个 DragonAtlas3D 代码库：React + Three.js 前端，FastAPI 后端
- 理解了产品定位：以地图为入口的中国旅游 Agent，武汉为试点城市
- 当前状态：武汉同城旅行 MVP，规则引擎生成行程

## 2. LangGraph Agent 落地

- 决定使用 LangGraph 替代硬编码的规则引擎
- 新增 `backend/app/agent/` 目录（6 个模块）：
  - `state.py` — AgentState TypedDict 共享状态
  - `tools.py` — 3 个 LangChain tool（Amap 搜索、路线、POI 查询）
  - `nodes.py` — 6 个 agent 节点（intent_router / clarification / poi_selection / itinerary_draft / explanation / response_formatter）
  - `graph.py` — StateGraph 组装 + MemorySaver
  - `runner.py` — run_agent_clarify / run_agent_plan 执行封装
- 修改 `travel.py` 端点接入 LangGraph agent
- 增强 `QwenClient` 添加 `chat()` 和 `chat_text()` 方法
- 验证：26/26 pytest 全部通过

## 3. Agent 聊天面板

- 新增 `POST /api/agent/chat` 端点，支持前端传入 Qwen 配置覆盖
- 新增 `AgentChat.jsx` — 浮动可拖拽聊天面板
- 设计为折叠态（圆形按钮）+ 展开态（毛玻璃聊天面板）
- 支持拖拽移动、入口提示、打字动画
- 位置调整：从右下角 → 左下角（避免遮挡高德缩放控件）

## 4. UI 精简与优化

### 移除左下角 HUD
- 删除 `HudPanels` 组件（面包屑导航 + 相机模式切换 + 详情入口按钮）
- 默认相机从俯视 `"top"` → 倾斜 `"tilt"`

### 精简 HeroOverlay
- 从左上角大卡片 → 顶部超薄横条
- 移除 5 个状态芯片（视角/地形/影像/搜索/精细地点）
- 品牌名 + 引导语 + 搜索框 压缩成一行
- 居中布局 → 用户反馈挡住地图 → 改回顶部横条

### 文案优化
- 标题："先看见中国，再决定去哪里" → "DragonAtlas3D · 中国旅行助手"
- 引导语："搜索城市名称，或直接放大地图到省级区域，即可进入高德细节规划模式"
- 强调两种进入方式：搜索 + 缩放

## 5. API 配置面板

- 新增 `SettingsPanel.jsx` — 左下角齿轮按钮 → 展开配置卡片
- 从纯齿轮图标 → 标签按钮 `[⚙ API 配置 ●○]` 带状态指示灯
- 橙色脉冲提示气泡（10 秒自动消失）
- 支持配置：Qwen API Key / Base URL / Model + 高德 Web Key / JS Key / 安全密钥
- 添加平台直达链接：阿里云百炼 + 高德开放平台
- 所有 Key 默认空值，不预填任何默认值
- 存储于 localStorage，不上传服务器

### 相关文件
- `src/appConfig.js` — localStorage 读写模块
- `src/map/detailMapMode.js` — Amap Key 从 localStorage 读取
- `src/map/adminSearch.js` / `amapSearch.js` / `viewState.js` / `districtScene.js` / `regionRenderer.js` — 同上
- `backend/app/api/chat.py` — 接受前端传入的 Qwen 覆盖

## 6. 细节地图触发调整

- 省级触发阈值：1.2 → 5.0 → 7.0（最终）
- 修复重置阈值上限（DETAIL_MAP_RESET_MAX_SPAN = 4.0），防止 dismiss 后无法重新触发
- 引导文案同步更新

## 7. 安全修复

- 清空 `backend/.env` 和 `.env.example` 中的真实 Key
- `.gitignore` 添加 `backend/.env`
- 所有配置面板字段默认空值，不预填

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Agent 框架 | LangGraph | 需要循环决策 + checkpoint |
| 聊天架构 | 独立端点，不走 LangGraph | 轻量，测试方便 |
| Key 管理 | localStorage | 前端可配，不依赖 env |
| 地图触发 | 省级 span=7.0 | 更早发现，引导用户进入 |
