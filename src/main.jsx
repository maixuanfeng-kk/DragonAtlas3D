import { preconnect, prefetchDNS } from "react-dom";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/detail-map.css";
import "./styles/map.css";
import "./styles/panels.css";
import "./styles/responsive.css";
import "./travel-planner.css";
import "./styles/agent-chat.css";
import "./styles/settings.css";
import App from "./App.jsx";

[
  "https://geo.datav.aliyun.com",
  "https://s3.amazonaws.com",
  "https://server.arcgisonline.com",
  "https://restapi.amap.com",
  "https://webapi.amap.com",
  "https://cdn.jsdelivr.net",
].forEach((origin) => {
  prefetchDNS(origin);
  preconnect(origin);
});

createRoot(document.getElementById("root")).render(<App />);
