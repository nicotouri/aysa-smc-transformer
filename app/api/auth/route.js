import { supabase } from "../../lib/supabase";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: "Completá usuario y contraseña" }, { status: 400 });
    }

    const inputUser = (username || "").trim().toLowerCase();
    const inputPass = (password || "").trim();

    const { data, error } = await supabase
      .from("users")
      .select("username, password")
      .eq("username", inputUser)
      .single();

    if (error || !data) {
      return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    if (data.password !== inputPass) {
      return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    const token = Buffer.from(`${data.username}:${Date.now()}`).toString("base64");
    return Response.json({ ok: true, token, username: data.username });
  } catch (error) {
    console.error("Auth error:", error);
    return Response.json({ error: "Error en autenticación" }, { status: 500 });
  }
}
