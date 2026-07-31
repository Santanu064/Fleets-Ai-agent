/**
 * Persistent deduplication for WhatsApp webhook messages.
 *
 * Two-tier strategy:
 *   1. In-memory LRU Map (fast path, avoids DB roundtrip for rapid duplicates)
 *   2. Supabase `webhook_events` table (durable, cross-instance, survives cold starts)
 *
 * The in-memory cache is a nice-to-have optimization; the Supabase table is the
 * source of truth. If the DB insert succeeds (no conflict), the message is new.
 */

import { supabase } from "./supabase";

// ─── In-Memory LRU Cache ────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 5000;
const memoryCache = new Map<string, number>(); // wamid → timestamp

function memoryHas(wamid: string): boolean {
  return memoryCache.has(wamid);
}

function memoryAdd(wamid: string): void {
  // Evict oldest entries if at capacity
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(wamid, Date.now());
}

// ─── Supabase DB Check ─────────────────────────────────────────────────────────

/**
 * Checks if a message has already been processed, using both in-memory cache
 * and Supabase `webhook_events` table. Also checks the `messages` table as a
 * final fallback.
 *
 * Returns `true` if the message is a duplicate and should be skipped.
 * Returns `false` if the message is new and has been marked as claimed.
 */
export async function isDuplicate(wamid: string): Promise<boolean> {
  if (!wamid) return false;

  // Tier 1: Fast in-memory check
  if (memoryHas(wamid)) {
    return true;
  }

  try {
    // Tier 2: Supabase webhook_events table (atomic insert with conflict check)
    const { error: insertError } = await supabase
      .from("webhook_events")
      .insert({ wamid })
      .single();

    if (insertError) {
      // 23505 = unique_violation → already exists → duplicate
      if (insertError.code === "23505") {
        memoryAdd(wamid); // Warm up memory cache
        return true;
      }
      // If the webhook_events table doesn't exist yet (42P01), fall back to messages table
      if (insertError.code === "42P01") {
        console.warn("[Dedup] webhook_events table not found. Falling back to messages table check.");
        return await fallbackMessageCheck(wamid);
      }
      // Other DB errors: log and fall back
      console.warn("[Dedup] DB insert error:", insertError.message);
      return await fallbackMessageCheck(wamid);
    }

    // Insert succeeded → new message, mark in memory too
    memoryAdd(wamid);
    return false;
  } catch (err) {
    console.error("[Dedup] Exception during dedup check:", err);
    // On error, fall back to messages table check
    return await fallbackMessageCheck(wamid);
  }
}

/**
 * Fallback: check the messages table for an existing whatsapp_msg_id.
 * This preserves the original dedup behavior from the old webhook code.
 */
async function fallbackMessageCheck(wamid: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("messages")
      .select("id")
      .eq("whatsapp_msg_id", wamid)
      .maybeSingle();

    if (data) {
      memoryAdd(wamid);
      return true;
    }
    // Not found in messages either → treat as new
    memoryAdd(wamid);
    return false;
  } catch {
    // If everything fails, let the message through (better to process a dup
    // than to silently drop a real message)
    return false;
  }
}

// ─── Cleanup (optional, call periodically) ──────────────────────────────────────

/**
 * Removes webhook_events older than 48 hours. Call this from a cron or
 * periodic cleanup task. Not critical — the table stays small enough for
 * most use cases without cleanup.
 */
export async function cleanupOldEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("webhook_events")
    .delete()
    .lt("received_at", cutoff)
    .select("wamid");

  if (error) {
    console.warn("[Dedup Cleanup] Error:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}
