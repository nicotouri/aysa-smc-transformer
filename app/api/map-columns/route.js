import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../lib/supabase";

// Misma config que en page.js - mantener sincronizadas
const CAMPAIGNS = {
  "altos-consumos": {
    label: "Altos Consumos",
    fields: {
      ID_ORIGIN:                 { fixed: true,    default: "SAP_CRM_BUPA" },
      ID:                        { description: "numero de cuenta contrato (se formatea a 12 digitos con ceros)" },
      COUNTRY_FT:                { fixed: true,    default: "AR" },
      REGION_FT:                 { fixed: true,    default: "Buenos Aires" },
      CITY1:                     { description: "localidad o ciudad" },
      STREET:                    { description: "nombre de la calle sin numero" },
      HOUSE_NUM1:                { description: "numero de puerta o altura" },
      SMTP_ADDR:                 { description: "correo electronico o email del cliente" },
      OPT_IN_SMTP_ADDR:          { fixed: true,    default: "Y" },
      YY1_COD_APARATO_MCP:       { description: "numero de serie del medidor" },
      YY1_Subcuenca_MCP:         { description: "nomenclador o subcuenca" },
      YY1_DIRECPOSTALCUENTA_MCP: { computed: true },
      YY1_NROCUENTACONTRATO_MCP: { description: "numero de cuenta contrato sin padding" },
    },
  },
};

export async function POST(request) {
  try {
    const { headers: sourceHeaders, campaignKey, username } = await request.json();

    if (!sourceHeaders || !Array.isArray(sourceHeaders)) {
      return Response.json({ error: "Headers invalidos" }, { status: 400 });
    }

    const campaign = CAMPAIGNS[campaignKey];
    if (!campaign) {
      return Response.json({ error: "Campana no encontrada: " + campaignKey }, { status: 400 });
    }

    const mappableFields = Object.entries(campaign.fields)
      .filter(([, v]) => !v.fixed && !v.computed)
      .map(([k, v]) => `${k}: ${v.description}`)
      .join("\n");

    const nonFixedFields = Object.entries(campaign.fields)
      .filter(([, v]) => !v.fixed)
      .map(([k, v]) => `  "${k}": ${v.computed ? '"__COMPUTED__"' : '"nombre_columna_o_null"'}`)
      .join(",\n");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Eres un experto en SAP Marketing Cloud para AySA.
CSV de la campana "${campaign.label}" con columnas: ${sourceHeaders.join(", ")}

Mapea a estos campos SMC:
${mappableFields}

REGLAS:
- YY1_DIRECPOSTALCUENTA_MCP siempre es "__COMPUTED__"
- Si no hay equivalente claro, pon null
- Responde SOLO JSON valido, sin markdown

{
${nonFixedFields}
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content.map((c) => c.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const mapping = JSON.parse(clean);

    // Log transformation to Supabase (fire and forget)
    supabase.from("transformations_history").insert({
      username: username || "unknown",
      campaign_key: campaignKey,
      campaign_label: campaign.label,
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    }).then(() => {}).catch(() => {});

    return Response.json({ mapping });
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Error al procesar el mapeo: " + error.message }, { status: 500 });
  }
}
