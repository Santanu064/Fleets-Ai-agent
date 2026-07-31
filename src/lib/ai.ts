import OpenAI from "openai";
import { FLEET_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { withTimeout, TimeoutError } from "@/lib/request-context";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || "12000", 10);
const AI_MAX_TOKENS = 1024;

export interface AIMessageInput {
  role: "user" | "assistant";
  content: string;
  media_url?: string | null;
  media_type?: string | null;
}

export async function getAIResponse(messages: AIMessageInput[]) {
  const modelName = process.env.AI_MODEL || "google/gemma-4-26b-it:free";

  // Build OpenAI-compatible chat messages (supporting Vision image input)
  const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: FLEET_SYSTEM_PROMPT,
    },
    ...messages.map((m) => {
      if (m.role === "user" && m.media_type === "image" && m.media_url) {
        return {
          role: "user" as const,
          content: [
            { type: "text" as const, text: m.content || "Here is a photo of the vehicle issue/warning indicator:" },
            {
              type: "image_url" as const,
              image_url: { url: m.media_url },
            },
          ],
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    }),
  ];

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: modelName,
        messages: formattedMessages,
        temperature: 0.3,
        max_tokens: AI_MAX_TOKENS,
      }),
      AI_TIMEOUT_MS,
      "OpenRouter AI"
    );

    return (
      completion.choices[0]?.message?.content ||
      "Vehicle issue logged. Our team is standing by to assist."
    );
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.error(`[AI Engine Timeout]: Model ${modelName} did not respond within ${AI_TIMEOUT_MS}ms`);
      return "Issue received and logged. If this is a critical emergency, please stop the vehicle safely and call dispatch.";
    }

    // Categorize error for better debugging
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes("429") || msg.includes("rate limit")) {
        console.error("[AI Engine Rate Limited]: OpenRouter rate limit hit");
      } else if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
        console.error("[AI Engine Server Error]: OpenRouter is experiencing issues");
      } else {
        console.error("[AI Engine Error]:", err.message);
      }
    } else {
      console.error("[AI Engine Error]:", err);
    }

    return "Issue received and logged. If this is a critical emergency, please stop the vehicle safely and call dispatch.";
  }
}
