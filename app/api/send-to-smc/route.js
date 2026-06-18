const SMC_BASE      = "https://my400515.s4hana.cloud.sap/sap/opu/odata/sap/API_MKT_CORPORATE_ACCOUNT_SRV;v=0003";
const SMC_CSRF_BASE = "https://my400515.s4hana.cloud.sap/sap/opu/odata/sap/API_MKT_CONTACT_SRV;v=0004/";
const SMC_BATCH_URL = `${SMC_BASE}/$batch`;

function getUTCTimestamp() {
  const now = new Date();
  const utc = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return utc.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchCSRFToken(basicAuth) {
  const res = await fetch(SMC_CSRF_BASE, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "X-CSRF-Token": "Fetch",
      "Accept": "application/json",
    },
  });
  const token = res.headers.get("x-csrf-token");
  const rawCookies = res.headers.getSetCookie?.() || [];
  const cookieStr = rawCookies.map(c => c.split(";")[0]).join("; ");
  console.log("CSRF status:", res.status, "| token:", token || "MISSING");
  if (!token) throw new Error(`No se pudo obtener CSRF token (status ${res.status})`);
  return { token, cookieStr };
}

function buildSingleBatch(row, ts) {
  const batchBoundary     = `batch_aysa_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const changesetBoundary = `changeset_aysa_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

  const id     = String(row.ID || "").trim();
  const origin = String(row.ID_ORIGIN || "SAP_CRM_BUPA").trim();
  const email  = String(row.SMTP_ADDR || "").toLowerCase().trim();

  const commonHeaders = [
    `Accept: application/json`,
    `Sap-Cuan-RequestTimestamp: '${ts}'`,
    `Sap-Cuan-SourceSystemType: ""`,
    `Sap-Cuan-SourceSystemId: ""`,
    `Content-Type: application/json`,
  ].join("\r\n");

  const accountPayload = JSON.stringify({
    OriginDataLastChgUTCDateTime: ts,
    CityName: row.CITY1 || "",
    Country: row.COUNTRY_FT || "AR",
    FullName: `${id} - `,
    AddressHouseNumber: row.HOUSE_NUM1 || "",
    Language: "ES",
    PhoneNumber: "",
    MobileNumber: "",
    ContactPostalCode: "",
    StreetName: row.STREET || "",
    YY1_DirecPostalCuenta_MCP: row.YY1_DIRECPOSTALCUENTA_MCP || "",
    YY1_Subcuenca_MCP: row.YY1_Subcuenca_MCP || "",
    YY1_cod_aparato_MCP: row.YY1_COD_APARATO_MCP || "",
  });

  let body = `--${batchBoundary}\r\n`;
  body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

  body += `--${changesetBoundary}\r\n`;
  body += `content-type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\n`;
  body += `PUT CorporateAccountOriginData(CorporateAccountID='${id}',CorporateAccountOrigin='${origin}') HTTP/1.1\r\n`;
  body += `${commonHeaders}\r\n\r\n`;
  body += `${accountPayload}\r\n\r\n`;

  body += `--${changesetBoundary}\r\n`;
  body += `content-type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\n`;
  body += `PUT AdditionalIDs(CorporateAccountID='${id}',CorporateAccountOrigin='${origin}',InteractionContactAdditionalOrigin='EMAIL',InteractionContactAdditionalExternalID='${email}') HTTP/1.1\r\n`;
  body += `${commonHeaders}\r\n\r\n`;
  body += `{}\r\n\r\n`;

  body += `--${changesetBoundary}\r\n`;
  body += `content-type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\n`;
  body += `PUT MarketingAreas(CorporateAccountID='${id}',CorporateAccountOrigin='${origin}',InteractionContactMktgArea='COMUNICACION_DIGITAL') HTTP/1.1\r\n`;
  body += `${commonHeaders}\r\n\r\n`;
  body += `{}\r\n\r\n`;

  body += `--${changesetBoundary}--\r\n`;
  body += `--${batchBoundary}--\r\n`;

  return { body, batchBoundary };
}

function parseRowResponse(responseText, row) {
  const lines = responseText.split(/\r?\n/);
  let partIndex = 0;
  let errors = [];

  for (let i = 0; i < lines.length; i++) {
    const httpMatch = lines[i].match(/^HTTP\/1\.1 (\d+)\s*(.*)/);
    if (!httpMatch) continue;
    const status = parseInt(httpMatch[1]);
    const statusText = httpMatch[2];
    if (status >= 400) {
      let detail = statusText;
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        if (lines[j].includes('"message"') || lines[j].includes('"error"')) {
          try {
            const match = lines.slice(j).join("\n").match(/\{[\s\S]*?\}/);
            const errJson = JSON.parse(match?.[0] || "{}");
            detail = errJson?.error?.message?.value || errJson?.message || statusText;
          } catch {}
          break;
        }
      }
      errors.push({ put: partIndex + 1, status, detail });
    }
    partIndex++;
  }

  return {
    id:         row.ID,
    email:      row.SMTP_ADDR || "",
    street:     `${row.STREET || ""} ${row.HOUSE_NUM1 || ""}`.trim(),
    city:       row.CITY1 || "",
    status:     errors.length === 0 ? "ok" : "error",
    httpStatus: errors.length === 0 ? 204 : errors[0].status,
    errors:     errors.length > 0 ? errors : null,
  };
}

// Streaming response — sends one JSON line per row as it completes
export async function POST(request) {
  try {
    const { rows } = await request.json();
    if (!rows?.length) return Response.json({ error: "No hay registros" }, { status: 400 });

    const user = process.env.SMC_USER;
    const pass = process.env.SMC_PASSWORD;
    if (!user || !pass) return Response.json({ error: "Credenciales SMC no configuradas (SMC_USER / SMC_PASSWORD)" }, { status: 400 });

    const basicAuth = Buffer.from(`${user}:${pass}`).toString("base64");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        try {
          // Step 1: fetch CSRF
          const { token: csrfToken, cookieStr } = await fetchCSRFToken(basicAuth);
          const ts = getUTCTimestamp();
          send({ type: "start", total: rows.length });

          const results = [];
          let ok = 0, errors = 0;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id  = String(row.ID || "").trim();

            if (!id) {
              const r = { id: "?", email: row.SMTP_ADDR, street: "", city: "", status: "error", httpStatus: 0, errors: [{ put: 0, detail: "ID vacio" }] };
              results.push(r);
              errors++;
              send({ type: "row", index: i, total: rows.length, result: r, ok, errors });
              continue;
            }

            const { body, batchBoundary } = buildSingleBatch(row, ts);

            // Log first row body for debugging
            if (i === 0) console.log("Row 0 batch body (first 800):\n" + body.slice(0, 800));

            try {
              const res = await fetch(SMC_BATCH_URL, {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${basicAuth}`,
                  "X-CSRF-Token": csrfToken,
                  "Cookie": cookieStr,
                  "Content-Type": `multipart/mixed; boundary=${batchBoundary}`,
                  "Accept": "multipart/mixed",
                },
                body,
              });

              const text = await res.text();
              if (i === 0) console.log("Row 0 response status:", res.status, "\nRow 0 response (600):", text.slice(0, 600));

              let r;
              if (res.status >= 500) {
                // Extract XML error message
                const xmlMsg = text.match(/<message[^>]*>([^<]+)<\/message>/)?.[1] || text.slice(0, 150);
                r = { id, email: row.SMTP_ADDR, street: `${row.STREET||""} ${row.HOUSE_NUM1||""}`.trim(), city: row.CITY1||"", status: "error", httpStatus: res.status, errors: [{ put: 0, detail: xmlMsg }] };
              } else {
                r = parseRowResponse(text, row);
              }

              results.push(r);
              if (r.status === "ok") ok++; else errors++;
              send({ type: "row", index: i, total: rows.length, result: r, ok, errors });

            } catch (fetchErr) {
              const r = { id, email: row.SMTP_ADDR, street: "", city: row.CITY1||"", status: "error", httpStatus: 0, errors: [{ put: 0, detail: fetchErr.message }] };
              results.push(r);
              errors++;
              send({ type: "row", index: i, total: rows.length, result: r, ok, errors });
            }
          }

          send({ type: "done", summary: { total: rows.length, ok, error: errors, unknown: 0 }, results });

        } catch (err) {
          console.error("Stream error:", err);
          send({ type: "error", message: err.message });
        }

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
