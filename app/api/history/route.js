import { supabase } from "../../lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("transformations_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("History error:", error);
      return Response.json({ history: [] });
    }

    return Response.json({ history: data || [] });
  } catch (error) {
    console.error("History error:", error);
    return Response.json({ history: [] });
  }
}
