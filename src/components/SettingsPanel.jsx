import { useEffect, useState } from "react";
import {
  configSummary,
  getAmapJsKey,
  getAmapJsSecurityCode,
  getAmapWebKey,
  getQwenApiKey,
  getQwenBaseUrl,
  getQwenModel,
  setAmapJsKey,
  setAmapJsSecurityCode,
  setAmapWebKey,
  setQwenApiKey,
  setQwenBaseUrl,
  setQwenModel,
} from "../appConfig.js";

const HINT_AUTO_HIDE_MS = 10000;

function statusDot(ok) {
  return ok ? "●" : "○";
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(configSummary);
  const [hintVisible, setHintVisible] = useState(true);

  const [qwenKey, setQwenKeyState] = useState(getQwenApiKey);
  const [qwenUrl, setQwenUrlState] = useState(getQwenBaseUrl);
  const [qwenModel, setQwenModelState] = useState(getQwenModel);
  const [amapWeb, setAmapWebState] = useState(getAmapWebKey);
  const [amapJs, setAmapJsState] = useState(getAmapJsKey);
  const [amapJsCode, setAmapJsCodeState] = useState(getAmapJsSecurityCode);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSaved(false);
      setHintVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (!hintVisible) return;
    const timer = window.setTimeout(() => setHintVisible(false), HINT_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [hintVisible]);

  const handleSave = () => {
    setQwenApiKey(qwenKey);
    setQwenBaseUrl(qwenUrl);
    setQwenModel(qwenModel);
    setAmapWebKey(amapWeb);
    setAmapJsKey(amapJs);
    setAmapJsSecurityCode(amapJsCode);
    setSummary(configSummary());
    setSaved(true);
  };

  const qwenOk = summary.qwen;
  const amapOk = summary.amap;
  const allOk = qwenOk && amapOk;

  return (
    <>
      {/* ── Button row (gear + hint) ───────────────────────────── */}
      {!open && (
        <div className="settings-entry">
          {hintVisible && !allOk && (
            <div className="agent-chat-hint settings-hint" aria-live="polite">
              <span>点击这里，配置 Qwen 和高德 API Key</span>
            </div>
          )}

          <button
            type="button"
            className="settings-gear"
            onClick={() => setOpen(true)}
            aria-label="打开 API 配置面板"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="settings-gear-label">API 配置</span>
            <span className="settings-gear-status">
              <i className={qwenOk ? "is-on" : "is-off"}>{statusDot(qwenOk)}</i>
              <i className={amapOk ? "is-on" : "is-off"}>{statusDot(amapOk)}</i>
            </span>
          </button>
        </div>
      )}

      {/* ── Settings card ──────────────────────────────────────── */}
      {open && (
        <div className="settings-card">
          <header className="settings-card-header">
            <strong>API 配置</strong>
            <span className="settings-card-badge">
              {allOk ? "✓ 全部就绪" : "未配置"}
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭">✕</button>
          </header>

          <p className="settings-intro">
            {allOk
              ? "以下 API Key 已配置完毕。如需更换，直接修改后保存即可。"
              : "请自行获取并填写以下 API Key。Qwen Key 可从阿里云百炼获取，高德 Key 可从高德开放平台获取。所有 Key 仅存储在浏览器本地。"}
          </p>

          {/* Qwen section */}
          <fieldset className={`settings-group ${!qwenOk ? "is-needed" : ""}`}>
            <legend>
              <span className={`settings-dot ${qwenOk ? "is-on" : "is-off"}`}>
                {statusDot(qwenOk)}
              </span>
              Qwen LLM（聊天与规划）
              {!qwenOk && <em className="settings-tag">必需</em>}
            </legend>
            <label>
              <strong>API Key *</strong>
              <input
                type="password"
                value={qwenKey}
                onChange={(e) => setQwenKeyState(e.target.value)}
                placeholder="sk-..."
              />
            </label>
            <label>
              <strong>Base URL</strong>
              <input
                type="text"
                value={qwenUrl}
                onChange={(e) => setQwenUrlState(e.target.value)}
                placeholder="例如：https://dashscope.aliyuncs.com/compatible-mode/v1"
              />
            </label>
            <label>
              <strong>Model</strong>
              <input
                type="text"
                value={qwenModel}
                onChange={(e) => setQwenModelState(e.target.value)}
                placeholder="例如：qwen-max 或 qwen-plus"
              />
            </label>
            <a
              className="settings-link"
              href="https://bailian.console.aliyun.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              → 前往阿里云百炼获取 Qwen API Key
            </a>
          </fieldset>

          {/* Amap section */}
          <fieldset className={`settings-group ${!amapOk ? "is-needed" : ""}`}>
            <legend>
              <span className={`settings-dot ${amapOk ? "is-on" : "is-off"}`}>
                {statusDot(amapOk)}
              </span>
              高德地图（搜索与细节地图）
              {!amapOk && <em className="settings-tag">必需</em>}
            </legend>
            <label>
              <strong>Web Service Key *</strong>
              <input
                type="password"
                value={amapWeb}
                onChange={(e) => setAmapWebState(e.target.value)}
                placeholder="高德 Web 服务 Key"
              />
            </label>
            <label>
              <strong>JS API Key</strong>
              <input
                type="password"
                value={amapJs}
                onChange={(e) => setAmapJsState(e.target.value)}
                placeholder="可与 Web Key 相同"
              />
            </label>
            <label>
              <strong>JS 安全密钥</strong>
              <input
                type="text"
                value={amapJsCode}
                onChange={(e) => setAmapJsCodeState(e.target.value)}
                placeholder="新版高德 key 需填写（可选）"
              />
            </label>
            <a
              className="settings-link"
              href="https://console.amap.com/dev/index"
              target="_blank"
              rel="noopener noreferrer"
            >
              → 前往高德开放平台获取地图 Key
            </a>
          </fieldset>

          <div className="settings-actions">
            <button type="button" onClick={handleSave}>保存配置</button>
            {saved && <span className="settings-saved">✓ 已保存，刷新页面生效</span>}
          </div>

          <p className="settings-note">
            配置仅存储在浏览器本地。如果你在 backend/.env 中已设置，无需重复填写。
          </p>
        </div>
      )}
    </>
  );
}
