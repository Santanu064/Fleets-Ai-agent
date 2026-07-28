export type MediaType = "text" | "image" | "audio" | "video" | "location";
export type IssueSeverity = "minor" | "major" | "critical";
export type IssueStatus = "open" | "in_progress" | "resolved";

export interface Driver {
  id: string;
  phone: string;
  full_name: string;
  preferred_language: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: string | null;
  status: "active" | "in_maintenance" | "out_of_service";
  assigned_driver_id: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  driver_id: string | null;
  vehicle_id: string | null;
  active_issue_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  media_url?: string | null;
  media_type?: MediaType;
  location_lat?: number | null;
  location_lng?: number | null;
  created_at: string;
}

export interface Issue {
  id: string;
  issue_id: string; // e.g. LG-2026-000245
  conversation_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  category: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ai_diagnosis: string | null;
  ai_confidence_score: number;
  root_cause: string | null;
  suggested_solution: string | null;
  video_guide_url: string | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  driver?: Driver | null;
  vehicle?: Vehicle | null;
  messages?: Message[];
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
  driver?: Driver | null;
  vehicle?: Vehicle | null;
  active_issue?: Issue | null;
}
