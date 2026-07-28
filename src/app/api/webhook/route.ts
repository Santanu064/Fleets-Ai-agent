import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, downloadAndSaveWhatsAppMedia, downloadAndSaveWhatsAppMediaDetails } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { getVideoGuideForCategory } from "@/lib/video-guides";
import { transcribeVoiceNote } from "@/lib/transcribe";

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

function buildIssueFallbackResponse(content: string, mediaType: InboundMediaType) {
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

  if (mediaType === "audio" && content === "[Voice Note Received]") {
    return "I received your voice note, but I could not process the audio clearly. Please type the vehicle issue or send another short voice note from a quieter place. If you are driving, park safely first.";
  }

  if (mediaType === "audio" && content.includes("[Voice Note Transcribed]:")) {
    return `I received and transcribed your voice note. Please confirm these details so I can help correctly:

${content}

If this is urgent, park safely and share your vehicle plate number and current location.`;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages?.[0]) {
    return Response.json({ status: "no_message" });
  }

  const message = value.messages[0];
  const contact = value.contacts?.[0];

  const phone = message.from;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;
  const msgType = message.type as "text" | "image" | "audio" | "voice" | "video" | "location";

  if (whatsappMsgId) {
    const { data: existingMessage } = await supabase
      .from("messages")
      .select("id")
      .eq("whatsapp_msg_id", whatsappMsgId)
      .maybeSingle();

    if (existingMessage) {
      return Response.json({ status: "duplicate" });
    }
  }

  let textContent = "";
  let mediaUrl: string | null = null;
  let mediaType: InboundMediaType = "text";
  let locationLat: number | null = null;
  let locationLng: number | null = null;

  // Extract message content based on type
  if (msgType === "text") {
    textContent = message.text.body;
    mediaType = "text";
  } else if (msgType === "image") {
    textContent = message.image.caption || "[Driver sent an image]";
    mediaType = "image";
    mediaUrl = await downloadAndSaveWhatsAppMedia(message.image.id, "image");
  } else if (msgType === "audio" || msgType === "voice") {
    const audioObj = message.audio || message.voice;
    mediaType = "audio";
    void sendWhatsAppMessage(
      phone,
      "I received your voice note and I am analyzing it now. Please stay parked safely if this is a vehicle issue."
    ).catch((error) => console.warn("Failed to send voice note acknowledgement", error));

    const mediaDetails = await downloadAndSaveWhatsAppMediaDetails(audioObj.id, "audio");
    mediaUrl = mediaDetails.publicUrl;

    if (mediaDetails.buffer) {
      const transcript = await transcribeVoiceNote(mediaDetails.buffer, mediaDetails.mimeType);
      if (transcript) {
        textContent = `🎙️ [Voice Note Transcribed]: "${transcript}"`;
      } else {
        textContent = "[Voice Note Received]";
      }
      if (textContent.includes("[Voice Note Transcribed]:")) {
        textContent = textContent.replace(/^.*?(\[Voice Note Transcribed\]:)/, "$1");
      }
    } else {
      textContent = "[Voice Note Received]";
    }
  } else if (msgType === "video") {
    textContent = message.video?.caption || "[Video Recorded]";
    mediaType = "video";
    mediaUrl = await downloadAndSaveWhatsAppMedia(message.video.id, "video");
  } else if (msgType === "location") {
    locationLat = message.location.latitude;
    locationLng = message.location.longitude;
    textContent = `📍 Location shared: ${locationLat}, ${locationLng}`;
    mediaType = "location";
  } else {
    textContent = `[${String(message.type).toUpperCase()} Message]`;
  }

  try {
    // 1. Find or create Driver record
    let { data: driver } = await supabase
      .from("drivers")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!driver) {
      const { data: newDriver } = await supabase
        .from("drivers")
        .insert({ phone, full_name: name || `Driver (${phone.slice(-4)})` })
        .select()
        .single();
      driver = newDriver;
    }

    // 2. Find or create Conversation record
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

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
      return Response.json({ error: "Failed to load conversation" }, { status: 500 });
    }

    // 3. Store user message in DB
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
      return Response.json({ status: "duplicate" });
    }

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // If dispatcher mode is 'human', don't auto-reply
    if (conversation.mode === "human") {
      return Response.json({ status: "stored_for_human" });
    }

    const canReplyImmediately =
      Boolean(extractFaultCode(textContent)) ||
      (mediaType === "audio" && textContent === "[Voice Note Received]");
    const immediateIssueResponse = canReplyImmediately
      ? buildIssueFallbackResponse(textContent, mediaType)
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

      return Response.json({ status: "processed_fast" });
    }

    // 4. Fetch recent conversation history (last 15 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content, media_url, media_type")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(15);

    // 5. Query AI for response & classification
    const aiRawOutput = await getAIResponse(
      (history || []).reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        media_url: m.media_url,
        media_type: m.media_type,
      }))
    );

    // 6. Check for json_action block in AI response
    let finalCleanResponse = aiRawOutput;
    let actionPayload: ActionPayload | null = null;

    const actionMatch = aiRawOutput.match(/```json_action([\s\S]*?)```/);
    if (actionMatch) {
      try {
        actionPayload = JSON.parse(actionMatch[1].trim()) as ActionPayload;
        // Clean out json block from driver's text response
        finalCleanResponse = aiRawOutput.replace(/```json_action[\s\S]*?```/, "").trim();
      } catch (e) {
        console.warn("Failed to parse JSON action block from AI response", e);
      }
    }

    const issueFallbackResponse = buildIssueFallbackResponse(textContent, mediaType);
    if (issueFallbackResponse && isGenericGreetingResponse(finalCleanResponse)) {
      finalCleanResponse = issueFallbackResponse;
      actionPayload = null;
    }

    // 7. Process Actions (Create Ticket or Resolve Issue)
    if (actionPayload?.action === "CREATE_TICKET") {
      // Generate unique Issue ID: LG-2026-XXXXXX
      const prefix = process.env.ISSUE_ID_PREFIX || "LG";
      const year = new Date().getFullYear();
      const randomSeq = Math.floor(100000 + Math.random() * 900000);
      const issueId = `${prefix}-${year}-${randomSeq}`;

      const category = actionPayload.category || "Vehicle Mechanical Issue";
      const severity = actionPayload.severity || "major";

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
          ai_diagnosis: actionPayload.root_cause || "Vehicle issue detected by AI",
          ai_confidence_score: actionPayload.confidence_score || 0.88,
          root_cause: actionPayload.root_cause || category,
          suggested_solution: actionPayload.suggested_solution || "Technician review requested",
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
        finalCleanResponse += `\n\n📋 **Support Ticket Created**\nIssue ID: *${issueId}*\nSeverity: ${severity.toUpperCase()}\nStatus: Required Technician Assistance\n\nPlease share this Issue ID with your technician when they arrive.`;
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
    }

    // 8. Attach video guide link if relevant
    if (actionPayload?.category) {
      const guide = getVideoGuideForCategory(actionPayload.category);
      if (guide && !finalCleanResponse.includes(guide.url)) {
        finalCleanResponse += `\n\n🎥 **Instructional Guide:**\n${guide.title}: ${guide.url}`;
      }
    }

    // 9. Send WhatsApp response back to driver
    await sendWhatsAppMessage(phone, finalCleanResponse);

    // 10. Store AI response in DB
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

    return Response.json({ status: "processed", issue_id: actionPayload?.issue_id });
  } catch (error) {
    console.error("[Webhook Error]:", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
