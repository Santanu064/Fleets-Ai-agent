/**
 * Background Message Processor
 *
 * Contains the full processing pipeline that was previously inside the webhook
 * POST handler. Runs asynchronously AFTER the webhook has already returned 200 OK.
 *
 * Flow (preserved exactly from original):
 *   1. Parse message type & extract content (text/image/audio/video/location)
 *   2. Find or create Driver record
 *   3. Find or create Conversation record
 *   4. Store user message in DB
 *   5. If mode is 'human', stop (no auto-reply)
 *   6. Fast path: direct fault-code match → immediate reply (no AI call)
 *   7. Slow path: fetch history → AI response → action extraction → ticket creation
 *   8. Send WhatsApp reply + store assistant message
 */

import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, downloadAndSaveWhatsAppMedia, downloadAndSaveWhatsAppMediaDetails } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { getVideoGuideForCategory } from "@/lib/video-guides";
import { transcribeVoiceNote } from "@/lib/transcribe";
import { findMatchingFaultCodeAsync, getDriverInstructionForLanguage } from "@/lib/fault-codes";
import { createLogger, generateRequestId } from "@/lib/request-context";

// ─── Types ──────────────────────────────────────────────────────────────────────

type InboundMediaType = "text" | "image" | "audio" | "video" | "location";

interface ActionPayload {
  action?: "CREATE_TICKET" | "RESOLVE_ISSUE";
  category?: string;
  severity?: string;
  root_cause?: string;
  confidence_score?: number;
  suggested_solution?: string;
  issue_id?: string;
}

// Raw webhook message payload from Meta
export interface RawWebhookMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  audio?: { id: string };
  voice?: { id: string };
  video?: { id: string; caption?: string };
  location?: { latitude: number; longitude: number };
}

export interface WebhookContact {
  profile?: { name?: string };
}

// ─── Patterns ───────────────────────────────────────────────────────────────────

const GENERIC_GREETING_PATTERNS = [
  /hello!?\s+how can i help you today\??/i,
  /if you are reporting a vehicle issue/i,
  /how can i assist you\??/i,
];

function isGenericGreetingResponse(response: string) {
  return GENERIC_GREETING_PATTERNS.some((pattern) => pattern.test(response));
}

function extractFaultCode(content: string) {
  return content.match(/\bfault\s*code\s*[:#-]?\s*([a-z0-9-]+)\b/i)?.[1] ?? null;
}

// ─── Fault Fallback Builder ─────────────────────────────────────────────────────

async function buildIssueFallbackResponse(content: string, mediaType: InboundMediaType) {
  const match = await findMatchingFaultCodeAsync(content);

  if (match) {
    const instruction = getDriverInstructionForLanguage(match, content);
    const stopWarning = !match.can_drive || match.severity === "RED_STOP"
      ? "\n\n⚠️ *CRITICAL SAFETY WARNING:* Red Stop Lamp Active / Cannot Drive. Turn off engine immediately and pull over safely."
      : "";
    const video = match.video_link ? `\n\n🎥 *Instructional Video Guide:*\n${match.video_link}` : "";

    return `🚨 *Fault Code Detected: ${match.fault_code}* (${match.category})
SPN: ${match.spn} | FMI: ${match.fmi} | Lamp: ${match.lamp_color}
Description: ${match.cummins_description || match.j1939_description}

📋 *Driver Action Steps:*
${instruction}${stopWarning}${video}`;
  }

  const faultCode = extractFaultCode(content);
  if (faultCode) {
    return `Fault code ${faultCode} received. Please park in a safe location before checking anything.

Fault-code meanings vary by vehicle make, model, and engine system, so please send:
1. Vehicle plate number
2. Vehicle make/model
3. Any dashboard warning text or light color
4. Current symptoms, such as power loss, overheating, smoke, brake issue, or engine not starting

If the warning is red/flashing, the engine is overheating, smoke is visible, brakes feel unsafe, or power is dropping, stop driving and wait for support.`;
  }

  if (mediaType === "audio" && (content === "[Voice Note Received]" || content.startsWith("[Voice Note Received"))) {
    return "I received your voice note, but I could not process the audio clearly. Please type the vehicle issue or send another short voice note from a quieter place. If you are driving, park safely first.";
  }

  return null;
}

// ─── Main Processing Pipeline ───────────────────────────────────────────────────

/**
 * Processes a single incoming WhatsApp message asynchronously.
 * This function should be called via waitUntil() so it runs after the webhook
 * has already returned 200 OK to Meta.
 */
export async function processWebhookMessage(
  message: RawWebhookMessage,
  contact: WebhookContact | null
): Promise<void> {
  const requestId = generateRequestId();
  const log = createLogger({ requestId, phone: message.from, wamid: message.id });

  const phone = message.from;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;
  const msgType = message.type as "text" | "image" | "audio" | "voice" | "video" | "location";

  log.info(`Processing ${msgType} message`);
  const startTime = Date.now();

  let textContent = "";
  let mediaUrl: string | null = null;
  let mediaType: InboundMediaType = "text";
  let locationLat: number | null = null;
  let locationLng: number | null = null;

  // ─── Step 1: Extract message content based on type ────────────────────────

  if (msgType === "text") {
    textContent = message.text!.body;
    mediaType = "text";
  } else if (msgType === "image") {
    textContent = message.image!.caption || "[Driver sent an image]";
    mediaType = "image";
    mediaUrl = await downloadAndSaveWhatsAppMedia(message.image!.id, "image");
  } else if (msgType === "audio" || msgType === "voice") {
    const audioObj = message.audio || message.voice;
    mediaType = "audio";

    // Send acknowledgement immediately (fire-and-forget, same as original)
    void sendWhatsAppMessage(
      phone,
      "I received your voice note and I am analyzing it now. Please stay parked safely if this is a vehicle issue."
    ).catch((error) => log.warn("Failed to send voice note acknowledgement", { error: String(error) }));

    // Download media AND transcribe in parallel for speed
    const mediaDetails = await downloadAndSaveWhatsAppMediaDetails(audioObj!.id, "audio");
    mediaUrl = mediaDetails.publicUrl;

    if (mediaDetails.buffer) {
      const transcription = await transcribeVoiceNote(mediaDetails.buffer, mediaDetails.mimeType);
      if (transcription.text) {
        textContent = `🎙️ [Voice Note Transcribed]: "${transcription.text}"`;
      } else {
        const failureReason = transcription.error || "unknown_transcription_error";
        textContent = `[Voice Note Received - Transcription Failed: ${failureReason}]`;
      }
    } else {
      textContent = "[Voice Note Received - Media Download Failed]";
    }
  } else if (msgType === "video") {
    textContent = message.video?.caption || "[Video Recorded]";
    mediaType = "video";
    mediaUrl = await downloadAndSaveWhatsAppMedia(message.video!.id, "video");
  } else if (msgType === "location") {
    locationLat = message.location!.latitude;
    locationLng = message.location!.longitude;
    textContent = `📍 Location shared: ${locationLat}, ${locationLng}`;
    mediaType = "location";
  } else {
    textContent = `[${String(message.type).toUpperCase()} Message]`;
  }

  try {
    // ─── Step 2: Find or create Driver record ─────────────────────────────

    let { data: driver } = await supabase
      .from("drivers")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    if (!driver) {
      const { data: newDriver } = await supabase
        .from("drivers")
        .insert({ phone, full_name: name || `Driver (${phone.slice(-4)})` })
        .select()
        .maybeSingle();
      driver = newDriver;
    }

    // ─── Step 3: Find or create Conversation record ────────────────────────

    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name: name || driver?.full_name, driver_id: driver?.id })
        .select()
        .single();
      conversation = newConvo;
    } else if (driver && conversation.driver_id !== driver.id) {
      await supabase
        .from("conversations")
        .update({ driver_id: driver.id })
        .eq("id", conversation.id);
    }

    if (!conversation) {
      log.error("Failed to load conversation");
      return;
    }

    log.info("Conversation loaded", { conversationId: conversation.id, mode: conversation.mode });

    // ─── Step 4: Store user message in DB ──────────────────────────────────

    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: textContent,
      whatsapp_msg_id: whatsappMsgId,
      media_url: mediaUrl,
      media_type: mediaType,
      location_lat: locationLat,
      location_lng: locationLng,
    });

    if (insertError?.code === "23505") {
      log.warn("Duplicate message insert detected, skipping");
      return;
    }

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // ─── Step 5: If dispatcher mode is 'human', don't auto-reply ─────────

    if (conversation.mode === "human") {
      log.info("Conversation in human mode, skipping auto-reply");
      return;
    }

    // ─── Step 6: Fast path — direct fault-code match ────────────────────────

    const canReplyImmediately =
      Boolean(extractFaultCode(textContent)) ||
      Boolean(await findMatchingFaultCodeAsync(textContent)) ||
      (mediaType === "audio" && (textContent === "[Voice Note Received]" || textContent.startsWith("[Voice Note Received")));

    const immediateIssueResponse = canReplyImmediately
      ? await buildIssueFallbackResponse(textContent, mediaType)
      : null;

    if (immediateIssueResponse) {
      await sendWhatsAppMessage(phone, immediateIssueResponse);

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: immediateIssueResponse,
      });

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      log.info("Fast path response sent", { durationMs: Date.now() - startTime });
      return;
    }

    // ─── Step 7: Slow path — AI response ────────────────────────────────────

    // Fetch recent conversation history (last 15 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content, media_url, media_type")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(15);

    // Query AI for response & classification
    const aiRawOutput = await getAIResponse(
      (history || []).reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        media_url: m.media_url,
        media_type: m.media_type,
      }))
    );

    // ─── Step 8: Check for json_action block in AI response ─────────────────

    let finalCleanResponse = aiRawOutput;
    let actionPayload: ActionPayload | null = null;

    const actionMatch = aiRawOutput.match(/```json_action([\s\S]*?)```/);
    if (actionMatch) {
      try {
        actionPayload = JSON.parse(actionMatch[1].trim()) as ActionPayload;
        // Clean out json block from driver's text response
        finalCleanResponse = aiRawOutput.replace(/```json_action[\s\S]*?```/, "").trim();
      } catch (e) {
        log.warn("Failed to parse JSON action block from AI response", { error: String(e) });
      }
    }

    const issueFallbackResponse = await buildIssueFallbackResponse(textContent, mediaType);
    if (issueFallbackResponse && isGenericGreetingResponse(finalCleanResponse)) {
      finalCleanResponse = issueFallbackResponse;
      actionPayload = null;
    } else if (
      ( (history?.length || 0) > 2 || conversation.active_issue_id ) &&
      isGenericGreetingResponse(finalCleanResponse)
    ) {
      finalCleanResponse = "I have received your message. Please share any additional details, warning light photos, or your vehicle plate number so I can assist you immediately.";
      actionPayload = null;
    }

    // ─── Step 9: Process Actions (Create Ticket or Resolve Issue) ───────────

    const sheetMatch = await findMatchingFaultCodeAsync(textContent);

    if (actionPayload?.action === "CREATE_TICKET" || (sheetMatch && (!sheetMatch.can_drive || sheetMatch.severity === "RED_STOP"))) {
      // Generate unique Issue ID: LG-2026-XXXXXX
      const prefix = process.env.ISSUE_ID_PREFIX || "LG";
      const year = new Date().getFullYear();
      const randomSeq = Math.floor(100000 + Math.random() * 900000);
      const issueId = `${prefix}-${year}-${randomSeq}`;

      const category = sheetMatch?.category || actionPayload?.category || "Vehicle Mechanical Issue";
      const severity = (sheetMatch && (!sheetMatch.can_drive || sheetMatch.severity === "RED_STOP"))
        ? "critical"
        : (actionPayload?.severity || "major");

      const diagnosis = sheetMatch?.cummins_description || actionPayload?.root_cause || "Vehicle fault code / issue detected";
      const solution = sheetMatch?.technician_notes || actionPayload?.suggested_solution || "Technician review requested";
      const videoUrl = sheetMatch?.video_link || null;

      // Insert into issues table
      const { data: newIssue } = await supabase
        .from("issues")
        .insert({
          issue_id: issueId,
          conversation_id: conversation.id,
          driver_id: driver?.id,
          vehicle_id: conversation.vehicle_id,
          category,
          severity,
          status: "open",
          ai_diagnosis: diagnosis,
          ai_confidence_score: actionPayload?.confidence_score || 0.95,
          root_cause: diagnosis,
          suggested_solution: solution,
          video_guide_url: videoUrl,
        })
        .select()
        .single();

      if (newIssue) {
        // Link active issue ID to conversation
        await supabase
          .from("conversations")
          .update({ active_issue_id: issueId })
          .eq("id", conversation.id);

        // Append ticket ID confirmation to driver message
        if (!finalCleanResponse.includes("Issue ID:")) {
          finalCleanResponse += `\n\n📋 **Support Ticket Created**\nIssue ID: *${issueId}*\nSeverity: ${severity.toUpperCase()}\nAssigned Team: ${sheetMatch?.department || "Dispatch Mechanics"}\n\nPlease share this Issue ID with your technician when they arrive.`;
        }

        log.info("Issue ticket created", { issueId, severity, category });
      }
    } else if (actionPayload?.action === "RESOLVE_ISSUE" && conversation.active_issue_id) {
      await supabase
        .from("issues")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("issue_id", conversation.active_issue_id);

      await supabase
        .from("conversations")
        .update({ active_issue_id: null })
        .eq("id", conversation.id);

      log.info("Issue resolved", { issueId: conversation.active_issue_id });
    }

    // ─── Step 10: Attach video guide link if relevant ───────────────────────

    if (actionPayload?.category) {
      const guide = getVideoGuideForCategory(actionPayload.category);
      if (guide && !finalCleanResponse.includes(guide.url)) {
        finalCleanResponse += `\n\n🎥 **Instructional Guide:**\n${guide.title}: ${guide.url}`;
      }
    }

    // ─── Step 11: Send WhatsApp response back to driver ─────────────────────

    await sendWhatsAppMessage(phone, finalCleanResponse);

    // ─── Step 12: Store AI response in DB ───────────────────────────────────

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: finalCleanResponse,
    });

    // Update conversation timestamp again
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    log.info("Message processed successfully", {
      durationMs: Date.now() - startTime,
      path: immediateIssueResponse ? "fast" : "ai",
    });
  } catch (error) {
    log.error("Processing pipeline error", error);

    // Best-effort: try to send a safe fallback message to the driver
    try {
      await sendWhatsAppMessage(
        phone,
        "Issue received and logged. If this is a critical emergency, please stop the vehicle safely and call dispatch."
      );
    } catch {
      log.error("Failed to send fallback message to driver");
    }
  }
}
