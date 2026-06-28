/* ============================================================
 *  Med Sailing Weather — app logic
 *  - Windy Map Forecast plugin (Leaflet) : full-screen map
 *  - Windy Point Forecast API            : per-port marine panel
 *  - LG remote (D-pad) navigation
 * ============================================================ */

(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var PORTS = window.MED_PORTS;
  var windyAPI = null;           // set once the plugin boots
  var selectedPortIndex = 0;

  /* ---------- small helpers ---------- */
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function toast(msg, persist) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    if (!persist) {
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { t.classList.add("hidden"); }, 4000);
    }
  }
  function hideToast() { $("#toast").classList.add("hidden"); }

  function keysMissing() {
    return /PASTE_/.test(CFG.MAP_FORECAST_KEY) || /PASTE_/.test(CFG.POINT_FORECAST_KEY);
  }

  /* ---------- clock ---------- */
  function tickClock() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    $("#clock").textContent = hh + ":" + mm;
  }

  /* ============================================================
   *  1) MAP FORECAST PLUGIN
   * ============================================================ */
  function bootWindyMap() {
    if (typeof windyInit !== "function") {
      toast("Map plugin failed to load (check internet / TV WebKit).", true);
      return;
    }
    var options = {
      key: CFG.MAP_FORECAST_KEY,
      lat: CFG.MAP_DEFAULT.lat,
      lon: CFG.MAP_DEFAULT.lon,
      zoom: CFG.MAP_DEFAULT.zoom,
      overlay: CFG.DEFAULT_OVERLAY,
      // Marine-friendly defaults
      level: "surface",
      hourFormat: "24h"
    };

    windyInit(options, function (api) {
      windyAPI = api;            // { map, store, picker, broadcast, overlays, ... }
      // Build the layer bar from the overlays this key is actually allowed to
      // show (free plan = wind/temp/pressure; Professional adds gust/waves/etc).
      var allowed = [];
      try { allowed = api.store.getAllowed("overlay") || []; } catch (e) {}
      buildLayerButtons(allowed);
      var initial = allowed.indexOf(CFG.DEFAULT_OVERLAY) >= 0 ? CFG.DEFAULT_OVERLAY
                  : (allowed[0] || "wind");
      setOverlay(initial);
      addPortMarkers(api.map);
      // Re-center on the Mediterranean basin.
      api.map.setView([CFG.MAP_DEFAULT.lat, CFG.MAP_DEFAULT.lon], CFG.MAP_DEFAULT.zoom);
    });
  }

  // Friendly labels for Windy overlay ids.
  var OVERLAY_LABELS = {
    wind: "Wind", gust: "Gusts", waves: "Waves", swell1: "Swell",
    rain: "Rain", temp: "Temp", pressure: "Pressure", rh: "Humidity",
    clouds: "Clouds", snow: "Snow"
  };

  function buildLayerButtons(allowed) {
    var nav = document.getElementById("layers");
    if (!nav) return;
    // Preferred display order; fall back to whatever else the key allows.
    var order = ["wind", "gust", "waves", "swell1", "rain", "temp", "pressure"];
    var list = order.filter(function (o) { return allowed.indexOf(o) >= 0; });
    allowed.forEach(function (o) { if (list.indexOf(o) < 0) list.push(o); });

    nav.innerHTML = "";
    list.forEach(function (ov) {
      var b = document.createElement("button");
      b.className = "layer-btn focusable";
      b.dataset.overlay = ov;
      b.textContent = OVERLAY_LABELS[ov] || ov;
      b.addEventListener("click", function () { setOverlay(ov); });
      nav.appendChild(b);
    });
  }

  function setOverlay(overlay) {
    if (!windyAPI) return;
    windyAPI.store.set("overlay", overlay);
    markActiveLayer(overlay);
  }

  function markActiveLayer(overlay) {
    document.querySelectorAll(".layer-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.overlay === overlay);
    });
  }

  function addPortMarkers(map) {
    if (!window.L) return;
    PORTS.forEach(function (p, i) {
      var m = L.circleMarker([p.lat, p.lon], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1e88e5",
        fillOpacity: 0.9
      }).addTo(map);
      m.bindTooltip(p.name, { permanent: false, direction: "top" });
      m.on("click", function () { selectPort(i); });
    });
  }

  /* ============================================================
   *  2) POINT FORECAST API  (per-port marine forecast)
   * ============================================================ */
  function postPF(body) {
    return fetch(CFG.POINT_FORECAST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // Windy splits weather and waves across two models:
  //   gfs      -> wind, windGust   (atmosphere)
  //   gfsWave  -> waves, swell1     (marine)
  // Requesting wave params from gfs returns HTTP 400, so we issue two
  // requests and merge them. The wave call is optional (some keys/plans
  // don't include the wave model) — if it fails we still show wind.
  function fetchPointForecast(port) {
    var atmo = postPF({
      lat: port.lat, lon: port.lon,
      model: "gfs",
      parameters: ["wind", "windGust"],
      levels: ["surface"],
      key: CFG.POINT_FORECAST_KEY
    });

    var wave = postPF({
      lat: port.lat, lon: port.lon,
      model: "gfsWave",
      parameters: ["waves", "swell1"],
      levels: ["surface"],
      key: CFG.POINT_FORECAST_KEY
    }).catch(function () { return {}; });  // tolerate missing wave model

    // atmo wins on shared keys (ts), wave adds the *_height-surface arrays.
    return Promise.all([atmo, wave]).then(function (res) {
      return Object.assign({}, res[1], res[0]);
    });
  }

  // Compute wind speed (m/s -> knots) from U/V components.
  function windKnots(u, v) {
    var ms = Math.sqrt(u * u + v * v);
    return ms * 1.94384;
  }
  function windDir(u, v) {
    var deg = (Math.atan2(u, v) * 180 / Math.PI) + 180;
    return (deg + 360) % 360;
  }
  function dirName(deg) {
    var names = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return names[Math.round(deg / 22.5) % 16];
  }

  function renderForecast(port, data) {
    $("#detailName").textContent = port.name + " · " + port.country;

    var ts = data.ts || [];
    // Wind components at surface (key names follow Windy's response).
    var u = data["wind_u-surface"] || [];
    var v = data["wind_v-surface"] || [];
    var gustU = data["gust_u-surface"] || data["windGust_u-surface"] || [];
    var gustV = data["gust_v-surface"] || data["windGust_v-surface"] || [];
    var waves = data["waves_height-surface"] || data["waves-surface"] || [];

    if (!ts.length || !u.length) {
      $("#detailSub").textContent = "No marine data returned for this point.";
      $("#metrics").innerHTML = "";
      $("#strip").innerHTML = "";
      return;
    }

    // "Now" = first timestamp.
    var kn = windKnots(u[0], v[0]);
    var dir = windDir(u[0], v[0]);
    var gust = (gustU.length ? windKnots(gustU[0], gustV[0]) : kn * 1.3);
    var wave = waves.length ? waves[0] : null;

    $("#detailSub").textContent = "Updated " + new Date(ts[0]).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

    $("#metrics").innerHTML =
      metric("Wind", kn.toFixed(0), "kn " + dirName(dir)) +
      metric("Gusts", gust.toFixed(0), "kn") +
      metric("Wave", wave != null ? wave.toFixed(1) : "—", "m") +
      metric("Dir", Math.round(dir) + "°", dirName(dir));

    // Next ~7 timesteps strip.
    var strip = "";
    for (var i = 0; i < Math.min(7, ts.length); i++) {
      var k = windKnots(u[i], v[i]);
      var g = gustU.length ? windKnots(gustU[i], gustV[i]) : k * 1.3;
      var h = new Date(ts[i]).getHours();
      strip += '<div class="fcell"><div class="h">' + String(h).padStart(2,"0") +
               'h</div><div class="w">' + k.toFixed(0) + '</div><div class="g">G' +
               g.toFixed(0) + '</div></div>';
    }
    $("#strip").innerHTML = strip;
  }

  function metric(label, value, unit) {
    return '<div class="metric"><div class="label">' + label +
           '</div><div class="value">' + value +
           '<span class="unit">' + (unit || "") + '</span></div></div>';
  }

  /* ---------- port list + selection ---------- */
  function buildPortList() {
    var ul = $("#portList");
    ul.innerHTML = "";
    PORTS.forEach(function (p, i) {
      var li = el("li", "focusable");
      li.tabIndex = 0;
      li.dataset.index = i;
      li.innerHTML = '<span class="pname">' + p.name + '</span><span class="pwind" id="pw' + i + '">–</span>';
      li.addEventListener("click", function () { selectPort(i); });
      ul.appendChild(li);
    });
  }

  function selectPort(i) {
    selectedPortIndex = i;
    var port = PORTS[i];

    document.querySelectorAll("#portList li").forEach(function (li, idx) {
      li.classList.toggle("selected", idx === i);
    });

    if (windyAPI && windyAPI.map) {
      windyAPI.map.panTo([port.lat, port.lon]);
    }

    $("#detailName").textContent = port.name + " · " + port.country;
    $("#detailSub").textContent = "Loading forecast…";

    if (keysMissing()) {
      $("#detailSub").textContent = "Add API keys in js/config.js to load live data.";
      return;
    }

    fetchPointForecast(port)
      .then(function (data) { renderForecast(port, data); updateListWind(i, data); })
      .catch(function (e) {
        $("#detailSub").textContent = "Forecast error: " + e.message;
      });
  }

  function updateListWind(i, data) {
    var u = data["wind_u-surface"] || [];
    var v = data["wind_v-surface"] || [];
    if (!u.length) return;
    var kn = windKnots(u[0], v[0]);
    var cell = document.getElementById("pw" + i);
    if (cell) cell.textContent = kn.toFixed(0) + " kn " + dirName(windDir(u[0], v[0]));
  }

  /* ============================================================
   *  3) REMOTE (D-PAD) NAVIGATION
   *  Two focus zones: layer buttons (top) and port list (right).
   * ============================================================ */
  var KEY = { LEFT:37, UP:38, RIGHT:39, DOWN:40, ENTER:13, BACK:461, RED:403, GREEN:404 };

  function focusables(zone) {
    if (zone === "layers") return Array.prototype.slice.call(document.querySelectorAll("#layers .focusable"));
    return Array.prototype.slice.call(document.querySelectorAll("#portList .focusable"));
  }

  var current = { zone: "ports", idx: 0 };

  function applyFocus() {
    document.querySelectorAll(".focus").forEach(function (e) { e.classList.remove("focus"); });
    var list = focusables(current.zone);
    if (!list.length) return;
    current.idx = Math.max(0, Math.min(current.idx, list.length - 1));
    var node = list[current.idx];
    node.classList.add("focus");
    if (node.focus) node.focus();
    if (current.zone === "ports") node.scrollIntoView({ block: "nearest" });
  }

  function onKey(e) {
    var code = e.keyCode;
    var list = focusables(current.zone);

    switch (code) {
      case KEY.DOWN:
        if (current.zone === "layers") { current.zone = "ports"; current.idx = selectedPortIndex; }
        else current.idx++;
        break;
      case KEY.UP:
        if (current.zone === "ports" && current.idx === 0) { current.zone = "layers"; current.idx = 0; }
        else current.idx--;
        break;
      case KEY.LEFT:
        if (current.zone === "layers") current.idx--;
        break;
      case KEY.RIGHT:
        if (current.zone === "layers") current.idx++;
        break;
      case KEY.ENTER:
        activate(list[current.idx]);
        return;
      case KEY.BACK:
        // Let webOS handle exit; nothing to pop.
        return;
      default:
        return;
    }
    e.preventDefault();
    applyFocus();
  }

  function activate(node) {
    if (!node) return;
    if (node.classList.contains("layer-btn")) {
      setOverlay(node.dataset.overlay);
    } else if (node.dataset.index != null) {
      selectPort(parseInt(node.dataset.index, 10));
    }
  }

  /* ============================================================
   *  INIT
   * ============================================================ */
  function init() {
    tickClock();
    setInterval(tickClock, 15000);

    buildPortList();

    // Layer button click + mouse support (for emulator / dev).
    document.querySelectorAll(".layer-btn").forEach(function (b) {
      b.addEventListener("click", function () { setOverlay(b.dataset.overlay); });
    });

    document.addEventListener("keydown", onKey);

    if (keysMissing()) {
      toast("No API keys set — map and forecasts are disabled. Add keys in js/config.js. UI/navigation still work.", true);
    }

    bootWindyMap();

    // Auto-select first port + periodic refresh.
    selectPort(0);
    current = { zone: "ports", idx: 0 };
    applyFocus();

    setInterval(function () {
      if (!keysMissing()) selectPort(selectedPortIndex);
    }, CFG.REFRESH_MS);
  }

  // The Windy plugin boot script calls windyInit; we load it after DOM ready.
  function loadWindyBoot() {
    var s = document.createElement("script");
    s.src = "https://api.windy.com/assets/map-forecast/libBoot.js";
    s.onload = init;
    s.onerror = function () {
      toast("Could not load Windy map library. Check network / production key.", true);
      // Still bring up the UI so navigation works.
      init();
    };
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadWindyBoot);
  } else {
    loadWindyBoot();
  }
})();
