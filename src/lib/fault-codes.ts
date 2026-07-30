export interface FaultCodeRow {
  fault_code: string;
  spn: string;
  fmi: string;
  lamp_color: string;
  j1939_description: string;
  cummins_description: string;
  category: string;
  keywords: string[];
  severity: "RED_STOP" | "AMBER_CAUTION" | string;
  driver_instructions_en: string;
  driver_instructions_hi: string;
  driver_instructions_bn: string;
  technician_notes: string;
  video_link: string;
  department: string;
  estimated_repair_time: string;
  can_drive: boolean;
}

// Default master dataset pre-populated with exact rows from your Google Spreadsheet
export const MASTER_FAULT_CODES: FaultCodeRow[] = [
  {
    fault_code: "111",
    spn: "629",
    fmi: "12",
    lamp_color: "Red",
    j1939_description: "Controller #1",
    cummins_description: "Engine Control Module Critical internal failure - Bad intelligent Device or Component",
    category: "ECM Failure",
    keywords: ["ecm", "controller", "module", "critical", "internal", "failure"],
    severity: "RED_STOP",
    driver_instructions_en: "STOP immediately. Turn off engine. Do NOT restart. Call dispatch.",
    driver_instructions_hi: "Turant ruko. Engine band karo. Restart mat karo. Dispatch ko call karo.",
    driver_instructions_bn: "Ekhuni thamao. Engine bondho koro. Restart korben na. Dispatch e call koro.",
    technician_notes: "Replace ECM. Check wiring harness.",
    video_link: "https://www.youtube.com/watch?v=3gT1m4i8x1E",
    department: "Engine Electronics Team",
    estimated_repair_time: "4 hours",
    can_drive: false,
  },
  {
    fault_code: "115",
    spn: "612",
    fmi: "2",
    lamp_color: "Red",
    j1939_description: "System Diagnostic Code #2",
    cummins_description: "Engine Speed/Position Sensor Circuit lost both signals from magnetic pickup sensor - Data Erratic Intermittent or Incorrect",
    category: "Speed Sensor Failure",
    keywords: ["speed", "sensor", "rpm", "erratic", "signal lost", "pickup"],
    severity: "RED_STOP",
    driver_instructions_en: "STOP safely. Engine may stall or run rough. Turn off engine. Call dispatch.",
    driver_instructions_hi: "Surakshit sthan par ruko. Engine band karo. Dispatch ko call karo.",
    driver_instructions_bn: "Nirapod sthan par thamao. Engine bondho koro. Dispatch e call koro.",
    technician_notes: "Check magnetic pickup sensor and harness.",
    video_link: "https://www.youtube.com/watch?v=vVj_pQj53_c",
    department: "Engine Electronics Team",
    estimated_repair_time: "2 hours",
    can_drive: false,
  },
  {
    fault_code: "122",
    spn: "102",
    fmi: "3",
    lamp_color: "Amber",
    j1939_description: "Boost Pressure",
    cummins_description: "Intake Manifold Pressure Sensor Circuit - Voltage Above Normal or Shorted to High Source",
    category: "Boost Pressure High",
    keywords: ["boost", "turbo", "pressure", "high", "voltage", "manifold"],
    severity: "AMBER_CAUTION",
    driver_instructions_en: "Reduce speed. Drive to nearest depot. Do NOT push engine hard.",
    driver_instructions_hi: "Gati kam karo. Samipdepo tak dhire chalao. Engine par dabav mat dalo.",
    driver_instructions_bn: "Gati komao. Kacher depot e dhire chalao. Engine e chap diben na.",
    technician_notes: "Inspect intake manifold pressure sensor.",
    video_link: "https://www.youtube.com/watch?v=F0B9v1iV04c",
    department: "Turbo & Air Intake Team",
    estimated_repair_time: "1.5 hours",
    can_drive: true,
  },
  {
    fault_code: "123",
    spn: "102",
    fmi: "4",
    lamp_color: "Amber",
    j1939_description: "Boost Pressure",
    cummins_description: "Intake Manifold Pressure Sensor Circuit - Voltage Below Normal or Shorted to Low Source",
    category: "Boost Pressure Low",
    keywords: ["boost", "turbo", "pressure", "low", "voltage", "manifold"],
    severity: "AMBER_CAUTION",
    driver_instructions_en: "Reduce speed. Low power expected. Drive carefully to nearest depot.",
    driver_instructions_hi: "Gati kam karo. Kam power milegi. Dhire Dhire chalao.",
    driver_instructions_bn: "Gati komao. Kam power paben. Sabdhane chalao.",
    technician_notes: "Check manifold pressure sensor wiring for low voltage.",
    video_link: "https://www.youtube.com/watch?v=F0B9v1iV04c",
    department: "Turbo & Air Intake Team",
    estimated_repair_time: "1.5 hours",
    can_drive: true,
  },
  {
    fault_code: "124",
    spn: "102",
    fmi: "16",
    lamp_color: "Amber",
    j1939_description: "Boost Pressure",
    cummins_description: "Intake Manifold 1 Pressure - Data Valid but Above Normal Operational Range - Moderately Severe Level",
    category: "Boost Overpressure",
    keywords: ["boost", "overpressure", "turbo", "high pressure"],
    severity: "AMBER_CAUTION",
    driver_instructions_en: "Reduce load and speed. Drive carefully to nearest depot.",
    driver_instructions_hi: "Bhaar aur gati kam karo. Dhire depot tak jao.",
    driver_instructions_bn: "Bhar ebong gati komao. Sabdhane depot e jao.",
    technician_notes: "Check wastegate and turbo actuator.",
    video_link: "https://www.youtube.com/watch?v=F0B9v1iV04c",
    department: "Turbo & Air Intake Team",
    estimated_repair_time: "2 hours",
    can_drive: true,
  },
];

// In-memory cache for live Google Sheets dataset
let liveCache: { timestamp: number; data: FaultCodeRow[] } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

/**
 * Simple CSV parser handling quotes
 */
function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let entry = "";
  let insideQuote = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        entry += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === "," && !insideQuote) {
      row.push(entry.trim());
      entry = "";
    } else if ((char === "\n" || char === "\r") && !insideQuote) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(entry.trim());
      if (row.length > 0 && row.some((field) => field.length > 0)) {
        lines.push(row);
      }
      row = [];
      entry = "";
    } else {
      entry += char;
    }
  }

  if (entry.length > 0 || row.length > 0) {
    row.push(entry.trim());
    lines.push(row);
  }

  return lines;
}

/**
 * Fetches live rows from Google Sheets published CSV URL if configured
 */
export async function getActiveDataset(): Promise<FaultCodeRow[]> {
  const url = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!url || !url.trim()) {
    return MASTER_FAULT_CODES;
  }

  const now = Date.now();
  if (liveCache && now - liveCache.timestamp < CACHE_TTL_MS) {
    return liveCache.data;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.warn("[Google Sheets] HTTP Error fetching live dataset:", res.status);
      return liveCache?.data || MASTER_FAULT_CODES;
    }

    const csvText = await res.text();
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return liveCache?.data || MASTER_FAULT_CODES;
    }

    // Header row mapping
    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const getColIndex = (name: string) => headers.findIndex((h) => h === name || h.includes(name));

    const idxCode = getColIndex("fault_code");
    const idxSpn = getColIndex("spn");
    const idxFmi = getColIndex("fmi");
    const idxLamp = getColIndex("lamp_color");
    const idxJ1939 = getColIndex("j1939_description");
    const idxCummins = getColIndex("cummins_description");
    const idxCategory = getColIndex("category");
    const idxKeywords = getColIndex("keywords");
    const idxSeverity = getColIndex("severity");
    const idxInstEn = getColIndex("driver_instructions_en");
    const idxInstHi = getColIndex("driver_instructions_hi");
    const idxInstBn = getColIndex("driver_instructions_bn");
    const idxTech = getColIndex("technician_notes");
    const idxVideo = getColIndex("video_link");
    const idxDept = getColIndex("department");
    const idxTime = getColIndex("estimated_repair_time");
    const idxDrive = getColIndex("can_drive");

    const parsedDataset: FaultCodeRow[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const code = idxCode !== -1 ? r[idxCode] || "" : "";
      if (!code && idxCategory !== -1 && !r[idxCategory]) continue;

      const keywordsRaw = idxKeywords !== -1 ? r[idxKeywords] || "" : "";
      const keywords = keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const canDriveRaw = idxDrive !== -1 ? (r[idxDrive] || "").toUpperCase() : "TRUE";
      const canDrive = canDriveRaw === "TRUE" || canDriveRaw === "YES" || canDriveRaw === "1";

      parsedDataset.push({
        fault_code: code || `ROW-${i}`,
        spn: idxSpn !== -1 ? r[idxSpn] || "" : "",
        fmi: idxFmi !== -1 ? r[idxFmi] || "" : "",
        lamp_color: idxLamp !== -1 ? r[idxLamp] || "" : "",
        j1939_description: idxJ1939 !== -1 ? r[idxJ1939] || "" : "",
        cummins_description: idxCummins !== -1 ? r[idxCummins] || "" : "",
        category: idxCategory !== -1 ? r[idxCategory] || "General Issue" : "General Issue",
        keywords: keywords.length > 0 ? keywords : [code],
        severity: idxSeverity !== -1 ? r[idxSeverity] || "AMBER_CAUTION" : "AMBER_CAUTION",
        driver_instructions_en: idxInstEn !== -1 ? r[idxInstEn] || "" : "",
        driver_instructions_hi: idxInstHi !== -1 ? r[idxInstHi] || "" : "",
        driver_instructions_bn: idxInstBn !== -1 ? r[idxInstBn] || "" : "",
        technician_notes: idxTech !== -1 ? r[idxTech] || "" : "",
        video_link: idxVideo !== -1 ? r[idxVideo] || "" : "",
        department: idxDept !== -1 ? r[idxDept] || "Dispatch Mechanics" : "Dispatch Mechanics",
        estimated_repair_time: idxTime !== -1 ? r[idxTime] || "1-2 hours" : "1-2 hours",
        can_drive: canDrive,
      });
    }

    if (parsedDataset.length > 0) {
      liveCache = { timestamp: now, data: parsedDataset };
      return parsedDataset;
    }
  } catch (err) {
    console.error("[Google Sheets Sync Exception]:", err);
  }

  return liveCache?.data || MASTER_FAULT_CODES;
}

/**
 * Searches the dataset (live or cached) by numerical Fault Code, SPN, FMI, or Keywords.
 */
export async function findMatchingFaultCodeAsync(text: string): Promise<FaultCodeRow | null> {
  if (!text || !text.trim()) return null;
  const clean = text.toLowerCase().trim();
  const dataset = await getActiveDataset();

  // 1. Try exact numerical match against fault_code
  const numMatch = clean.match(/\b(\d{2,5})\b/);
  if (numMatch) {
    const code = numMatch[1];
    const foundByCode = dataset.find(
      (r) => r.fault_code === code || r.spn === code
    );
    if (foundByCode) return foundByCode;
  }

  // 2. Try matching keywords or categories
  let bestMatch: FaultCodeRow | null = null;
  let highestScore = 0;

  for (const row of dataset) {
    let score = 0;

    if (clean.includes(row.category.toLowerCase())) score += 5;

    for (const kw of row.keywords) {
      if (clean.includes(kw.toLowerCase())) {
        score += 2;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = row;
    }
  }

  return highestScore >= 2 ? bestMatch : null;
}

export function findMatchingFaultCode(text: string): FaultCodeRow | null {
  if (!text || !text.trim()) return null;
  const clean = text.toLowerCase().trim();
  const dataset = liveCache?.data || MASTER_FAULT_CODES;

  const numMatch = clean.match(/\b(\d{2,5})\b/);
  if (numMatch) {
    const code = numMatch[1];
    const foundByCode = dataset.find((r) => r.fault_code === code || r.spn === code);
    if (foundByCode) return foundByCode;
  }

  let bestMatch: FaultCodeRow | null = null;
  let highestScore = 0;

  for (const row of dataset) {
    let score = 0;
    if (clean.includes(row.category.toLowerCase())) score += 5;
    for (const kw of row.keywords) {
      if (clean.includes(kw.toLowerCase())) score += 2;
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = row;
    }
  }

  return highestScore >= 2 ? bestMatch : null;
}

/**
 * Formats the driver instructions from the matching row based on language preference.
 */
export function getDriverInstructionForLanguage(
  row: FaultCodeRow,
  text: string
): string {
  const lower = text.toLowerCase();
  
  const isHindi = /[\u0900-\u097F]/.test(text) || lower.includes("ruko") || lower.includes("karo") || lower.includes("chalao");
  const isBengali = /[\u0980-\u09FF]/.test(text) || lower.includes("thamao") || lower.includes("bondho") || lower.includes("koro");

  if (isHindi && row.driver_instructions_hi) {
    return row.driver_instructions_hi;
  }
  if (isBengali && row.driver_instructions_bn) {
    return row.driver_instructions_bn;
  }
  return row.driver_instructions_en || row.driver_instructions_hi || row.driver_instructions_bn;
}
