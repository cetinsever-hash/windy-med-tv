/* ============================================================
 *  CONFIG  —  Med Sailing Weather (LG webOS)
 *  ------------------------------------------------------------
 *  Drop your Windy developer API keys below.
 *
 *  Get keys (free "Testing" tier for development) at:
 *    Map Forecast :  https://api.windy.com/map-forecast
 *    Point Forecast: https://api.windy.com/point-forecast
 *
 *  NOTE: The free tier is DEV-ONLY and not licensed for a
 *  published/production TV app — upgrade to Professional before
 *  you ship to the LG Content Store.
 * ============================================================ */

window.APP_CONFIG = {
  // Key for the Map Forecast (Leaflet) plugin embedded in the map view.
  MAP_FORECAST_KEY: "Nh0tsJohzvnZTQkW7rjKTPWzjMq6ZZrx",

  // Key for the Point Forecast REST API (per-port marine forecast).
  // NOTE: Windy issues separate keys per product. If Point Forecast
  // returns 403/unauthorized, generate a dedicated Point Forecast key
  // and paste it here instead of reusing the Map Forecast key.
  POINT_FORECAST_KEY: "MEVq1fKL2mhuAKE5NW8HhVgUOrlnXZZS",

  // Point Forecast endpoint (v2).
  POINT_FORECAST_URL: "https://api.windy.com/api/point-forecast/v2",

  // Default map framing for the Mediterranean basin.
  MAP_DEFAULT: { lat: 38.0, lon: 16.0, zoom: 5 },

  // Marine-focused default overlay shown when the app opens.
  // Options that suit sailing: "wind", "gust", "waves", "swell1".
  DEFAULT_OVERLAY: "wind",

  // Forecast model. "gfs" = global, good default.
  // For waves use a wave-capable model where your plan allows it.
  POINT_MODEL: "gfs",

  // Refresh interval for the port forecast panel (ms).
  REFRESH_MS: 30 * 60 * 1000
};
