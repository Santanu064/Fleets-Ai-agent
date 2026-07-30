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

/**
 * Searches the dataset by numerical Fault Code, SPN, FMI, or Keywords.
 */
export function findMatchingFaultCode(text: string): FaultCodeRow | null {
  if (!text || !text.trim()) return null;
  const clean = text.toLowerCase().trim();

  // 1. Try exact numerical match against fault_code
  const numMatch = clean.match(/\b(\d{2,5})\b/);
  if (numMatch) {
    const code = numMatch[1];
    const foundByCode = MASTER_FAULT_CODES.find(
      (r) => r.fault_code === code || r.spn === code
    );
    if (foundByCode) return foundByCode;
  }

  // 2. Try matching keywords or categories
  let bestMatch: FaultCodeRow | null = null;
  let highestScore = 0;

  for (const row of MASTER_FAULT_CODES) {
    let score = 0;

    // Check category
    if (clean.includes(row.category.toLowerCase())) score += 5;

    // Check keywords
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

/**
 * Formats the driver instructions from the matching row based on language preference.
 */
export function getDriverInstructionForLanguage(
  row: FaultCodeRow,
  text: string
): string {
  const lower = text.toLowerCase();
  
  // Detect language or script
  const isHindi = /[\u0900-\u097F]/.test(text) || lower.includes("ruko") || lower.includes("karo") || lower.includes("chalao");
  const isBengali = /[\u0980-\u09FF]/.test(text) || lower.includes("thamao") || lower.includes("bondho") || lower.includes("koro");

  if (isHindi && row.driver_instructions_hi) {
    return row.driver_instructions_hi;
  }
  if (isBengali && row.driver_instructions_bn) {
    return row.driver_instructions_bn;
  }
  return row.driver_instructions_en;
}
