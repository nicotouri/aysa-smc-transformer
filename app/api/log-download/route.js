import { supabase } from "../../lib/supabase";

export async function POST(request) {
  try {
    const { username, campaignKey, campaignLabel, total, removed } = await request.json();

    const { error } = await supabase.from("downloads_history").insert({
      username: username || "unknown",
      campaign_key: campaignKey || "",
      campaign_label: campaignLabel || "",
      total_records: total || 0,
      duplicates_removed: removed || 0,
    });

    if (error) {
      console.error("Log download error:", error);
      return Response.json({ ok: false, error: error.message });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Log download error:", error);
    return Response.json({ ok: false });
  }
}
