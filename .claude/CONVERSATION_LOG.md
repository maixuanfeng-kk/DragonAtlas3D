# DragonAtlas3D 对话日志

> 每次对话记录，最新的在上面。

---

## 2026-06-15 (下午) — Agent 循环实战 + 状态透明

### 讨论内容
- 确认学习路线：跳过 RAG（DA3D 不需要知识库检索），从工具调用开始
- Fallback 设计：三层降级（Agent 循环 → 高德直调 → 种子数据），每层记录 source_status
- "半商业设计"的核心：优雅地失败，不是假装一切正常

### 代码改动
1. `nodes.py` (511行) → `nodes/` 目录 7 个文件
2. `itinerary_draft.py` 完全重写：Agent 循环 + 三层 fallback
3. Qwen 配置后实测：Agent 自主调用 4 个工具，2 步完成
4. 日志系统：agent 模块 INFO 级别，输出到终端
5. 前端状态透明：生成方式徽章 + 思考步骤面板 + 状态小圆点
6. AgentChat 面板可拖拽缩放

### 关键决策
- 只改 itinerary_draft 一个节点，不改其他节点
- thinking_steps 加到 API schema，前端折叠展示
- 日志用英文避免 Windows GBK 编码问题

---

## 2026-06-15 (上午) — Agent 架构调研

### 讨论内容
- 学习「AI超级智能体实战」课程（鱼皮，Java/Spring AI）
- 对比 2026 年 Agent 发展趋势
- 调研 GitHub 上值得学习的 Agent 项目

### 关键结论
- DA3D 使用 LangGraph 已经领先于课程（课程只是提及）
- 课程的第 3 期（Prompt/多轮对话）DA3D 已满足
- 课程的第 4-5 期（RAG）对旅行 Agent 不是核心需求
- 课程的第 6 期（工具调用）是关键缺口
- 小项目推荐：nano / a_simple_agent_quickstart / langgraph_travel_planner_assistant

### 参考资料
- Anthropic《Building Effective Agents》— 6 种工作流模式
- MCP 2026：9700 万月下载，Linux Foundation 治理
- Supervisor 多 Agent 模式占 80% 企业采用

---

## 2026-06-15 (早) — 代码库熟悉

### 讨论内容
- 全面阅读 DragonAtlas3D 代码库
- 了解本地 Skills（vercel-react-best-practices + web-design-guidelines）
- 了解 Codex 全局状态和历史对话

### 发现
- 前端 React + Three.js，后端 FastAPI + LangGraph
- 数据源：DataV / Terrarium / ArcGIS / 高德 / Qwen
- 项目约束：不静默兜底、不伪造数据、单文件 ≤400 行
- 2 个本地 Skill 来自 vercel-labs/agent-skills

---

## 2026-06-12 — LangGraph Agent 落地

### 代码改动
- 新增 `backend/app/agent/` 完整目录（6个模块）
- 新增 `AgentChat.jsx` 浮动聊天面板
- 新增 `SettingsPanel.jsx` API 配置面板
- UI 精简：移除 HudPanels，HeroOverlay 改为顶部横条
- 安全：清空 .env 中的真实 Key，加入 .gitignore

### 关键决策
- Agent 框架选 LangGraph（需循环决策 + checkpoint）
- 聊天用独立端点不走 LangGraph（轻量）
- Key 管理用 localStorage（前端可配）
