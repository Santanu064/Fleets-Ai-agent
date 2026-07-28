import { supabase } from "./supabase";

export async function sendWhatsAppMessage(to: string, body: string) {
  const res = await fetch(
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
  );
  return res.json();
}

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  const res = await fetch(
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
  );
  return res.json();
}

export interface MediaDownloadResult {
  publicUrl: string | null;
  buffer: Buffer | null;
  mimeType: string;
}

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

    // 1. Get media URL from Meta Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const metaData = await metaRes.json();
    if (!metaData.url) return { publicUrl: null, buffer: null, mimeType: "" };

    const mime = metaData.mime_type || "";

    // 2. Download media binary buffer
    const mediaRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const arrayBuffer = await mediaRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine extension
    let ext = "bin";
    if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("png")) ext = "png";
    else if (mime.includes("ogg") || mime.includes("opus")) ext = "ogg";
    else if (mime.includes("mp4")) ext = "mp4";
    else if (mime.includes("pdf")) ext = "pdf";

    const fileName = `whatsapp_${mediaType}_${Date.now()}_${mediaId.slice(-6)}.${ext}`;

    // 3. Upload to Supabase Storage bucket 'fleet-media'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("fleet-media")
      .upload(fileName, buffer, {
        contentType: mime || "application/octet-stream",
        upsert: true,
      });

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
