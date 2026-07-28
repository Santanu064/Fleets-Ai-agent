export const VIDEO_GUIDES: Record<string, { title: string; url: string }> = {
  "tyre_puncture": {
    "title": "How to change a spare tyre safely",
    "url": "https://www.youtube.com/watch?v=joBmAhBnIxA"
  },
  "battery_jumpstart": {
    "title": "How to jump-start a vehicle battery",
    "url": "https://www.youtube.com/watch?v=vVj_pQj53_c"
  },
  "fuse_replacement": {
    "title": "Vehicle fuse box inspection & replacement",
    "url": "https://www.youtube.com/watch?v=3gT1m4i8x1E"
  },
  "coolant_check": {
    "title": "How to check and refill engine coolant safely",
    "url": "https://www.youtube.com/watch?v=1K5_0E2yq_M"
  },
  "air_pressure": {
    "title": "Checking tire pressure & using emergency inflator pump",
    "url": "https://www.youtube.com/watch?v=F0B9v1iV04c"
  }
};

export function getVideoGuideForCategory(category: string): { title: string; url: string } | null {
  const catLower = category.toLowerCase();
  if (catLower.includes("tyre") || catLower.includes("tire") || catLower.includes("puncture")) {
    return VIDEO_GUIDES["tyre_puncture"];
  }
  if (catLower.includes("battery") || catLower.includes("electrical")) {
    return VIDEO_GUIDES["battery_jumpstart"];
  }
  if (catLower.includes("fuse")) {
    return VIDEO_GUIDES["fuse_replacement"];
  }
  if (catLower.includes("coolant") || catLower.includes("overheat")) {
    return VIDEO_GUIDES["coolant_check"];
  }
  if (catLower.includes("air") || catLower.includes("pressure")) {
    return VIDEO_GUIDES["air_pressure"];
  }
  return null;
}
