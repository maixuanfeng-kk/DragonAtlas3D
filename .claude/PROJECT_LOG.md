# DragonAtlas3D 项目日志

> 中国 3D 地形旅行 Agent — React + Three.js + FastAPI + LangGraph

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Three.js 0.184 + Vite 8 |
| 后端 | Python 3.12 + FastAPI + LangGraph + SQLite |
| LLM | Qwen (通义千问) via dashscope |
| 地图 | 高德 JS API + Web 服务 API |
| 地形 | DataV 行政区边界 + Terrarium DEM + ArcGIS 影像/山影 |

## 数据源

| 数据源 | 用途 | 密钥 |
|---|---|---|
| DataV | 行政区 GeoJSON 边界 | 无 |
| Terrarium | DEM 高程切片 | 无 |
| ArcGIS World Imagery | 卫星影像切片 | 无 |
| ArcGIS World Hillshade | 山体阴影切片 | 无 |
| 高德 Web 服务 | POI 搜索/路线/精细地点 | 需要 |
| 高德 JS API | 详情地图 | 需要 |
| Qwen | LLM 行程规划/追问 | 需要 |
| 本地 GeoJSON | 河流数据 | 无 |

## 项目约束 (AGENTS.md)

- 禁止静默兜底：数据源失败必须在 UI 显示
- 不许伪造数据：模拟数据必须标注
- 单文件 ≤ 400 行
- 状态透明：source_status 始终可见
- **每次对话必须记录到 `CONVERSATION_LOG.md`，不可遗漏**

---

## 开发历史

### 2026-06-12 — LangGraph Agent 落地

**Agent 框架搭建**
- 新增 `backend/app/agent/` 目录：state.py / tools.py / nodes.py / graph.py / runner.py
- 6 个 LangGraph 节点：intent_router → clarification / poi_selection → itinerary_draft → explanation → response_formatter
- 3 个 LangChain tool：search_amap_place / get_route / lookup_seed_pois
- QwenClient 增加 chat() 和 chat_text()

**前端 Agent 聊天**
- 新增 `POST /api/agent/chat` + AgentChat.jsx 浮动聊天面板
- 折叠态（圆形按钮）+ 展开态（毛玻璃面板），可拖拽

**SettingsPanel**
- 左下角齿轮 → API 配置面板
- Qwen Key/Base URL/Model + 高德 Key，存 localStorage

**UI 精简**
- 移除 HudPanels，HeroOverlay 改为顶部横条
- 详情地图省级触发阈值调整到 7.0

### 2026-06-15 — Agent 循环重构

**代码拆分**
- `nodes.py`(511行) 拆为 `nodes/` 目录 7 个文件，全部 ≤280行

**Agent 循环 (itinerary_draft 重写)**
- 从"LLM 直接输出 JSON" → 真正的 Agent 循环
- Qwen 自己决定何时调 search_amap_place / get_route / lookup_seed_pois
- 最多 8 步，每步记录 thinking_steps
- 三层 Fallback：Agent 循环 → 高德直调 → 种子数据
- 每层降级记录在 source_status 中

**日志系统**
- agent 模块 INFO 级别日志，输出到 uvicorn 终端
- 每步：LLM 调用 → 工具调用 → 工具结果 → 行程解析

**状态透明 (前端)**
- AgentChat 消息下方：圆点 + 模型名（如 `● Qwen (qwen-max)`）
- 规划面板：生成方式徽章（Agent 自主规划 / 规则引擎生成）
- 思考步骤折叠面板：Show agent thinking (N steps)
- AgentChat 面板右下角拖拽缩放（260×280 ~ 800×900）

**测试验证**
- pytest 26/26 通过
- Agent 循环实测：Qwen 自主调用 4 个工具（搜索景点/美食/路线），2 步完成行程

---

## Agent 架构

```
POST /api/travel/plan
  ↓
LangGraph StateGraph
  intent_router → poi_selection → itinerary_draft → explanation → response_formatter
                                      ↑
                              Agent Loop (核心)
                              LLM + 3 个工具 + fallback

POST /api/travel/clarify
  intent_router → clarification → response_formatter

POST /api/agent/chat
  独立端点，不经过 LangGraph，Qwen 直调
```

## 文件结构

```
backend/app/agent/
├── graph.py              LangGraph 状态机组装
├── state.py              AgentState TypedDict
├── runner.py             执行封装
├── tools.py              3 个 LangChain tool 定义
└── nodes/
    ├── __init__.py
    ├── intent_router.py      路由节点
    ├── clarification.py      追问生成
    ├── poi_selection.py      POI 排序
    ├── itinerary_draft.py    🔴 Agent 循环 + 三层 fallback
    ├── explanation.py        行程解释
    └── response_formatter.py 响应组装

src/components/
├── AgentChat.jsx            浮动聊天面板（可拖拽+缩放）
├── DetailMapPlannerWorkspace.jsx  规划面板（思考步骤切换）
├── HeroOverlay.jsx          顶部搜索栏
├── SettingsPanel.jsx        API 配置
└── TravelPlanningWorkspace.jsx  行程工作台

src/map/ — 14 个 3D 地图模块
src/api/ — 前端 HTTP 客户端
```
