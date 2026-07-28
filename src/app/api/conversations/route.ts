import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 1. Try querying conversations with driver and vehicle joins
    let conversations: any[] | null = null;
    
    const { data: joinData, error: joinError } = await supabase
      .from("conversations")
      .select("*, driver:drivers(*), vehicle:vehicles(*)")
      .order("updated_at", { ascending: false });

    if (!joinError) {
      conversations = joinData;
    } else {
      // Fallback: If foreign keys or tables don't exist yet in Supabase schema cache
      console.warn("[/api/conversations] Join fallback triggered:", joinError.message);
      const { data: baseData, error: baseError } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (baseError) {
        console.error("[/api/conversations] Supabase error:", baseError.message);
        return Response.json({ error: baseError.message }, { status: 500 });
      }
      conversations = baseData;
    }

    // 2. Fetch last message & active issue for each conversation
    const withLastMessage = await Promise.all(
      (conversations || []).map(async (convo) => {
        const { data: messages } = await supabase
          .from("messages")
          .select("content, role, created_at, media_type")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1);

        let activeIssue = null;
        if (convo.active_issue_id) {
          try {
            const { data: issue } = await supabase
              .from("issues")
              .select("*")
              .eq("issue_id", convo.active_issue_id)
              .single();
            activeIssue = issue || null;
          } catch (e) {
            // ignore if issues table not ready
          }
        }

        return {
          ...convo,
          last_message: messages?.[0]?.content || null,
          active_issue: activeIssue,
        };
      })
    );

    return Response.json(withLastMessage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/conversations] Unexpected error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
