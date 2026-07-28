/**
 * Transcribes WhatsApp voice audio notes using Groq's free Whisper Large v3 API.
 * Supports Multilingual speech: Hindi, Bengali, English, Hinglish, etc.
 */
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
      return { text: null, error: `groq_error_${res.status}` };
    }

    const data = await res.json();
    const transcript = data.text?.trim();
    console.info("[Voice Transcription] Groq transcription complete:", {
      hasTranscript: Boolean(transcript),
      textLength: transcript?.length || 0,
    });
    return {
      text: transcript || null,
      error: transcript ? null : "empty_transcript",
    };
  } catch (err) {
    console.error("[Voice Transcription Exception]:", err);
    return { text: null, error: "transcription_exception" };
  }
}
