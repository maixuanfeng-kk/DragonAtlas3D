# DragonAtlas3D 🐉

> 3D 中国地形地图 + 武汉旅游 Agent —— 从地图探索到行程规划的一站式体验。

DragonAtlas3D 是一个 **React + Three.js 前端** 与 **Python/FastAPI + LangGraph 后端** 相结合的项目。3D 地形首页作为全国尺度的空间入口，用户可以缩放到城市级别后进入高德地图细节模式进行旅行规划。后端 Agent（由 Qwen 大模型驱动）生成同城行程，包含真实的路径腿（route leg）、访问顺序和时间安排。

---

## 目录

- [架构概览](#架构概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [安装与运行](#安装与运行)
  - [1. 克隆项目](#1-克隆项目)
  - [2. 前端 (Vite + React + Three.js)](#2-前端-vite--react--threejs)
  - [3. 后端 (FastAPI + LangGraph)](#3-后端-fastapi--langgraph)
- [使用说明](#使用说明)
  - [3D 地形首页](#3d-地形首页)
  - [细节地图与行程规划](#细节地图与行程规划)
  - [Agent 聊天](#agent-聊天)
- [API 接口](#api-接口)
- [数据源](#数据源)
- [配置说明](#配置说明)
- [测试](#测试)
- [设计原则](#设计原则)
- [当前范围与限制](#当前范围与限制)
- [许可证](#许可证)

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    前端 (Vite)                        │
│  React 19 + Three.js 0.184 + 高德 JS API 2.0        │
│                                                      │
│  • 3D 中国地形场景 (DEM + 影像 + 标签)                │
│  • 行政区划下钻 (→ 街道级)                            │
│  • 高德细节地图 (城市级规划)                           │
│  • 行程规划面板 (按天切换、站点卡片、路径摘要)          │
│  • 浮动 Agent 聊天窗口                                │
└────────────────────┬────────────────────────────────┘
                     │ REST / JSON
                     │
┌────────────────────▼────────────────────────────────┐
│                   后端 (FastAPI)                      │
│                                                      │
│  • LangGraph 旅行 Agent (6 节点图)                   │
│  • Qwen 大模型集成 (追问、行程草拟、解释、聊天)        │
│  • 高德路径规划 (逐段调用)                            │
│  • POI 提取流水线 (从本地笔记语料)                    │
│  • SQLite 存储 (SQLModel)                            │
│  • 数据源状态与不确定性透明展示                        │
└─────────────────────────────────────────────────────┘
```

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.7 | UI 框架 |
| Three.js | ^0.184.0 | 3D 地形渲染 |
| Vite | ^8.0.16 | 构建工具 & 开发服务器 |
| @vitejs/plugin-react | ^6.0.2 | React Fast Refresh |
| 高德 JS API 2.0 | CDN | 城市细节地图 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | >=3.12 | 运行环境 |
| FastAPI | >=0.116.0 | REST API 框架 |
| Uvicorn | >=0.35.0 | ASGI 服务器 |
| Pydantic | >=2.11.0 | 数据校验 |
| SQLModel | >=0.0.24 | ORM (SQLite) |
| LangGraph | >=0.4 | Agent 编排 |
| langchain-core | >=0.3 | LLM 抽象层 |
| httpx | >=0.28.0 | HTTP 客户端 (调用高德 API) |

### 外部服务

| 服务 | 用途 |
|------|------|
| **高德 Web Service** | 路径规划（步行/驾车/公交）、POI 搜索、地理编码 |
| **高德 JS API 2.0** | 细节地图渲染与覆盖物 |
| **Qwen (通义千问)** | 大模型：旅行追问、行程草拟、解释生成、POI 抽取、聊天 |
| **DataV (阿里 DataV)** | 行政区划 GeoJSON 边界 |
| **Terrarium DEM Tiles** | 高程数据 (3D 地形网格) |
| **ArcGIS World Imagery** | 卫星影像 (无需 key) |
| **ArcGIS World Hillshade** | 山体阴影叠加 (无需 key) |

---

## 项目结构

```
DragonAtlas3D/
│
├── index.html                          # 入口 HTML
├── package.json                        # 前端依赖
├── vite.config.js                      # Vite 配置
├── serve.py                            # 独立静态文件服务器
├── .env.example                        # 前端环境变量模板 (高德 key)
├── AGENTS.md                           # Agent 开发指令文档
│
├── src/                                # 前端源码
│   ├── main.jsx                        # 应用入口, DNS 预连接
│   ├── App.jsx                         # 根组件 (场景生命周期管理)
│   ├── appConfig.js                    # 基于 localStorage 的配置 (API keys)
│   ├── useTravelPlanner.js             # 行程规划状态 hook
│   ├── useDetailMapEntry.js            # 细节地图入口状态 hook
│   ├── travel-planner.css
│   │
│   ├── api/
│   │   ├── travelAgentClient.js        # POST /travel/clarify, /travel/plan
│   │   └── poiClient.js                # GET /poi
│   │
│   ├── components/
│   │   ├── HeroOverlay.jsx             # 搜索栏 & 地点确认卡片
│   │   ├── HudPanels.jsx               # 状态数据 HUD
│   │   ├── SettingsPanel.jsx           # 设置面板 (API key 配置)
│   │   ├── DetailMapPrompt.jsx         # "进入细节地图" 提示
│   │   ├── TravelPlanningWorkspace.jsx # 总工作区 (细节地图 + 规划 + 聊天)
│   │   ├── DetailMapPlannerWorkspace.jsx # 规划面板 (POI 搜索、设置、日程视图)
│   │   ├── TravelPlannerPanel.jsx      # 行程规划面板
│   │   ├── TravelPlannerDayTabs.jsx    # 按天切换标签
│   │   ├── TravelPlannerDayTimeline.jsx # 单天站点 & 路径时间线
│   │   ├── AmapDetailView.jsx          # 高德细节地图容器
│   │   ├── AgentChat.jsx               # 浮动可拖拽聊天窗口
│   │   ├── heroCopy.js                 # 地点确认文案构建
│   │   ├── searchQuery.js              # 搜索查询规范化
│   │   └── searchQuery.test.js
│   │
│   ├── map/                            # 3D 地图引擎 & 高德集成
│   │   ├── sceneRuntime.js             # Three.js 场景初始化 & 生命周期
│   │   ├── sceneInteractions.js        # 鼠标/触控缩放、平移、倾斜
│   │   ├── sceneTransitions.js         # 相机过渡动画
│   │   ├── sceneDetails.js             # 细节层级管理
│   │   ├── terrain.js                  # DEM 地形网格生成
│   │   ├── terrainConfig.js            # 地形参数配置
│   │   ├── terrainColors.js            # 高程颜色映射
│   │   ├── terrainShading.js           # 山体阴影计算
│   │   ├── terrainSampling.js          # 高程采样
│   │   ├── terrainTexture.js           # 纹理管理
│   │   ├── regionRenderer.js           # 行政区划渲染
│   │   ├── residentialLayer.js         # 住宅区图层
│   │   ├── townshipViewportLayer.js    # 街道级视口
│   │   ├── townships.js                # 街道数据处理
│   │   ├── districtScene.js            # 区级场景
│   │   ├── rivers.js                   # 河流数据处理
│   │   ├── overlays.js                 # 标签覆盖物
│   │   ├── labelItems.js               # 标签项收集
│   │   ├── viewState.js                # 核心状态常量
│   │   ├── viewBounds.js               # 视口边界
│   │   ├── dataSources.js              # 数据源注册
│   │   ├── geo.js                      # 地理工具函数
│   │   ├── adminSearch.js              # 行政区划搜索
│   │   ├── searchController.js         # 搜索编排
│   │   ├── poiLayer.js                 # POI 图层
│   │   ├── poiFocus.js                 # POI 聚焦/选中
│   │   ├── viewportPois.js             # 视口 POI 加载
│   │   ├── viewportPoiPolicy.js        # POI 展示策略
│   │   ├── detailMapMode.js            # 细节地图模式状态机
│   │   ├── detailMapItineraryModel.js  # 细节地图行程数据模型
│   │   ├── amapDetailMap.js            # 高德地图实例管理
│   │   ├── amapItineraryOverlay.js     # 高德地图行程覆盖物
│   │   ├── amapSearch.js               # 高德地点搜索
│   │   ├── travelPlanState.js          # 行程规划状态管理
│   │   ├── travelRouteLayer.js         # 路径图层渲染
│   │   ├── travelSelection.js          # 细节地图地点选择
│   │   ├── wuhanTravelNodes.js         # 武汉旅行节点
│   │   └── *.test.js                   # 单元测试
│   │
│   └── styles/
│       ├── base.css
│       ├── map.css
│       ├── detail-map.css
│       ├── panels.css
│       ├── responsive.css
│       ├── settings.css
│       └── agent-chat.css
│
├── public/data/
│   ├── china-cities.json               # 城市级 GeoJSON
│   ├── china-outline.json              # 中国轮廓
│   ├── china-provinces.json            # 省级 GeoJSON
│   ├── township-directory-index.json   # 街道索引
│   └── rivers/
│       ├── china-major-rivers.geojson  # 中国主要河流
│       └── china-tributary-rivers.geojson # 中国支流
│
├── backend/                            # Python 后端
│   ├── pyproject.toml                  # Python 项目配置 & 依赖
│   ├── .env.example                    # 后端环境变量模板
│   │
│   ├── app/
│   │   ├── main.py                     # FastAPI 应用 (CORS, 路由, 生命周期)
│   │   ├── config.py                   # Pydantic Settings (环境变量配置)
│   │   ├── db.py                       # SQLModel 引擎 & 会话
│   │   │
│   │   ├── api/
│   │   │   ├── health.py               # GET /api/health
│   │   │   ├── source_status.py        # GET /api/source-status
│   │   │   ├── poi.py                  # GET /api/poi, POST /api/poi/extract
│   │   │   ├── travel.py               # POST /api/travel/clarify, /travel/plan
│   │   │   └── chat.py                 # POST /api/agent/chat
│   │   │
│   │   ├── models/
│   │   │   ├── schemas.py              # 所有 Pydantic 请求/响应模型
│   │   │   └── tables.py               # SQLModel 数据库表
│   │   │
│   │   ├── agent/
│   │   │   ├── graph.py                # LangGraph 图组装 (6 节点编译)
│   │   │   ├── nodes.py                # 节点实现
│   │   │   ├── state.py                # AgentState TypedDict 定义
│   │   │   ├── runner.py               # Agent 执行封装 (clarify / plan)
│   │   │   └── tools.py                # 3 个 Agent 工具
│   │   │
│   │   ├── services/
│   │   │   ├── amap_route_service.py   # 高德路径腿获取 & 标准化
│   │   │   ├── city_itinerary_planner.py # 基于规则的行程组装
│   │   │   ├── itinerary_builder.py    # 行程构建工具
│   │   │   ├── map_projection.py       # 行程 -> 地图坐标投影
│   │   │   ├── note_ingest.py          # 本地笔记语料加载
│   │   │   ├── poi_extractor.py        # 基于 Qwen 的 POI 抽取
│   │   │   ├── poi_registry.py         # 种子 + 抽取 POI 合并
│   │   │   ├── poi_store.py            # POI 持久化 (SQLite)
│   │   │   ├── source_registry.py      # 数据源状态追踪
│   │   │   ├── trend_summary.py        # 趋势总结
│   │   │   └── llm/
│   │   │       └── qwen_client.py      # Qwen LLM HTTP 客户端
│   │   │
│   │   └── repositories/
│   │       ├── poi_repository.py
│   │       └── source_status_repository.py
│   │
│   ├── data/
│   │   └── wuhan_seed_nodes.json       # 3 个手工标注的武汉种子 POI
│   │
│   └── tests/
│       ├── conftest.py
│       ├── test_health.py
│       ├── test_travel_api.py
│       ├── test_amap_route_service.py
│       ├── test_city_itinerary_planner.py
│       ├── test_note_ingest.py
│       ├── test_poi_extractor.py
│       ├── test_poi_store.py
│       └── test_qwen_client.py
│
└── docs/
    └── superpowers/
        ├── specs/
        │   ├── 2026-06-09-wuhan-travel-agent-design.md
        │   ├── 2026-06-09-wuhan-travel-agent-api-contract.md
        │   └── 2026-06-10-city-itinerary-map-design.md
        └── plans/
            ├── 2026-06-09-wuhan-travel-agent-mvp-implementation.md
            └── 2026-06-10-city-itinerary-map-implementation.md
```

**总代码量：约 10,600 行**（前端 + 后端，不含依赖和生成文件）。

---

## 环境要求

- **Node.js** >= 18（Vite / React）
- **Python** >= 3.12（FastAPI 后端）
- **高德 Web Service Key**（在 [lbs.amap.com](https://lbs.amap.com) 免费注册）
- **高德 JS API Key + 安全密钥**（同一平台）
- **Qwen API Key + Base URL**（通过阿里云百炼 / DashScope 获取）

---

## 安装与运行

### 1. 克隆项目

```bash
git clone https://github.com/maixuanfeng-kk/DragonAtlas3D.git
cd DragonAtlas3D
```

### 2. 前端 (Vite + React + Three.js)

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的高德 key：
#   VITE_AMAP_WEB_KEY=你的高德Web服务key
#   VITE_AMAP_JS_KEY=你的高德JSAPI key
#   VITE_AMAP_JS_SECURITY_CODE=你的高德安全密钥

# 启动开发服务器
npm run dev
# -> http://127.0.0.1:5173
```

**生产构建：**

```bash
npm run build
npm run preview   # -> http://127.0.0.1:4173
```

也可以用项目自带的 Python 静态文件服务器：

```bash
python serve.py --port 8765
```

### 3. 后端 (FastAPI + LangGraph)

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate   # Windows 上使用: .venv\Scripts\activate

# 安装
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入：
#   DATABASE_URL=sqlite:///./travel_agent.db
#   AMAP_WEB_KEY=你的高德Web服务key
#   QWEN_API_KEY=你的Qwen API key
#   QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
#   QWEN_MODEL=qwen-max

# 启动服务器
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# -> http://127.0.0.1:8000
# -> Swagger 文档: http://127.0.0.1:8000/docs
```

---

## 使用说明

### 3D 地形首页

1. 浏览器打开 `http://127.0.0.1:5173`。
2. 页面加载后显示中国 3D 地形俯视图，使用真实高程数据渲染。
3. **滚轮**缩放，**拖拽**平移，点击右下角**倾斜切换按钮**可以在俯视图和透视视角之间切换。
4. 随着缩放级别加深，行政区划边界逐级显示：全国 -> 省 -> 市 -> 区 -> 街道。
5. 标签、河流、住宅区根据缩放级别自动加载。

### 细节地图与行程规划

1. 在搜索栏输入城市名称（如 `武汉`）并按回车。
2. 弹出地点确认卡片，地图过渡到目标城市。
3. 出现"进入高德细节规划"提示，点击 **进入**。
4. 细节地图加载高德底图，此时可以：
   - **搜索**地点（如 `黄鹤楼`、`户部巷`）。
   - 从搜索结果或推荐 POI 中**选择** 2-5 个地点作为行程候选。
   - 浏览后端返回的**推荐 POI** 列表。
5. 配置行程参数（天数、白天/夜晚偏好、兴趣标签）。
6. 点击 **生成方案**。
7. 后端返回：
   - 多天行程，每天包含**站点**（到达/离开时间、停留时长、选择理由）。
   - 站点之间的**路径腿**（交通方式、时长、高德真实路径折线）。
   - **POI 卡片**（标签、置信度、坐标状态）。
   - **数据源状态**和**不确定性**标记。
8. 细节地图上展示当前选中天的编号站点标记和路径折线。点击站点卡片高亮对应地图标记，点击地图标记滚动到对应卡片。

### Agent 聊天

- 细节地图激活时，右下角出现浮动聊天按钮。
- 点击打开可拖拽的聊天面板。
- 聊天 Agent 感知当前上下文：所在城市、已选地点、行程摘要。
- 使用 Qwen 大模型回答旅行相关问题（中文）。

---

## API 接口

后端运行时，完整的 Swagger 交互文档在 `http://127.0.0.1:8000/docs`。

### 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 - 返回 {"status": "ok"} |
| `GET` | `/api/source-status` | 列出所有数据源状态 |
| `GET` | `/api/poi?city=wuhan&mapped_only=true` | 查询城市的结构化 POI 列表 |
| `POST` | `/api/poi/extract` | 触发从本地笔记语料抽取 POI |
| `POST` | `/api/travel/clarify` | 根据地图选点生成追问问题 |
| `POST` | `/api/travel/plan` | 生成多天城市行程（含路径腿） |
| `POST` | `/api/agent/chat` | 与旅行 Agent 单轮对话 |

### 关键请求/响应示例

**POST /api/travel/clarify** - 请求：

```json
{
  "thread_id": "thread-001",
  "current_city": "wuhan",
  "selected_nodes": [
    { "id": "donghu", "name": "东湖", "node_type": "area", "center": [114.419, 30.56] }
  ],
  "trip_days": 3,
  "day_or_night_preference": "balanced",
  "interest_tags": ["sightseeing", "food"]
}
```

响应包含 `follow_up_questions`（1-3 个带选项的追问）、`source_status` 和 `uncertainty`。

**POST /api/travel/plan** - 响应包含 `itinerary` 对象，其中 `days[]` 数组每项含 `stops[]`（`arrival_time`, `departure_time`, `dwell_minutes` 等）和 `legs[]`（`mode`, `duration_minutes`, `polyline`, `status` 等）。详见 [API 契约文档](docs/superpowers/specs/2026-06-09-wuhan-travel-agent-api-contract.md)。

**POST /api/agent/chat** - 请求：

```json
{
  "thread_id": "...",
  "message": "黄鹤楼附近有什么好吃的？",
  "context": {
    "current_city": "wuhan",
    "active_pois": ["黄鹤楼"],
    "itinerary_summary": "..."
  }
}
```

返回 `{ "thread_id": "...", "reply": "...", "source_status": [...] }`。

---

## 数据源

所有网络数据源都显式暴露状态（`pending` / `ready` / `partial` / `failed`）。不做静默降级——数据源失败时 UI 会明确展示。

| 数据源 | 源 ID | 说明 |
|--------|-------|------|
| DataV areas_v3 | datav-areas-v3 | 行政区划 GeoJSON 边界（全国 -> 街道） |
| Terrarium DEM | terrarium-dem | 高程瓦片（3D 地形网格） |
| ArcGIS World Imagery | arcgis-imagery | 卫星影像（无需 key） |
| ArcGIS World Hillshade | arcgis-hillshade | 山体阴影叠加（无需 key） |
| 高德 Web Service | amap-web | 路径规划、POI 搜索、地理编码（需 key） |
| 高德 JS API 2.0 | - | 细节地图渲染（仅前端，CDN 加载） |
| 武汉种子节点 | wuhan-seed-nodes | backend/data/wuhan_seed_nodes.json 中的 3 个手工标注 POI |
| Qwen 大模型 | poi-extractor 等 | LLM 驱动的生成（需 key） |
| 本地笔记语料 | wuhan-note-corpus | 本地武汉内容快照，用于趋势/POI 抽取 |

---

## 配置说明

### 前端 (src/appConfig.js)

配置 key 可以通过两种方式设置：
1. **设置面板** - 点击左下角齿轮图标，在运行时输入 key（保存在 localStorage）。
2. **环境变量** - .env 文件或构建时注入。

| Key | 环境变量 | 说明 |
|-----|---------|------|
| 高德 Web Key | VITE_AMAP_WEB_KEY | 高德 Web Service API key |
| 高德 JS Key | VITE_AMAP_JS_KEY | 高德 JS API 2.0 key |
| 高德安全密钥 | VITE_AMAP_JS_SECURITY_CODE | 高德 JS API 安全密钥 |
| Qwen API Key | VITE_QWEN_API_KEY | Qwen API key（也可在后端配置） |
| Qwen Base URL | VITE_QWEN_BASE_URL | Qwen API 地址 |
| Qwen Model | VITE_QWEN_MODEL | 模型名称（如 qwen-max） |

### 后端 (backend/.env)

| Key | 默认值 | 说明 |
|-----|--------|------|
| DATABASE_URL | sqlite:///./travel_agent.db | SQLite 数据库路径 |
| NOTE_SOURCE_PATHS | - | 本地笔记 JSONL 文件路径（分号分隔） |
| AMAP_WEB_KEY | - | 高德 Web Service API key |
| AMAP_WEB_BASE_URL | https://restapi.amap.com | 高德 API 基础 URL |
| QWEN_API_KEY | - | Qwen API key |
| QWEN_BASE_URL | - | Qwen API 基础 URL |
| QWEN_MODEL | qwen-max | Qwen 模型名称 |
| QWEN_TIMEOUT_SECONDS | 180 | LLM 请求超时时间（秒） |

---

## 测试

### 后端测试

```bash
cd backend
pip install -e ".[dev]"
pytest -v
```

测试覆盖：健康检查、行程 API 契约、高德路径服务、城市行程规划器、笔记导入、POI 抽取、POI 存储、Qwen 客户端。

### 前端测试

已有的单元测试文件（共 8 个）：

- src/map/adminSearch.test.js
- src/map/detailMapItineraryModel.test.js
- src/map/detailMapMode.test.js
- src/map/labelItems.test.js
- src/map/travelSelection.test.js
- src/map/viewportPoiPolicy.test.js
- src/map/viewportPois.test.js
- src/components/searchQuery.test.js

---

## 设计原则

完整文档见 [AGENTS.md](AGENTS.md) 和 [设计规约](docs/superpowers/specs/)。核心原则：

1. **地图优先的旅行 Agent** - 地图是交互入口和结果承载层，不是装饰。旅行结果以地图覆盖物的形式呈现。
2. **不做静默降级** - 数据源失败时，失败信息必须显式展示。不自动切换到未经批准的数据源。
3. **显式不确定性** - 自动抽取的 POI 标记为 status=auto_extracted 并附带置信度。趋势总结标注数据来源。坐标来源不明的节点标记 coordinate_status=partial。
4. **单文件不超过 400 行** - 任何源文件不得超过 400 行，接近阈值时提取内聚模块。
5. **数据源状态透明** - 每个网络数据层都暴露 pending / ready / partial / failed 状态。

---

## 当前范围与限制

### 已实现

- 中国 3D 地形（缩放、平移、可控倾斜）
- 行政区划下钻至街道级
- 武汉作为旅行 Agent 试点城市
- 同城行程规划（1-3 天）
- 用户选择 2-5 个地点 -> Agent 生成排序行程
- 高德真实路径腿（步行、驾车、公交）
- 每个站点的到访时间、离开时间、停留时长
- Qwen 大模型驱动的追问、行程草拟、解释生成
- 基于 Qwen 从本地笔记语料抽取 POI
- 带地图上下文的浮动 Agent 聊天面板
- 全局数据源状态与不确定性展示

### 暂未实现

- 跨城市 / 多城市联游
- 酒店推荐或预订
- 实时交通、天气、营业时间
- 导航级路线指引
- 完整约束优化（预算、体力、同行类型）
- 预测模型（LSTM / Transformer）
- 武汉以外城市的旅行 Agent
- 实时数据抓取

详见 [设计文档](docs/superpowers/specs/) 中的分阶段计划和未来路线图。

---

## 许可证

ISC - 见 [package.json](package.json)。
