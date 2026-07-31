/**
 * Transcribes WhatsApp voice audio notes using Groq's free Whisper Large v3 API.
 * Supports Multilingual speech: Hindi, Bengali, English, Hinglish, etc.
 */
import { withTimeout } from "./request-context";

const TRANSCRIPTION_TIMEOUT_MS = 15000;

export interface VoiceTranscriptionResult {
  text: string | null;
  error: string | null;
}

export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<VoiceTranscriptionResult> {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    console.warn("[Voice Transcription] GROQ_API_KEY not found in environment variables");
    return { text: null, error: "missing_groq_api_key" };
  }

  if (audioBuffer.byteLength === 0) {
    console.warn("[Voice Transcription] Empty audio buffer");
    return { text: null, error: "empty_audio_buffer" };
  }

  // Reject suspiciously large audio files (>25MB) to prevent abuse
  if (audioBuffer.byteLength > 25 * 1024 * 1024) {
    console.warn("[Voice Transcription] Audio file too large:", audioBuffer.byteLength);
    return { text: null, error: "audio_too_large" };
  }

  try {
    // Determine extension
    let filename = "voicenote.ogg";
    if (mimeType.includes("mp3")) filename = "voicenote.mp3";
    else if (mimeType.includes("wav")) filename = "voicenote.wav";
    else if (mimeType.includes("m4a")) filename = "voicenote.m4a";
    else if (mimeType.includes("mp4")) filename = "voicenote.mp4";
    else if (mimeType.includes("mpeg")) filename = "voicenote.mp3";
    else if (mimeType.includes("webm")) filename = "voicenote.webm";
    else if (mimeType.includes("amr")) filename = "voicenote.amr";
    else if (mimeType.includes("aac")) filename = "voicenote.aac";

    console.info("[Voice Transcription] Sending audio to Groq:", {
      mimeType,
      filename,
      bytes: audioBuffer.byteLength,
    });

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

    const res = await withTimeout(
      fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: formData,
      }),
      TRANSCRIPTION_TIMEOUT_MS,
      "Groq Whisper Transcription"
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Groq Whisper Error]:", res.status, errText);
      return { text: null, error: `groq_error_${res.status}` };
    }

    const data = await res.json();
    const transcript = data.text?.trim();

    // Check for suspiciously empty transcriptions from long audio
    if (!transcript && audioBuffer.byteLength > 10000) {
      console.warn("[Voice Transcription] Empty transcript from non-trivial audio");
      return { text: null, error: "empty_transcript_suspicious" };
    }

    console.info("[Voice Transcription] Groq transcription complete:", {
      hasTranscript: Boolean(transcript),
      textLength: transcript?.length || 0,
    });
    return {
      text: transcript || null,
      error: transcript ? null : "empty_transcript",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error("[Voice Transcription Timeout]: Groq did not respond within", TRANSCRIPTION_TIMEOUT_MS, "ms");
      return { text: null, error: "transcription_timeout" };
    }
    console.error("[Voice Transcription Exception]:", err);
    return { text: null, error: "transcription_exception" };
  }
}
