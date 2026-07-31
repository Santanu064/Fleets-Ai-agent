import { supabase } from "./supabase";
import { withTimeout, retry } from "./request-context";

const META_API_TIMEOUT_MS = 8000;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 10000;

// ─── Send WhatsApp Text Message ─────────────────────────────────────────────────

export async function sendWhatsAppMessage(to: string, body: string) {
  return retry(
    async () => {
      const res = await withTimeout(
        fetch(
          `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to,
              type: "text",
              text: { body },
            }),
          }
        ),
        META_API_TIMEOUT_MS,
        "WhatsApp Send"
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "unknown");
        console.error("[WhatsApp Send Error]:", { status: res.status, body: errBody });
        throw new Error(`WhatsApp API error: ${res.status}`);
      }

      return res.json();
    },
    { maxRetries: 1, baseDelayMs: 1000, operationName: "WhatsApp Send" }
  );
}

// ─── Send WhatsApp Image Message ────────────────────────────────────────────────

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  const res = await withTimeout(
    fetch(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: {
            link: imageUrl,
            caption: caption || "",
          },
        }),
      }
    ),
    META_API_TIMEOUT_MS,
    "WhatsApp Image Send"
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "unknown");
    console.error("[WhatsApp Image Send Error]:", { status: res.status, body: errBody });
  }

  return res.json();
}

// ─── Media Download Types ───────────────────────────────────────────────────────

export interface MediaDownloadResult {
  publicUrl: string | null;
  buffer: Buffer | null;
  mimeType: string;
}

// ─── Download & Save WhatsApp Media ─────────────────────────────────────────────

/**
 * Downloads media from Meta WhatsApp Graph API using media_id and uploads it to Supabase storage.
 * Returns public URL and raw binary Buffer.
 */
export async function downloadAndSaveWhatsAppMediaDetails(
  mediaId: string,
  mediaType: string
): Promise<MediaDownloadResult> {
  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return { publicUrl: null, buffer: null, mimeType: "" };

    // 1. Get media URL from Meta Graph API (with timeout)
    const metaRes = await withTimeout(
      fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      MEDIA_DOWNLOAD_TIMEOUT_MS,
      "Meta Media URL"
    );

    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData.url) {
      console.error("[WhatsApp Media] Failed to get media URL:", {
        status: metaRes.status,
        error: metaData.error?.message,
      });
      return { publicUrl: null, buffer: null, mimeType: "" };
    }

    const mime = metaData.mime_type || "";

    // 2. Download media binary buffer (with timeout)
    const mediaRes = await withTimeout(
      fetch(metaData.url, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      MEDIA_DOWNLOAD_TIMEOUT_MS,
      "Meta Media Download"
    );

    if (!mediaRes.ok) {
      console.error("[WhatsApp Media] Failed to download media bytes:", {
        status: mediaRes.status,
        mime,
      });
      return { publicUrl: null, buffer: null, mimeType: mime };
    }
    const arrayBuffer = await mediaRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.info("[WhatsApp Media] Downloaded media:", {
      mediaType,
      mime,
      bytes: buffer.byteLength,
    });

    // Determine extension
    let ext = "bin";
    if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("png")) ext = "png";
    else if (mime.includes("ogg") || mime.includes("opus")) ext = "ogg";
    else if (mime.includes("mp4")) ext = "mp4";
    else if (mime.includes("pdf")) ext = "pdf";

    const fileName = `whatsapp_${mediaType}_${Date.now()}_${mediaId.slice(-6)}.${ext}`;

    // 3. Upload to Supabase Storage bucket 'fleet-media' (with timeout)
    const { data: uploadData, error: uploadError } = await withTimeout(
      supabase.storage
        .from("fleet-media")
        .upload(fileName, buffer, {
          contentType: mime || "application/octet-stream",
          upsert: true,
        }),
      MEDIA_DOWNLOAD_TIMEOUT_MS,
      "Supabase Storage Upload"
    );

    let publicUrl: string | null = null;

    if (uploadError) {
      console.warn("[WhatsApp Media] Bucket upload warning/error:", uploadError.message);
      const base64 = buffer.toString("base64");
      publicUrl = `data:${mime || "image/jpeg"};base64,${base64}`;
    } else {
      const { data: publicUrlData } = supabase.storage
        .from("fleet-media")
        .getPublicUrl(uploadData.path);
      publicUrl = publicUrlData.publicUrl;
    }

    return { publicUrl, buffer, mimeType: mime };
  } catch (err) {
    console.error("[WhatsApp Media] Failed to process media:", err);
    return { publicUrl: null, buffer: null, mimeType: "" };
  }
}

export async function downloadAndSaveWhatsAppMedia(
  mediaId: string,
  mediaType: string
): Promise<string | null> {
  const result = await downloadAndSaveWhatsAppMediaDetails(mediaId, mediaType);
  return result.publicUrl;
}
