import { useEffect, useRef, useState } from "react";
import * as mars3d from "mars3d";
import { Cesium } from "mars3d";

const DEFAULT_VIEW = {
  lng: 104.85,
  lat: 35.45,
  alt: 6200000,
  heading: 6,
  pitch: -61,
};

const CITY_ALTITUDE = 278000;
const CITY_GLOW_ALTITUDE = 274000;
const TELEMETRY_INTERVAL = 140;

const FEATURED_CITY_NAMES = new Set([
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "南京",
  "成都",
  "重庆",
  "武汉",
  "西安",
  "长沙",
  "郑州",
  "青岛",
  "厦门",
  "昆明",
  "哈尔滨",
  "沈阳",
  "苏州",
  "福州",
  "南宁",
  "贵阳",
  "乌鲁木齐",
  "拉萨",
  "海口",
]);

const INITIAL_TELEMETRY = {
  focusName: "中国全域",
  mapLevel: "3.6",
  mapCenter: `${DEFAULT_VIEW.lng.toFixed(2)}°, ${DEFAULT_VIEW.lat.toFixed(2)}°`,
  cameraHeight: "6200 km",
};

const INITIAL_STATS = {
  provinceCount: 0,
  cityCount: 0,
  featuredCount: 0,
};

function shortName(name) {
  return name
    .replace("特别行政区", "")
    .replace("维吾尔自治区", "")
    .replace("壮族自治区", "")
    .replace("回族自治区", "")
    .replace("自治区", "")
    .replace("自治州", "")
    .replace("地区", "")
    .replace("盟", "")
    .replace("省", "")
    .replace("市", "");
}

function formatCenter(center) {
  return `${center.lng.toFixed(2)}°, ${center.lat.toFixed(2)}°`;
}

function formatHeight(altitudeMeters) {
  return `${(altitudeMeters / 1000).toFixed(0)} km`;
}

function isValidCenter(center) {
  return (
    Array.isArray(center) &&
    center.length === 2 &&
    Number.isFinite(center[0]) &&
    Number.isFinite(center[1])
  );
}

function buildCityModels(cityPayload) {
  const featuredProvinceSet = new Set();

  return cityPayload.cities
    .filter((city) => city.name && isValidCenter(city.center))
    .map((city) => {
      const normalizedName = shortName(city.name);
      const featured =
        city.level === "province-city" ||
        FEATURED_CITY_NAMES.has(normalizedName) ||
        (!featuredProvinceSet.has(city.province) &&
          featuredProvinceSet.add(city.province));

      return {
        ...city,
        shortName: normalizedName,
        featured,
        priority: city.level === "province-city" ? 3 : featured ? 2 : 1,
      };
    });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} 加载失败: ${response.status}`);
  }
  return response.json();
}

function createCountryPedestalLayer(chinaOutline) {
  return new mars3d.layer.GeoJsonLayer({
    data: chinaOutline,
    name: "ChinaPedestal",
    symbol: {
      styleOptions: {
        color: "#112734",
        opacity: 0.98,
        diffHeight: 238000,
        outline: true,
        outlineColor: "#ffd9a4",
        outlineOpacity: 0.16,
        outlineWidth: 2,
        clampToGround: false,
      },
    },
  });
}

function createProvinceLayer(provinces) {
  return new mars3d.layer.GeoJsonLayer({
    data: provinces,
    name: "ProvinceDeck",
    symbol: {
      styleOptions: {
        color: "#e8dcc7",
        opacity: 0.96,
        addHeight: 236000,
        diffHeight: 36000,
        outline: true,
        outlineColor: "#fff6e0",
        outlineOpacity: 0.66,
        outlineWidth: 1,
        clampToGround: false,
        highlight: {
          color: "#f7cf8e",
          opacity: 1,
          outlineColor: "#fffbea",
          outlineOpacity: 1,
        },
        label: {
          text: "{name}",
          position: "center",
          addHeight: 42000,
          font_family: '"Noto Sans SC", sans-serif',
          font_size: 20,
          font_weight: "700",
          color: "#fff8ea",
          outline: true,
          outlineColor: "#0a131a",
          outlineWidth: 4,
          visibleDepth: false,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: true,
          scaleByDistance_near: 600000,
          scaleByDistance_nearValue: 1,
          scaleByDistance_far: 8000000,
          scaleByDistance_farValue: 0.45,
          distanceDisplayCondition: true,
          distanceDisplayCondition_near: 0,
          distanceDisplayCondition_far: 8000000,
          showAll: false,
        },
      },
    },
  });
}

function createCityLayer(cityModels) {
  const layer = new mars3d.layer.GraphicLayer({ name: "CityNodes" });

  cityModels.forEach((city) => {
    if (city.featured) {
      layer.addGraphic(
        new mars3d.graphic.CircleEntity({
          position: city.center,
          attr: city,
          style: {
            radius: city.priority >= 3 ? 120000 : 88000,
            addHeight: CITY_GLOW_ALTITUDE,
            color: "#63f4d3",
            opacity: city.priority >= 3 ? 0.08 : 0.05,
            outline: true,
            outlineColor: "#ffe2a6",
            outlineOpacity: 0.5,
            outlineWidth: 1,
            clampToGround: false,
            distanceDisplayCondition: true,
            distanceDisplayCondition_near: 0,
            distanceDisplayCondition_far: 9000000,
          },
        }),
      );
    }

    layer.addGraphic(
      new mars3d.graphic.PointEntity({
        position: city.center,
        attr: city,
        style: {
          pixelSize: city.featured ? 8 : 3.4,
          addHeight: CITY_ALTITUDE,
          color: city.featured ? "#fff8d9" : "#f8f4ea",
          opacity: city.featured ? 1 : 0.82,
          outline: city.featured,
          outlineColor: city.priority >= 3 ? "#63f4d3" : "#ffe2a6",
          outlineWidth: city.featured ? 2 : 0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: true,
          scaleByDistance_near: 400000,
          scaleByDistance_nearValue: 1.15,
          scaleByDistance_far: 8500000,
          scaleByDistance_farValue: 0.55,
          label: {
            text: city.shortName,
            addHeight: 8000,
            font_family: '"Noto Sans SC", sans-serif',
            font_size: city.priority >= 3 ? 22 : city.featured ? 17 : 12,
            font_weight: city.featured ? "700" : "600",
            color: city.featured ? "#fef8e8" : "#f0ede4",
            outline: true,
            outlineColor: "#081118",
            outlineWidth: city.featured ? 4 : 3,
            hasPixelOffset: true,
            pixelOffsetY: city.featured ? -28 : -18,
            visibleDepth: false,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: true,
            scaleByDistance_near: 400000,
            scaleByDistance_nearValue: 1,
            scaleByDistance_far: city.featured ? 8000000 : 2600000,
            scaleByDistance_farValue: city.featured ? 0.6 : 0.24,
            distanceDisplayCondition: true,
            distanceDisplayCondition_near: 0,
            distanceDisplayCondition_far: city.featured ? 8000000 : 2600000,
          },
        },
      }),
    );
  });

  return layer;
}

function getProvincePayload(rawProvinces) {
  return {
    ...rawProvinces,
    features: rawProvinces.features.filter(
      (feature) =>
        feature.properties?.level === "province" &&
        feature.properties?.name &&
        feature.geometry,
    ),
  };
}

export default function App() {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const hoverFocusRef = useRef("中国全域");
  const telemetryTimerRef = useRef(null);
  const lastTelemetryAtRef = useRef(0);
  const telemetryValueRef = useRef(INITIAL_TELEMETRY);
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;

    const commitTelemetry = () => {
      telemetryTimerRef.current = null;
      lastTelemetryAtRef.current = performance.now();

      if (!mapRef.current) {
        return;
      }

      const center = mapRef.current.getCenter();
      const height = mapRef.current.camera.positionCartographic?.height ?? DEFAULT_VIEW.alt;
      const nextTelemetry = {
        focusName: hoverFocusRef.current,
        mapLevel: mapRef.current.level.toFixed(1),
        mapCenter: center ? formatCenter(center) : INITIAL_TELEMETRY.mapCenter,
        cameraHeight: formatHeight(height),
      };

      const current = telemetryValueRef.current;
      if (
        current.focusName === nextTelemetry.focusName &&
        current.mapLevel === nextTelemetry.mapLevel &&
        current.mapCenter === nextTelemetry.mapCenter &&
        current.cameraHeight === nextTelemetry.cameraHeight
      ) {
        return;
      }

      telemetryValueRef.current = nextTelemetry;
      setTelemetry(nextTelemetry);
    };

    const scheduleTelemetry = (immediate = false) => {
      if (immediate) {
        if (telemetryTimerRef.current !== null) {
          window.clearTimeout(telemetryTimerRef.current);
        }
        commitTelemetry();
        return;
      }

      if (telemetryTimerRef.current !== null) {
        return;
      }

      const waitTime = Math.max(
        0,
        TELEMETRY_INTERVAL - (performance.now() - lastTelemetryAtRef.current),
      );

      telemetryTimerRef.current = window.setTimeout(commitTelemetry, waitTime);
    };

    async function init() {
      try {
        const [outlineRaw, provincesRaw, citiesRaw] = await Promise.all([
          loadJson("/data/china-outline.json"),
          loadJson("/data/china-provinces.json"),
          loadJson("/data/china-cities.json"),
        ]);

        if (disposed) {
          return;
        }

        const provinces = getProvincePayload(provincesRaw);
        const cityModels = buildCityModels(citiesRaw);
        const featuredCount = cityModels.filter((city) => city.featured).length;

        setStats({
          provinceCount: provinces.features.length,
          cityCount: cityModels.length,
          featuredCount,
        });

        const map = new mars3d.Map(mapNodeRef.current, {
          scene: {
            center: DEFAULT_VIEW,
            backgroundColor: "#071118",
            showSkyBox: false,
            showSun: false,
            showMoon: false,
            showSkyAtmosphere: false,
            fog: false,
            fxaa: true,
            highDynamicRange: false,
            logarithmicDepthBuffer: true,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            contextOptions: {
              webgl: {
                alpha: false,
                antialias: true,
                preserveDrawingBuffer: false,
                powerPreference: "high-performance",
              },
            },
            globe: {
              show: true,
              baseColor: "#071118",
              showGroundAtmosphere: false,
              enableLighting: false,
              showWaterEffect: false,
              showSkirts: false,
              depthTestAgainstTerrain: false,
              maximumScreenSpaceError: 4,
              tileCacheSize: 256,
            },
            cameraController: {
              minimumZoomDistance: 1200000,
              maximumZoomDistance: 14000000,
              zoomFactor: 2.3,
              enableCollisionDetection: false,
            },
          },
          basemaps: [],
          terrain: false,
          control: {
            baseLayerPicker: false,
            homeButton: false,
            sceneModePicker: false,
            fullscreenButton: false,
            vrButton: false,
            geocoder: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            infoBox: false,
            selectionIndicator: false,
          },
          mouse: {
            removeDblClick: true,
          },
        });

        mapRef.current = map;
        window.__dragonMarsMap = map;
        map.fixedLight = true;

        const countryPedestalLayer = createCountryPedestalLayer(outlineRaw);
        const provinceLayer = createProvinceLayer(provinces);
        const cityLayer = createCityLayer(cityModels);

        map.addLayer(countryPedestalLayer);
        map.addLayer(provinceLayer);
        map.addLayer(cityLayer);

        provinceLayer.on(mars3d.EventType.mouseOver, (event) => {
          const provinceName = event.graphic?.attr?.name;
          hoverFocusRef.current = provinceName || "中国省域";
          scheduleTelemetry(true);
        });

        provinceLayer.on(mars3d.EventType.mouseOut, () => {
          hoverFocusRef.current = "中国全域";
          scheduleTelemetry(true);
        });

        provinceLayer.on(mars3d.EventType.click, (event) => {
          const center = event.graphic?.attr?.center;
          if (!isValidCenter(center)) {
            return;
          }

          map.setCameraView(
            {
              lng: center[0],
              lat: center[1],
              alt: 2800000,
              heading: 10,
              pitch: -58,
            },
            {
              duration: 1.2,
            },
          );
        });

        cityLayer.on(mars3d.EventType.mouseOver, (event) => {
          const cityName = event.graphic?.attr?.name;
          hoverFocusRef.current = cityName || "城市节点";
          scheduleTelemetry(true);
        });

        cityLayer.on(mars3d.EventType.mouseOut, () => {
          hoverFocusRef.current = "中国全域";
          scheduleTelemetry(true);
        });

        map.on(mars3d.EventType.cameraChanged, () => {
          scheduleTelemetry(false);
        });

        map.readyPromise
          .then(() => {
            if (disposed) {
              return;
            }

            scheduleTelemetry(true);
            window.setTimeout(() => {
              if (!disposed) {
                setLoading(false);
              }
            }, 320);
          })
          .catch((readyError) => {
            console.error(readyError);
            if (!disposed) {
              setError("Mars3D 场景初始化失败");
              setLoading(false);
            }
          });
      } catch (initError) {
        console.error(initError);
        if (!disposed) {
          setError(initError instanceof Error ? initError.message : "地图初始化失败");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      disposed = true;
      if (telemetryTimerRef.current !== null) {
        window.clearTimeout(telemetryTimerRef.current);
      }
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  const handleResetView = () => {
    if (!mapRef.current) {
      return;
    }

    hoverFocusRef.current = "中国全域";
    mapRef.current.setCameraView(DEFAULT_VIEW, { duration: 1.1 });
  };

  return (
    <div className="app-shell">
      <div className="page-haze haze-a" aria-hidden="true"></div>
      <div className="page-haze haze-b" aria-hidden="true"></div>
      <div className="page-grid" aria-hidden="true"></div>

      <div className="scene-stage">
        <div className="scene-aura aura-left" aria-hidden="true"></div>
        <div className="scene-aura aura-right" aria-hidden="true"></div>
        <div className="scene-vignette" aria-hidden="true"></div>
        <div ref={mapNodeRef} className="map-surface" aria-label="中国三维地图"></div>
      </div>

      <section className="hud hero-panel">
        <p className="eyebrow">MARS3D / REACT / CHINA TRAVEL STAGE</p>
        <h1>DragonAtlas3D</h1>
        <p className="hero-copy">
          先把中国做成首页主舞台，再去承接你的 travel agent 交互。现在这一版是
          Mars3D 驱动的固定中国主场景，不是工具地图。
        </p>
        <div className="hero-tags">
          <span>全国俯视</span>
          <span>悬浮底座</span>
          <span>省级面板</span>
          <span>地级市节点</span>
        </div>
        <button type="button" onClick={handleResetView}>
          重置视角
        </button>
      </section>

      <section className="hud telemetry-panel">
        <div className="telemetry-row">
          <span className="telemetry-label">当前聚焦</span>
          <span className="telemetry-value">{telemetry.focusName}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">概略层级</span>
          <span className="telemetry-value">{telemetry.mapLevel}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">镜头中心</span>
          <span className="telemetry-value">{telemetry.mapCenter}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">镜头高度</span>
          <span className="telemetry-value">{telemetry.cameraHeight}</span>
        </div>
      </section>

      <section className="hud stats-panel">
        <div className="info-row">
          <span className="info-label">省级面板</span>
          <span className="info-value">{stats.provinceCount}</span>
        </div>
        <div className="info-row">
          <span className="info-label">地级市节点</span>
          <span className="info-value">{stats.cityCount}</span>
        </div>
        <div className="info-row">
          <span className="info-label">重点城市</span>
          <span className="info-value">{stats.featuredCount}</span>
        </div>
      </section>

      <section className="hud note-panel">
        <p>场景策略</p>
        <ul>
          <li>全国是底座，省份是上层面板，先把中国整体体积感做出来。</li>
          <li>全部地级市都在，重点城市常亮，普通城市在更近视角才会放大存在感。</li>
          <li>这一版不用在线瓦片，先把主视觉稳定到可继续往 travel agent 首页演进。</li>
        </ul>
      </section>

      <div className="footer-ribbon">
        <span>Vite + React</span>
        <span>Mars3D</span>
        <span>Province Deck</span>
        <span>City Glow</span>
      </div>

      {(loading || error) && (
        <div id="loading-mask" className={loading ? "" : "is-hidden"}>
          <div className="loading-card">
            <span className="loading-tag">
              {error ? "LOAD FAILURE" : "SCENE BOOT"}
            </span>
            <h2>{error ? "三维主场景未能完成装载" : "装载 Mars3D 中国主舞台"}</h2>
            <p>
              {error
                ? error
                : "正在生成中国底座、省级面板以及地级市节点层。"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
