import OpenAI from "openai";
import { FLEET_SYSTEM_PROMPT } from "@/lib/system-prompt";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

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
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: formattedMessages,
      temperature: 0.3,
    });

    return (
      completion.choices[0]?.message?.content ||
      "Vehicle issue logged. Our team is standing by to assist."
    );
  } catch (err) {
    console.error("[AI Engine Error]:", err);
    return "Issue received and logged. If this is a critical emergency, please stop the vehicle safely and call dispatch.";
  }
}
