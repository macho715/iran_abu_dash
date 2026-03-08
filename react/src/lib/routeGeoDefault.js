export const DEFAULT_ROUTE_GEO = {
  nodes: {
    ABU: { label: "Abu Dhabi", lat: 24.4539, lng: 54.3773 },
    ALAIN: { label: "Al Ain", lat: 24.2075, lng: 55.7447 },
    MEZY: { label: "Mezyad", lat: 24.0540, lng: 55.7780 },
    FUJ: { label: "Fujairah", lat: 25.1288, lng: 56.3265 },
    BURA: { label: "Buraimi", lat: 24.2500, lng: 55.7933 },
    SOHAR: { label: "Sohar", lat: 24.3470, lng: 56.7090 },
    NIZWA: { label: "Nizwa", lat: 22.9333, lng: 57.5333 },
    KHATM: { label: "Khatmat Malaha", lat: 25.9950, lng: 56.3470 },
    MUSC: { label: "Muscat", lat: 23.5880, lng: 58.3829 },
    GHUW: { label: "Ghuwaifat", lat: 23.5500, lng: 53.8000 },
    RIY: { label: "Riyadh", lat: 24.7136, lng: 46.6753 }
  },
  routes: {
    A: { waypoints: ["ABU", "ALAIN", "BURA", "SOHAR"], provider: "osrm", profile: "driving" },
    B: { waypoints: ["ABU", "MEZY", "NIZWA"], provider: "osrm", profile: "driving" },
    C: { waypoints: ["ABU", "GHUW", "RIY"], provider: "mapbox", profile: "mapbox/driving" },
    D: { waypoints: ["ABU", "FUJ", "KHATM", "MUSC"], provider: "osrm", profile: "driving" }
  }
};
