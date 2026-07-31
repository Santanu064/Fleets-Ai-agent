/**
 * WhatsApp Webhook Route — Production-Grade Thin Receiver
 *
 * GET:  Meta webhook verification (unchanged)
 * POST: Receives incoming messages, validates, deduplicates, and returns 200 OK
 *       within ~50ms. All heavy processing (media download, transcription, AI,
 *       WhatsApp reply) runs in the background via waitUntil().
 *
 * Why this matters:
 *   - Meta requires 200 OK within 5 seconds or it retries → duplicate messages
 *   - Original code did everything synchronously (8-22 seconds)
 *   - Now: instant acknowledge + background processing
 */

import { NextRequest, after } from "next/server";
import { isDuplicate } from "@/lib/dedup";
import { processWebhookMessage } from "@/lib/message-processor";
import type { RawWebhookMessage, WebhookContact } from "@/lib/message-processor";
import { createLogger, generateRequestId } from "@/lib/request-context";

// ─── Webhook Verification (unchanged) ───────────────────────────────────────────

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

// ─── Webhook Message Receiver (production-grade) ────────────────────────────────

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const log = createLogger({ requestId });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "invalid_json" }, { status: 400 });
  }

  // ─── Validate: must be a WhatsApp Business Account event ───────────────
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  // ─── Extract message from webhook payload ──────────────────────────────
  const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;

  if (!value) {
    return Response.json({ status: "no_value" });
  }

  const messages = value.messages as RawWebhookMessage[] | undefined;
  if (!messages?.[0]) {
    return Response.json({ status: "no_message" });
  }

  const message = messages[0];
  const contacts = value.contacts as WebhookContact[] | undefined;
  const contact = contacts?.[0] || null;
  const whatsappMsgId = message.id;

  // ─── Deduplication (persistent, multi-instance safe) ───────────────────
  if (whatsappMsgId) {
    const duplicate = await isDuplicate(whatsappMsgId);
    if (duplicate) {
      log.info("Duplicate message skipped", { wamid: whatsappMsgId });
      return Response.json({ status: "duplicate" });
    }
  }

  log.info("Message accepted, enqueuing for background processing", {
    type: message.type,
    from: message.from,
    wamid: whatsappMsgId,
  });

  // ─── Enqueue for background processing ────────────────────────────────
  // Use after() to run the heavy processing AFTER returning 200 OK.
  // This is a built-in Next.js API that schedules work after the response.
  after(async () => {
    try {
      await processWebhookMessage(message, contact);
    } catch (err) {
      log.error("Background processing failed", err);
    }
  });

  // ─── Return 200 OK immediately (<100ms) ───────────────────────────────
  return Response.json({ status: "accepted", request_id: requestId });
}
