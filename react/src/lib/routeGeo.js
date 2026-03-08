/**
 * 노드 좌표는 대략값입니다. 실제 운영용이면 반드시 검증/보정하세요.
 */
export const ROUTE_GEO = {
  nodes: {
    ABU: { latlng: [24.4539, 54.3773], label: "Abu Dhabi" },
    ALAIN: { latlng: [24.2075, 55.7447], label: "Al Ain" },
    MEZY: { latlng: [24.0540, 55.7780], label: "Mezyad (border)" },
    FUJ: { latlng: [25.1288, 56.3265], label: "Fujairah" },
    BURA: { latlng: [24.2500, 55.7933], label: "Buraimi" },
    SOHAR: { latlng: [24.3470, 56.7090], label: "Sohar" },
    NIZWA: { latlng: [22.9333, 57.5333], label: "Nizwa" },
    KHATM: { latlng: [25.9950, 56.3470], label: "Khatmat Malaha" },
    MUSC: { latlng: [23.5880, 58.3829], label: "Muscat" },
    GHUW: { latlng: [23.5500, 53.8000], label: "Ghuwaifat" },
    RIY: { latlng: [24.7136, 46.6753], label: "Riyadh" }
  },
  routes: {
    A: ["ABU", "ALAIN", "BURA", "SOHAR"],
    B: ["ABU", "MEZY", "NIZWA"],
    C: ["ABU", "GHUW", "RIY"],
    D: ["ABU", "FUJ", "KHATM", "MUSC"]
  }
};
