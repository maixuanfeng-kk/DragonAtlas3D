# Wuhan Travel Agent Design

**Date:** 2026-06-09

## 1. Product Goal

DragonAtlas3D 的长期目标不是展示一个 3D 中国地图，而是成为一个以地图为入口的中国旅游 agent。

本阶段的设计目标是定义一个可落地的 MVP：以武汉为试点城市，围绕现有地图产品，完成从地图选点到问答再到行程生成的最小闭环。

MVP 必须满足以下标准：

- 地图不是装饰层，而是交互入口和结果承载层。
- 推荐结果不是纯文案，要能回写为地图上的点位和访问顺序线。
- 数据不确定性、自动抽取状态、失败原因必须显式展示。
- 不依赖新的付费或 key-gated 第三方旅游数据服务。

## 2. MVP Scope

### 2.1 City Scope

- 试点城市：`武汉`
- 场景：`3-5 天单城市深度游`

### 2.2 Core Journey

用户主流程固定为：

`地图选择 1-3 个兴趣点/区域 -> Agent 追问 1-2 个问题 -> 输出单一最佳方案 -> 地图展示按天访问顺序线`

### 2.3 What The MVP Must Do

- 支持用户在地图上选择 `POI` 或 `区域/街区`
- 支持景点讲解
- 支持美食/街区探索建议
- 支持轻个性化问答
- 生成一条单一最佳武汉行程方案
- 把行程中的点位顺序标回地图

### 2.4 What The MVP Will Not Do

- 不做全国多城市联游
- 不做真实导航级路线
- 不做酒店、机酒预订、支付闭环
- 不做重型实时抓取
- 不做预测模型主链路
- 不做 LoRA / QLoRA 微调主链路
- 不做复杂运筹优化主链路

## 3. User Inputs And Outputs

### 3.1 Required Inputs

首版只收集最少输入：

- `selected_nodes`
  - 来自地图，数量 `1-3`
  - 节点类型支持 `poi` 和 `area`
- `trip_days`
  - 建议范围 `3-5`
- `day_or_night_preference`
  - 例如偏白天、偏夜游、均衡
- `interest_tags`
  - 例如景点、美食、街区

### 3.2 Required Outputs

每次完整生成必须至少返回：

- `answer`
  - 面向用户的推荐说明
- `selected_reasoning`
  - 为什么围绕这些点组织路线
- `itinerary`
  - 行程主体
- `map_route_days`
  - 每天的访问顺序线
- `poi_cards`
  - 点位说明、标签、自动抽取状态
- `source_status`
  - 数据来源、状态、时间戳、失败信息
- `uncertainty`
  - 自动抽取和推断部分的说明
- `follow_up_questions`
  - 如果需要二次收敛

## 4. Product Principles

### 4.1 Map-First Travel Agent

系统必须服务“地图驱动的旅行探索”，不是纯聊天机器人。

- 地图选点是入口
- 地图回写是结果
- 问答和行程都必须带地理上下文

### 4.2 No Silent Fallback

任何数据失败都必须显式暴露：

- 不自动切换到未批准的数据源
- 不把空数据包装成成功
- 不把模型猜测包装成真实信息

### 4.3 Explicit Uncertainty

模型自动抽取和模型推断出的内容必须可识别：

- 自动抽取 POI 要带 `status=auto_extracted`
- 自动抽取 POI 要带 `confidence`
- 趋势总结要标记来源于本地内容快照，不代表官方事实

## 5. Data Strategy

### 5.1 Dual-Layer Data Model

首版采用双层数据方案。

#### A. Trend Corpus Layer

作用：提供“武汉怎么玩”的风格、热度和话题线索。

来源：

- 本地武汉内容快照：`E:\agent\MediaCrawler\data_wuhan\xhs\jsonl`

用途：

- 提炼热门玩法
- 提炼街区气质
- 提炼打卡理由
- 提炼适合白天/夜晚/雨天的玩法描述
- 提炼避坑提醒和情绪化描述

限制：

- 不能直接当成事实型 POI 数据
- 不能直接当作地图坐标真相
- 不能直接当作营业时间、票价、开放状态依据

#### B. Structured POI Layer

作用：提供可以上图、可以串线路、可以生成行程骨架的结构化实体。

来源：

- 由 `qwen3.6-plus` 从本地武汉内容快照中自动抽取候选 POI

首版允许完全自动入库，但必须存储以下字段：

- `id`
- `name`
- `node_type`
- `category`
- `district`
- `center`
- `tags`
- `recommended_time`
- `visit_period`
- `reason_summary`
- `confidence`
- `source_count`
- `source_note_ids`
- `status`
- `created_at`
- `updated_at`

首版要求：

- `status` 默认为 `auto_extracted`
- 没有真实坐标的节点不能上图
- 坐标来源不明确的节点必须带 `coordinate_status=partial`

### 5.2 Area Mapping

区域节点不是直接旅游点，而是容器节点。

系统要维护：

- `area -> poi_candidates`
- `area -> trend_tags`
- `area -> itinerary_bias`

例如：

- 江汉路
  - 偏夜游、商业街区、拍照、美食
- 东湖
  - 偏白天、湖景、骑行、散步、休闲

## 6. MVP Content Types

首版只聚焦武汉高频旅游内容：

- 景点
- 街区
- 美食区域
- 夜游区域
- 博物馆/文化点
- 城市地标

不做首版重点的内容：

- 酒店推荐
- 远郊小众线路
- 强交通换乘建议
- 季节性大型活动编排

## 7. Backend Architecture

### 7.1 Architecture Summary

后端不是单个“大模型接口”，而是由五层职责组成：

1. `Context Intake Layer`
2. `Content Structuring Layer`
3. `Agent Orchestration Layer`
4. `Itinerary Composition Layer`
5. `Map Projection Layer`

### 7.2 Layer 1: Context Intake Layer

职责：

- 接收前端地图选择结果
- 接收用户偏好
- 统一会话上下文
- 输出标准化请求

输入：

- `thread_id`
- `selected_nodes`
- `trip_days`
- `day_or_night_preference`
- `interest_tags`
- `current_city`
- `map_view_context`

输出：

- `travel_request_context`

推荐实现：

- `FastAPI`
- `Pydantic`

### 7.3 Layer 2: Content Structuring Layer

职责：

- 读取本地武汉内容快照
- 调用 `qwen3.6-plus` 提取候选 POI 和趋势标签
- 形成结构化实体
- 维护抽取状态和来源追踪

内部子模块：

- `note_ingest`
- `trend_summarizer`
- `poi_extractor`
- `poi_normalizer`
- `area_mapper`

关键原则：

- 抽取结果不等于真实事实
- 每个实体必须能追溯到来源笔记

### 7.4 Layer 3: Agent Orchestration Layer

职责：

- 识别用户意图
- 生成 1-2 个追问
- 结合地图上下文与结构化 POI 生成解释和推荐
- 输出最终行程草案

推荐框架：

- `LangGraph` 作为主编排框架
- `qwen3.6-plus` 作为主模型

本层不负责：

- 真实地理渲染
- 前端线路绘制
- 路网导航

建议的 agent 节点：

- `intent_router`
- `clarification_node`
- `poi_selection_node`
- `itinerary_draft_node`
- `explanation_node`
- `response_formatter`

### 7.5 Layer 4: Itinerary Composition Layer

职责：

- 基于已选节点、POI 候选、兴趣偏好组织单一最佳方案
- 控制每日主题和访问节奏
- 保证路线围绕用户选中的区域或点展开

首版特征：

- 规则和模型混合生成
- 不引入复杂约束优化器
- 不保证分钟级时间编排

后续扩展位：

- 可替换为 `OR-Tools` 路径和时间约束优化

### 7.6 Layer 5: Map Projection Layer

职责：

- 把行程结果转成地图前端可消费的节点和线
- 按天组织访问顺序
- 生成访问顺序线

首版只支持：

- `visit_order_polyline`

首版不支持：

- `real_navigation_route`
- `transit_route`
- `walking_route`

## 8. Suggested Backend Modules

建议的后端模块划分如下：

- `api_gateway`
  - 对前端暴露 REST API
- `travel_context_service`
  - 标准化地图上下文和会话请求
- `trend_corpus_service`
  - 管理本地武汉内容快照
- `poi_pipeline_service`
  - POI 抽取、标准化、状态管理
- `poi_registry_service`
  - 结构化 POI 与区域映射存储
- `agent_service`
  - 问答、追问、生成
- `itinerary_service`
  - 行程组织
- `map_route_service`
  - 地图节点和顺序线投影
- `source_registry_service`
  - 数据源状态和来源信息

## 9. API Surface

首版建议 REST 优先。

### 9.1 `POST /api/travel/clarify`

作用：

- 接收地图选点
- 产出 1-2 个追问问题

### 9.2 `POST /api/travel/plan`

作用：

- 根据地图节点和追问答案生成单一最佳方案

### 9.3 `POST /api/poi/extract`

作用：

- 从本地武汉内容快照触发一次抽取任务

### 9.4 `GET /api/poi`

作用：

- 查询结构化 POI

### 9.5 `GET /api/areas`

作用：

- 查询区域节点及其候选 POI 映射

### 9.6 `GET /api/source-status`

作用：

- 返回趋势语料、POI 抽取、地图投影等状态

## 10. Data Source Status Contract

所有网络或批处理相关数据都要暴露统一状态：

- `pending`
- `ready`
- `partial`
- `failed`

建议统一字段：

- `source_id`
- `source_label`
- `status`
- `fetched_at`
- `stale_at`
- `error`
- `coverage_note`
- `provenance`

## 11. Recruitment Mapping

当前招聘要求可以映射为两层：MVP 核心能力和后续扩展能力。

### 11.1 MVP Core Hiring Needs

这部分直接服务首版交付：

- 精通 `Python`
- 熟悉 `FastAPI`
- 能用 `LangChain / LangGraph / LlamaIndex` 组织 agent 和检索
- 能做 `RESTful API`
- 有较好的工程治理能力
  - 代码可维护
  - 接口清晰
  - 可观测
  - 可迭代

### 11.2 Post-MVP Hiring Needs

这部分是二期能力，不应阻塞首版：

- `OR-Tools / PuLP`
  - 用于更强的行程优化
- `LSTM / Transformer`
  - 用于价格、拥挤度、天气影响等预测
- `LoRA / QLoRA`
  - 用于后续领域风格化增强
- `Milvus / PGVector`
  - 首版更推荐 `PGVector` 或轻量检索方案，Milvus 可作为扩展

## 12. Phase Plan

### Phase 1: Wuhan MVP Foundation

目标：

- 打通地图选点
- 建立武汉本地趋势语料层
- 自动抽取候选 POI
- 生成单一最佳武汉方案
- 地图展示访问顺序线

### Phase 2: Quality And Control

目标：

- 增加 POI 去重和别名归一
- 增加更稳定的区域到 POI 映射
- 增加更清晰的不确定性展示
- 增加人工校验入口

### Phase 3: Constraint-Aware Planning

目标：

- 引入预算、体力节奏、同行类型
- 视需要接入 `OR-Tools`

### Phase 4: Predictive And Personalized Travel Agent

目标：

- 引入预测和学习能力
- 扩展到更多城市

## 13. Main Risks

### 13.1 POI Noise Risk

模型自动抽取会带来以下问题：

- 别名重复
- 非景点实体混入
- 情绪化描述被误当实体
- 坐标缺失或坐标错误

缓解方式：

- 强制来源追踪
- 强制状态字段
- 低置信度实体不直接上图或要标记 `partial`

### 13.2 Trend Corpus Bias

本地内容快照可能偏向高热、拍照、情绪传播内容，不代表完整旅游价值。

缓解方式：

- 趋势总结和结构化 POI 分层
- 不把热度等同于推荐优先级

### 13.3 Map Fidelity Gap

当前地图能力还不完整，首版线路只能表达访问顺序，不能表达真实通行路径。

缓解方式：

- 明确标识线路类型为 `visit_order_polyline`

## 14. Decision Summary

本次确定的关键决策如下：

- 试点城市：`武汉`
- 用户场景：`3-5 天单城市深度游`
- 主流程：`地图选点 -> 追问 -> 生成单一最佳方案`
- 地图对象：`POI + 区域/街区`
- 内容重点：`景点讲解 + 美食/街区探索`
- 趋势数据：`本地武汉内容快照`
- 结构化 POI：`模型自动抽取`
- 路线表达：`访问顺序线`
- 个性化强度：`轻个性化`

## 15. Next Document

本设计文档之后，下一份文档建议是：

- `实施计划`
  - 拆成数据流水线、API、agent 编排、地图回写四个子任务
- `后端接口契约`
  - 固化请求和响应结构
