# Wuhan Travel Agent API Contract

**Date:** 2026-06-09

## 1. Scope

本契约定义武汉旅游 agent MVP 的后端接口。

目标：

- 接收地图选点和轻个性化偏好
- 返回追问问题
- 返回单一最佳行程方案
- 返回地图可绘制的访问顺序线
- 返回显式来源状态和不确定性说明

首版接口风格：

- `REST`
- `JSON`
- UTF-8

## 2. Common Rules

### 2.1 City Scope

首版仅支持：

- `current_city = "wuhan"`

### 2.2 Source Status Enum

所有批处理、抽取、生成相关来源统一使用：

- `pending`
- `ready`
- `partial`
- `failed`

### 2.3 Node Type Enum

地图节点统一使用：

- `poi`
- `area`

### 2.4 Route Type Enum

首版仅支持：

- `visit_order_polyline`

### 2.5 Uncertainty Rules

以下内容必须显式暴露：

- 自动抽取 POI
- 坐标不完整节点
- 趋势总结来源于本地内容快照
- 任何失败或部分成功状态

## 3. Shared Object Shapes

### 3.1 `SelectedNode`

```json
{
  "id": "donghu",
  "name": "东湖",
  "node_type": "area",
  "center": [114.419, 30.56]
}
```

字段说明：

- `id`: 后端可识别节点 ID
- `name`: 展示名称
- `node_type`: `poi | area`
- `center`: `[lon, lat]`，允许为空，但为空时后端不能把它直接投影到地图线上

### 3.2 `SourceStatus`

```json
{
  "source_id": "wuhan-note-corpus",
  "source_label": "Local Wuhan Note Snapshot",
  "status": "ready",
  "fetched_at": "2026-06-09T21:30:00Z",
  "stale_at": null,
  "error": "",
  "coverage_note": "Using local Wuhan note snapshot only",
  "provenance": "E:\\agent\\MediaCrawler\\data_wuhan\\xhs\\jsonl"
}
```

### 3.3 `PoiCard`

```json
{
  "id": "donghu",
  "name": "东湖",
  "node_type": "area",
  "category": "lake",
  "district": "武昌区",
  "center": [114.419, 30.56],
  "coordinate_status": "verified_seed",
  "tags": ["湖景", "散步", "骑行"],
  "reason_summary": "武汉高频出现的休闲区域，适合白天散步和湖边活动。",
  "recommended_time": "",
  "visit_period": "day",
  "confidence": 0.84,
  "source_count": 6,
  "source_note_ids": ["note-1", "note-2"],
  "status": "auto_extracted"
}
```

### 3.4 `Uncertainty`

```json
{
  "level": "partial",
  "message": "部分 POI 由本地笔记自动抽取，只有 seed 节点带已验证坐标。",
  "items": [
    "趋势总结不代表官方营业信息",
    "未验证坐标节点不会进入地图线路"
  ]
}
```

### 3.5 `RouteDay`

```json
{
  "day": 1,
  "route_type": "visit_order_polyline",
  "coordinates": [
    [114.419, 30.56],
    [114.305, 30.547],
    [114.291, 30.581]
  ]
}
```

## 4. `POST /api/travel/clarify`

### 4.1 Purpose

接收地图选中的 `1-3` 个节点和基础偏好，返回首轮追问问题。

### 4.2 Request

```json
{
  "thread_id": "thread-wuhan-001",
  "current_city": "wuhan",
  "selected_nodes": [
    {
      "id": "donghu",
      "name": "东湖",
      "node_type": "area",
      "center": [114.419, 30.56]
    },
    {
      "id": "jianghan-road",
      "name": "江汉路",
      "node_type": "area",
      "center": [114.291, 30.581]
    }
  ],
  "trip_days": 3,
  "day_or_night_preference": "balanced",
  "interest_tags": ["sightseeing", "food", "street"]
}
```

### 4.3 Validation

- `thread_id` required
- `current_city` must equal `wuhan`
- `selected_nodes.length` must be `1-3`
- `trip_days` must be `3-5`
- `interest_tags.length >= 1`

### 4.4 Response

```json
{
  "thread_id": "thread-wuhan-001",
  "selected_nodes": [
    {
      "id": "donghu",
      "name": "东湖",
      "node_type": "area",
      "center": [114.419, 30.56]
    },
    {
      "id": "jianghan-road",
      "name": "江汉路",
      "node_type": "area",
      "center": [114.291, 30.581]
    }
  ],
  "follow_up_questions": [
    {
      "id": "trip_days_confirm",
      "label": "这次想玩几天？",
      "type": "single_select",
      "options": ["3", "4", "5"]
    },
    {
      "id": "time_bias",
      "label": "你更偏白天景点还是夜游逛吃？",
      "type": "single_select",
      "options": ["day", "night", "balanced"]
    }
  ],
  "source_status": [
    {
      "source_id": "travel-clarifier",
      "source_label": "Travel Clarifier",
      "status": "ready",
      "fetched_at": "2026-06-09T21:40:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Clarification generated from map context only",
      "provenance": "backend-rule-and-llm"
    }
  ],
  "uncertainty": {
    "level": "ready",
    "message": "当前仅生成追问问题，尚未输出正式行程。",
    "items": []
  }
}
```

## 5. `POST /api/travel/plan`

### 5.1 Purpose

根据地图节点、基础偏好和追问答案，返回单一最佳武汉行程方案和地图顺序线。

### 5.2 Request

```json
{
  "thread_id": "thread-wuhan-001",
  "current_city": "wuhan",
  "selected_nodes": [
    {
      "id": "donghu",
      "name": "东湖",
      "node_type": "area",
      "center": [114.419, 30.56]
    },
    {
      "id": "jianghan-road",
      "name": "江汉路",
      "node_type": "area",
      "center": [114.291, 30.581]
    }
  ],
  "trip_days": 3,
  "day_or_night_preference": "balanced",
  "interest_tags": ["sightseeing", "food", "street"],
  "answers": {
    "trip_days_confirm": "3",
    "time_bias": "balanced"
  }
}
```

### 5.3 Response

```json
{
  "thread_id": "thread-wuhan-001",
  "answer": "这条路线先把东湖和武昌片区放在前两天，最后再切到江汉路和江滩，兼顾白天景点和夜游氛围。",
  "selected_reasoning": "用户先选了东湖和江汉路，系统围绕湖景白天活动与夜游街区组织三天节奏。",
  "itinerary": {
    "title": "武汉 3 天经典湖景与夜游路线",
    "days": [
      {
        "day": 1,
        "summary": "东湖与湖边放松",
        "nodes": ["donghu", "lingbomen", "chuhe-hanjie"]
      },
      {
        "day": 2,
        "summary": "武昌地标与城市风景",
        "nodes": ["yellow-crane-tower", "qingchuan-ge", "wuchang-riverside"]
      },
      {
        "day": 3,
        "summary": "江汉路与夜游收尾",
        "nodes": ["jianghan-road", "hankou-riverside", "jianghan-pass"]
      }
    ]
  },
  "map_route_days": [
    {
      "day": 1,
      "route_type": "visit_order_polyline",
      "coordinates": [
        [114.419, 30.56],
        [114.433, 30.548],
        [114.347, 30.561]
      ]
    },
    {
      "day": 2,
      "route_type": "visit_order_polyline",
      "coordinates": [
        [114.306, 30.547],
        [114.292, 30.549],
        [114.303, 30.544]
      ]
    },
    {
      "day": 3,
      "route_type": "visit_order_polyline",
      "coordinates": [
        [114.291, 30.581],
        [114.303, 30.585],
        [114.289, 30.58]
      ]
    }
  ],
  "poi_cards": [
    {
      "id": "donghu",
      "name": "东湖",
      "node_type": "area",
      "category": "lake",
      "district": "武昌区",
      "center": [114.419, 30.56],
      "coordinate_status": "verified_seed",
      "tags": ["湖景", "散步", "骑行"],
      "reason_summary": "武汉最适合白天铺开的休闲区域之一。",
      "recommended_time": "",
      "visit_period": "day",
      "confidence": 0.84,
      "source_count": 6,
      "source_note_ids": ["note-1", "note-2"],
      "status": "auto_extracted"
    }
  ],
  "source_status": [
    {
      "source_id": "wuhan-note-corpus",
      "source_label": "Local Wuhan Note Snapshot",
      "status": "ready",
      "fetched_at": "2026-06-09T21:30:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Trend and POI extraction based on local note snapshot",
      "provenance": "E:\\agent\\MediaCrawler\\data_wuhan\\xhs\\jsonl"
    },
    {
      "source_id": "wuhan-seed-nodes",
      "source_label": "Wuhan Seed Nodes",
      "status": "ready",
      "fetched_at": "2026-06-09T21:35:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Only seed-backed nodes can be projected to the map",
      "provenance": "backend/data/wuhan_seed_nodes.json"
    }
  ],
  "uncertainty": {
    "level": "partial",
    "message": "部分 POI 由本地笔记自动抽取，只有 seed 节点带已验证坐标。",
    "items": [
      "趋势总结不代表官方营业信息",
      "未验证坐标节点不会进入地图线路"
    ]
  },
  "follow_up_questions": []
}
```

## 6. `POST /api/poi/extract`

### 6.1 Purpose

触发一次从本地武汉内容快照抽取趋势和候选 POI 的任务。

### 6.2 Request

```json
{
  "city": "wuhan",
  "source_paths": [
    "E:\\agent\\MediaCrawler\\data_wuhan\\xhs\\jsonl\\search_contents_2026-06-09.jsonl",
    "E:\\agent\\MediaCrawler\\data_wuhan_detail\\xhs\\jsonl\\detail_contents_2026-06-09.jsonl"
  ]
}
```

### 6.3 Response

```json
{
  "city": "wuhan",
  "job_status": "ready",
  "notes_loaded": 120,
  "pois_extracted": 48,
  "pois_seed_matched": 19,
  "pois_coordinate_partial": 29,
  "source_status": [
    {
      "source_id": "poi-extractor",
      "source_label": "Qwen POI Extractor",
      "status": "ready",
      "fetched_at": "2026-06-09T22:10:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Extraction completed from local Wuhan notes",
      "provenance": "qwen3.6-plus"
    }
  ]
}
```

## 7. `GET /api/poi`

### 7.1 Purpose

查询结构化 POI 列表。

### 7.2 Query Params

- `city=wuhan`
- `node_type=poi|area` optional
- `status=auto_extracted` optional
- `mapped_only=true|false` optional

### 7.3 Response

```json
{
  "items": [
    {
      "id": "donghu",
      "name": "东湖",
      "node_type": "area",
      "category": "lake",
      "district": "武昌区",
      "center": [114.419, 30.56],
      "coordinate_status": "verified_seed",
      "tags": ["湖景", "散步", "骑行"],
      "reason_summary": "武汉高频出现的湖景放松区域。",
      "confidence": 0.84,
      "source_count": 6,
      "source_note_ids": ["note-1", "note-2"],
      "status": "auto_extracted"
    }
  ],
  "total": 1
}
```

## 8. `GET /api/source-status`

### 8.1 Purpose

返回当前数据层和生成层的来源状态。

### 8.2 Response

```json
{
  "items": [
    {
      "source_id": "wuhan-note-corpus",
      "source_label": "Local Wuhan Note Snapshot",
      "status": "ready",
      "fetched_at": "2026-06-09T21:30:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Trend corpus is available",
      "provenance": "local-jsonl"
    },
    {
      "source_id": "wuhan-seed-nodes",
      "source_label": "Wuhan Seed Nodes",
      "status": "partial",
      "fetched_at": "2026-06-09T21:35:00Z",
      "stale_at": null,
      "error": "",
      "coverage_note": "Only part of extracted nodes have verified coordinates",
      "provenance": "backend/data/wuhan_seed_nodes.json"
    }
  ]
}
```

## 9. Error Contract

### 9.1 Validation Error

HTTP `422`

```json
{
  "detail": [
    {
      "loc": ["body", "selected_nodes"],
      "msg": "List should have at least 1 item after validation, not 0",
      "type": "too_short"
    }
  ]
}
```

### 9.2 Source Failure

HTTP `200` is allowed if the overall request completes but a source is partial or failed. In that case, `source_status` and `uncertainty` must show it.

Example:

```json
{
  "source_status": [
    {
      "source_id": "poi-extractor",
      "source_label": "Qwen POI Extractor",
      "status": "failed",
      "fetched_at": "2026-06-09T22:10:00Z",
      "stale_at": null,
      "error": "Qwen completion timed out",
      "coverage_note": "No new POI extraction output",
      "provenance": "qwen3.6-plus"
    }
  ],
  "uncertainty": {
    "level": "failed",
    "message": "本次未完成新的候选 POI 抽取，结果可能依赖旧缓存或 seed 节点。",
    "items": ["抽取失败未自动切换到其他 provider"]
  }
}
```

## 10. Frontend Consumption Notes

前端必须做到：

- 显示 `source_status`
- 显示 `uncertainty`
- 对 `status=auto_extracted` 的 POI 加明显标识
- 只把带 `center` 的节点参与地图投影
- 把 `map_route_days[].coordinates` 视作访问顺序线，不当作导航路径

## 11. Non-Goals In This Contract

本契约暂不覆盖：

- 实时导航
- 酒店预订
- 票务
- 实时营业时间
- 实时天气
- 跨城市联游
