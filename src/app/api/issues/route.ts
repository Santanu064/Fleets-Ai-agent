import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");

    let query = supabase
      .from("issues")
      .select("*, driver:drivers(*), vehicle:vehicles(*)")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (severity) query = query.eq("severity", severity);

    const { data: issues, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(issues || []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
