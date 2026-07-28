import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId } = await params;
    const cleanId = issueId.trim().toUpperCase();

    // 1. Fetch Issue record
    const { data: issue, error: issueError } = await supabase
      .from("issues")
      .select("*, driver:drivers(*), vehicle:vehicles(*)")
      .eq("issue_id", cleanId)
      .single();

    if (issueError || !issue) {
      return Response.json({ error: `Issue ID '${cleanId}' not found` }, { status: 404 });
    }

    // 2. Fetch full conversation messages & media history
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", issue.conversation_id)
      .order("created_at", { ascending: true });

    return Response.json({
      ...issue,
      messages: messages || [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId } = await params;
    const body = await request.json();
    const cleanId = issueId.trim().toUpperCase();

    const updatePayload: Record<string, any> = {};
    if (body.status) updatePayload.status = body.status;
    if (body.resolution_notes) updatePayload.resolution_notes = body.resolution_notes;
    if (body.status === "resolved") updatePayload.resolved_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("issues")
      .update(updatePayload)
      .eq("issue_id", cleanId)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
