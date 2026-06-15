import { useCallback, useEffect, useRef, useState } from "react";
import { getQwenApiKey, getQwenBaseUrl, getQwenModel } from "../appConfig.js";

const API_BASE =
  import.meta.env.VITE_TRAVEL_AGENT_API_BASE || "http://127.0.0.1:8000/api";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "你好！我是 DragonAtlas3D 旅行助手 🐉\n\n" +
    "我可以帮你解答武汉旅行的问题——景点推荐、美食攻略、路线建议，都可以问我。\n\n" +
    "试试说：「黄鹤楼附近有什么好吃的？」",
};

const HINT_AUTO_HIDE_MS = 8000;

function formatTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildContext({ viewport, selectedNodes, itinerarySummary }) {
  return {
    current_city: viewport?.node?.fullName || viewport?.node?.name || "wuhan",
    active_pois: (selectedNodes || []).map((n) => n.name),
    itinerary_summary: itinerarySummary || "",
  };
}

export function AgentChat({ viewport, selectedNodes, itinerarySummary }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [hintVisible, setHintVisible] = useState(true);

  // ── Draggable state ──────────────────────────────────────────
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ w: 340, h: 420 });
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const sizeStart = useRef({ w: 340, h: 420 });
  const panelRef = useRef(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  // ── Auto-hide hint after timeout ─────────────────────────────
  useEffect(() => {
    if (!hintVisible) return;
    const timer = window.setTimeout(() => setHintVisible(false), HINT_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [hintVisible]);

  // Dismiss hint on first interaction
  const dismissHint = useCallback(() => {
    setHintVisible(false);
  }, []);

  // ── Auto-scroll to bottom on new messages ────────────────────
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Focus input when panel opens ─────────────────────────────
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // ── Drag handlers ────────────────────────────────────────────
  const handleDragStart = useCallback(
    (clientX, clientY) => {
      dragging.current = true;
      dragStart.current = { x: clientX, y: clientY };
      posStart.current = { x: panelPos.x, y: panelPos.y };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    },
    [panelPos],
  );

  const handleDragMove = useCallback((clientX, clientY) => {
    if (!dragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setPanelPos({
      x: posStart.current.x + dx,
      y: posStart.current.y + dy,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragging.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  // ── Resize handlers ──────────────────────────────────────────
  const handleResizeStart = useCallback(
    (clientX, clientY) => {
      resizing.current = true;
      dragStart.current = { x: clientX, y: clientY };
      sizeStart.current = { w: panelSize.w, h: panelSize.h };
      document.body.style.userSelect = "none";
    },
    [panelSize],
  );

  const handleResizeMove = useCallback((clientX, clientY) => {
    if (!resizing.current) return;
    setPanelSize({
      w: Math.max(260, Math.min(800, sizeStart.current.w + (clientX - dragStart.current.x))),
      h: Math.max(280, Math.min(900, sizeStart.current.h + (clientY - dragStart.current.y))),
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizing.current = false;
    document.body.style.userSelect = "";
  }, []);

  const onHeaderMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      dismissHint();
      handleDragStart(e.clientX, e.clientY);
    },
    [handleDragStart, dismissHint],
  );

  const onHeaderTouchStart = useCallback(
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      dismissHint();
      handleDragStart(touch.clientX, touch.clientY);
    },
    [handleDragStart, dismissHint],
  );

  useEffect(() => {
    const onMove = (e) => {
      if (e.touches) {
        const touch = e.touches[0];
        if (touch) {
          handleDragMove(touch.clientX, touch.clientY);
          handleResizeMove(touch.clientX, touch.clientY);
        }
      } else {
        handleDragMove(e.clientX, e.clientY);
        handleResizeMove(e.clientX, e.clientY);
      }
    };
    const onEnd = () => {
      handleDragEnd();
      handleResizeEnd();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  // ── Send message ─────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage = { role: "user", content: text, time: formatTime() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: "chat-" + Date.now(),
          message: text,
          context: buildContext({ viewport, selectedNodes, itinerarySummary }),
          qwen_api_key: getQwenApiKey(),
          qwen_base_url: getQwenBaseUrl(),
          qwen_model: getQwenModel(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "收到你的消息了，但我暂时无法给出具体回答。",
          time: formatTime(),
          sourceStatus: data.source_status,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat request failed";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "抱歉，连接旅行助手失败。请确认后端服务已启动。",
          time: formatTime(),
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpen = () => {
    dismissHint();
    setOpen(true);
  };

  const panelStyle = {
    width: panelSize.w,
    height: panelSize.h,
    ...(panelPos.x || panelPos.y
      ? { left: panelPos.x, top: panelPos.y, right: "auto", bottom: "auto" }
      : {}),
  };

  return (
    <>
      {/* ── Collapsed bubble + hint ──────────────────────────────── */}
      {!open && (
        <div className="agent-chat-bubble-wrap">
          {hintVisible && (
            <div className="agent-chat-hint" aria-live="polite">
              <span className="agent-chat-hint-arrow" />
              <span>点击这里，和我聊聊武汉旅行 🐉</span>
            </div>
          )}
          <button
            type="button"
            className="agent-chat-bubble"
            onClick={handleOpen}
            aria-label="打开旅行助手聊天"
            title="与旅行助手对话"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="14" y2="13" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Expanded draggable panel ─────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          className="agent-chat-panel"
          style={panelStyle}
          role="dialog"
          aria-label="旅行助手聊天面板"
        >
          {/* Header — draggable handle */}
          <header
            className="agent-chat-header"
            onMouseDown={onHeaderMouseDown}
            onTouchStart={onHeaderTouchStart}
          >
            <div className="agent-chat-header-left">
              <span className="agent-chat-avatar">🐉</span>
              <div>
                <strong>DragonAtlas3D 旅行助手</strong>
                <small>拖拽标题栏可移动 · 武汉旅行专家</small>
              </div>
            </div>
            <button
              type="button"
              className="agent-chat-close"
              onClick={() => setOpen(false)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="关闭聊天"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          {/* Messages */}
          <div className="agent-chat-list" ref={listRef}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`agent-chat-msg ${
                  msg.role === "user" ? "is-user" : "is-assistant"
                } ${msg.error ? "is-error" : ""}`}
              >
                <div className="agent-chat-bubble-body">
                  <p>{msg.content}</p>
                  {msg.time && <time>{msg.time}</time>}
                </div>
                {msg.sourceStatus && msg.sourceStatus.length > 0 && (
                  <div className="agent-chat-status">
                    {msg.sourceStatus.map((s) => (
                      <span key={s.source_id} className={`agent-chat-status-dot is-${s.status}`} title={s.error || s.coverage_note} />
                    ))}
                    <span className="agent-chat-status-text">
                      {msg.sourceStatus.map((s) => s.source_label).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="agent-chat-msg is-assistant">
                <div className="agent-chat-bubble-body">
                  <span className="agent-chat-typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="agent-chat-msg is-error">
                <div className="agent-chat-bubble-body">
                  <p>{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            className="agent-chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入旅行问题…"
              rows={1}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()}>
              {sending ? (
                <span className="agent-chat-spinner" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>

          {/* Resize handle — bottom-right corner */}
          <div
            className="agent-chat-resize-handle"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleResizeStart(e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (touch) {
                e.preventDefault();
                e.stopPropagation();
                handleResizeStart(touch.clientX, touch.clientY);
              }
            }}
            aria-label="拖拽调整面板大小"
          />
        </div>
      )}
    </>
  );
}
