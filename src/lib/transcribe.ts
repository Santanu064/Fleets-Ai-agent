/**
 * Transcribes WhatsApp voice audio notes using Groq's free Whisper Large v3 API.
 * Supports Multilingual speech: Hindi, Bengali, English, Hinglish, etc.
 */
export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<string | null> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.warn("[Voice Transcription] GROQ_API_KEY not found in environment variables");
    return null;
  }

  try {
    // Determine extension
    let filename = "voicenote.ogg";
    if (mimeType.includes("mp3")) filename = "voicenote.mp3";
    else if (mimeType.includes("wav")) filename = "voicenote.wav";
    else if (mimeType.includes("m4a")) filename = "voicenote.m4a";

    // Extract ArrayBuffer slice for Node.js BlobPart compatibility
    const arrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    ) as ArrayBuffer;

    const blob = new Blob([arrayBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("model", "whisper-large-v3");
    formData.append("temperature", "0");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Groq Whisper Error]:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const transcript = data.text?.trim();
    return transcript || null;
  } catch (err) {
    console.error("[Voice Transcription Exception]:", err);
    return null;
  }
}
