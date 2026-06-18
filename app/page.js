"use client";
import { useState, useCallback, useRef } from "react";


// ─── CAMPAIGNS CONFIG ────────────────────────────────────────────────────────
// Para agregar una campana: copia un bloque, cambia el key, label, color y fields
const CAMPAIGNS = {
  "altos-consumos": {
    label: "Altos Consumos",
    description: "Clientes con consumo superior al promedio historico",
    color: "#ef4444",
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
      YY1_DIRECPOSTALCUENTA_MCP: { computed: true, description: "STREET + HOUSE_NUM1 + CITY1 concatenados" },
      YY1_NROCUENTACONTRATO_MCP: { description: "numero de cuenta contrato sin padding" },
    },
  },
  // Para agregar una campana nueva, descomenta y edita este bloque:
  /*
  "corte-programado": {
    label: "Corte Programado",
    description: "Clientes con corte de servicio programado",
    color: "#f59e0b",
    fields: {
      ID_ORIGIN:                 { fixed: true,    default: "SAP_CRM_BUPA" },
      ID:                        { description: "numero de cuenta contrato" },
      COUNTRY_FT:                { fixed: true,    default: "AR" },
      REGION_FT:                 { fixed: true,    default: "Buenos Aires" },
      CITY1:                     { description: "localidad" },
      STREET:                    { description: "calle" },
      HOUSE_NUM1:                { description: "numero de puerta" },
      SMTP_ADDR:                 { description: "email del cliente" },
      OPT_IN_SMTP_ADDR:          { fixed: true,    default: "Y" },
      YY1_COD_APARATO_MCP:       { description: "numero de serie del medidor" },
      YY1_Subcuenca_MCP:         { description: "nomenclador" },
      YY1_DIRECPOSTALCUENTA_MCP: { computed: true },
      YY1_NROCUENTACONTRATO_MCP: { description: "cuenta contrato sin padding" },
    },
  },
  */
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const sep = text.includes(";") ? ";" : ",";
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(sep).map((h) => h.trim());
  const rows = lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = line.split(sep);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return obj;
    });
  return { headers, rows };
}

function toCSV(rows, fields) {
  const header = fields.join(";");
  const body = rows.map((r) => fields.map((f) => {
    const val = String(r[f] ?? "");
    return val.includes(";") || val.includes("\n") ? `"${val}"` : val;
  }).join(";")).join("\r\n");
  return header + "\r\n" + body;
}

function downloadCSV(content, filename) {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);
  const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const merged = new Uint8Array(BOM.length + contentBytes.length);
  merged.set(BOM, 0);
  merged.set(contentBytes, BOM.length);
  const blob = new Blob([merged], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function padId(val) {
  return (val || "").replace(/\D/g, "").padStart(12, "0");
}

function transformRows(rows, mapping, campaignFields) {
  const seenIds = new Set();
  const result = [];
  for (const row of rows) {
    const src = (f) => {
      const col = mapping[f];
      if (!col || col === "null" || col === "__COMPUTED__") return "";
      // Only return value if the column actually exists in this row
      return Object.prototype.hasOwnProperty.call(row, col) ? (row[col] || "") : "";
    };
    const out = {};
    Object.entries(campaignFields).forEach(([f, cfg]) => {
      if (cfg.fixed) out[f] = cfg.default;
    });
    const rawId = src("ID") || src("YY1_NROCUENTACONTRATO_MCP");
    const paddedId = padId(rawId);
    if (seenIds.has(paddedId)) continue;
    seenIds.add(paddedId);
    out.ID = paddedId;
    out.CITY1 = src("CITY1");
    out.STREET = src("STREET");
    out.HOUSE_NUM1 = src("HOUSE_NUM1");
    out.SMTP_ADDR = src("SMTP_ADDR").toLowerCase();
    out.YY1_COD_APARATO_MCP = src("YY1_COD_APARATO_MCP");
    out.YY1_Subcuenca_MCP = src("YY1_Subcuenca_MCP");
    out.YY1_NROCUENTACONTRATO_MCP = src("YY1_NROCUENTACONTRATO_MCP") || rawId;
    out.YY1_DIRECPOSTALCUENTA_MCP = [out.STREET, out.HOUSE_NUM1, out.CITY1].filter(Boolean).join(" ");
    Object.entries(campaignFields).forEach(([f, cfg]) => {
      if (!cfg.fixed && !cfg.computed && !(f in out)) out[f] = src(f);
    });
    result.push(out);
  }
  return result;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #0a0f1e; color: #e2e8f0; font-family: 'DM Mono', 'Courier New', monospace; }
  @keyframes shimmer { 0%{background-position:0% 0} 100%{background-position:200% 0} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
  .fadeUp { animation: fadeUp 0.35s ease forwards; }
  .shake { animation: shake 0.4s ease; }
  .btn-primary {
    background: linear-gradient(135deg, #0066ff, #00b4ff); border: none; color: #fff;
    padding: 11px 28px; font-family: 'DM Mono', monospace; font-size: 12px;
    letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
    border-radius: 4px; transition: all 0.2s;
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,102,255,0.4); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .btn-ghost {
    background: transparent; border: 1px solid rgba(0,180,255,0.3); color: #00b4ff;
    padding: 10px 24px; font-family: 'DM Mono', monospace; font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
    border-radius: 4px; transition: all 0.2s;
  }
  .btn-ghost:hover { background: rgba(0,180,255,0.08); border-color: #00b4ff; }
  .tag { display:inline-block; background:rgba(0,180,255,0.12); color:#00b4ff; border:1px solid rgba(0,180,255,0.25); padding:2px 8px; border-radius:3px; font-size:11px; }
  .field-input {
    width: 100%; background: #0d1528; border: 1px solid rgba(0,180,255,0.2);
    color: #e2e8f0; padding: 11px 14px; border-radius: 4px;
    font-family: 'DM Mono', monospace; font-size: 13px; outline: none; transition: border-color 0.2s;
  }
  .field-input:focus { border-color: #00b4ff; }
  .select-map {
    width: 100%; background: #0d1528; border: 1px solid rgba(0,180,255,0.2);
    color: #e2e8f0; padding: 7px 10px; border-radius: 4px;
    font-family: 'DM Mono', monospace; font-size: 12px; outline: none;
  }
  .campaign-card {
    padding: 18px 20px; background: #0d1528; border-radius: 8px; cursor: pointer;
    border: 2px solid rgba(255,255,255,0.05); transition: all 0.2s;
  }
  .campaign-card:hover { border-color: rgba(0,180,255,0.4); transform: translateY(-2px); }
  .campaign-card.selected { border-color: #0066ff; background: rgba(0,102,255,0.08); }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #0a0f1e; }
  ::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.3); border-radius: 3px; }
`;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { setError("Completá usuario y contrasena"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error de autenticacion");
        setShake(true); setTimeout(() => setShake(false), 500);
      } else {
        sessionStorage.setItem("smc_token", data.token);
        sessionStorage.setItem("smc_user", data.username);
        onLogin(data.username);
      }
    } catch { setError("Error de conexion"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className={`fadeUp ${shake ? "shake" : ""}`} style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4ff", boxShadow: "0 0 12px #00b4ff" }} />
            <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "#00b4ff", textTransform: "uppercase" }}>AySA * SAP Marketing Cloud</span>
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>CSV Transformer</h1>
          <p style={{ margin: 0, color: "#475569", fontSize: 13 }}>Ingresa con tu usuario</p>
        </div>
        <div style={{ background: "#0d1528", border: "1px solid rgba(0,180,255,0.15)", borderRadius: 10, padding: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Usuario</label>
            <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="tu.usuario" autoComplete="username" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Contrasena</label>
            <input className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="..." autoComplete="current-password" />
          </div>
          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)", borderRadius: 4, fontSize: 13, color: "#f87171" }}>{error}</div>
          )}
          <button className="btn-primary" style={{ width: "100%" }} onClick={handleLogin} disabled={loading}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                  Verificando...
                </span>
              : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CAMPAIGN SELECTOR ────────────────────────────────────────────────────────
function CampaignSelector({ onSelect }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="fadeUp">
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 6px", fontSize: 20 }}>Selecciona la Campana</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Cada campana tiene su propio esquema de campos SMC</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        {Object.entries(CAMPAIGNS).map(([key, camp]) => (
          <div key={key} className={`campaign-card ${selected === key ? "selected" : ""}`} onClick={() => setSelected(key)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: camp.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600 }}>{camp.label}</span>
            </div>
            <p style={{ margin: 0, color: "#475569", fontSize: 12, lineHeight: 1.5 }}>{camp.description}</p>
            <p style={{ margin: "8px 0 0", color: "#334155", fontSize: 11 }}>
              {Object.keys(camp.fields).length} campos * {Object.values(camp.fields).filter((f) => f.fixed).length} fijos
            </p>
          </div>
        ))}
      </div>
      <button className="btn-primary" disabled={!selected} onClick={() => onSelect(selected)}>
        Continuar con {selected ? CAMPAIGNS[selected].label : "..."} &rarr;
      </button>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [campaignKey, setCampaignKey] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [transformed, setTransformed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stats, setStats] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fileRef = useRef();

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = () => { setShowHistory(true); loadHistory(); };

  const campaign = campaignKey ? CAMPAIGNS[campaignKey] : null;
  const campaignFields = campaign?.fields || {};
  const smcFields = Object.keys(campaignFields);

  const handleLogout = () => {
    sessionStorage.removeItem("smc_token");
    sessionStorage.removeItem("smc_user");
    setCurrentUser(null); setStep("login"); setCampaignKey(null);
    setParsed(null); setMapping({}); setTransformed(null); setError("");
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(""); setFileName(file.name);

    let result;
    const isXLSX = /\.(xlsx|xls)$/i.test(file.name);
    if (isXLSX) {
      try {
        const buffer = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!data || data.length < 2) { setError("El archivo Excel está vacío o no tiene datos"); return; }
        const headers = data[0].map((h) => String(h).trim()).filter(Boolean);
        const rows = data.slice(1)
          .filter((row) => row.some((cell) => String(cell).trim() !== ""))
          .map((row) => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
            return obj;
          });
        result = { headers, rows };
      } catch (e) {
        setError("No se pudo leer el archivo Excel: " + e.message);
        return;
      }
    } else {
      const text = await file.text();
      result = parseCSV(text);
    }

    setParsed(result); setLoading(true);
    try {
      const res = await fetch("/api/map-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: result.headers, campaignKey, username: currentUser }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del servidor");
      // Normalize: convert JS null values to string "null" so the UI treats them as "Sin mapeo"
      const normalized = Object.fromEntries(
        Object.entries(data.mapping).map(([k, v]) => [k, v === null || v === undefined ? "null" : v])
      );
      setMapping(normalized); setStep("mapping");
    } catch (e) { setError("Error: " + e.message); }
    finally { setLoading(false); }
  }, [campaignKey]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handlePreview = () => {
    const orig = parsed.rows.length;
    const rows = transformRows(parsed.rows, mapping, campaignFields);
    setStats({ original: orig, deduped: rows.length, removed: orig - rows.length });
    setTransformed(rows); setStep("preview");
  };

  const handleDownload = () => {
    const csv = toCSV(transformed, smcFields);
    const safe = (campaign?.label || campaignKey).replace(/\s+/g, "_").toLowerCase();
    downloadCSV(csv, `SMC_${safe}_${new Date().toISOString().slice(0, 10)}.csv`);
    setStep("done");
  };

  const resetToUpload = () => {
    setStep("upload"); setFileName(""); setParsed(null);
    setMapping({}); setTransformed(null); setError(""); setStats(null);
  };
  const resetToCampaign = () => { setCampaignKey(null); resetToUpload(); setStep("campaign"); };

  const stepLabels = ["Campana", "Cargar", "Mapeo IA", "Preview", "Listo"];
  const stepKeys   = ["campaign", "upload", "mapping", "preview", "done"];
  const currentIdx = stepKeys.indexOf(step);

  if (step === "login") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 100,
          background: "linear-gradient(90deg,#00b4ff,#0066ff,#00b4ff)", backgroundSize: "200% 100%",
          animation: "shimmer 3s linear infinite" }} />
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)",
          backgroundSize: "40px 40px" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <LoginScreen onLogin={(u) => { setCurrentUser(u); setStep("campaign"); }} />
        </div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 100,
        background: "linear-gradient(90deg,#00b4ff,#0066ff,#00b4ff)", backgroundSize: "200% 100%",
        animation: "shimmer 3s linear infinite" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)",
        backgroundSize: "40px 40px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "52px 24px 80px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 44 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00b4ff", boxShadow: "0 0 10px #00b4ff" }} />
              <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "#00b4ff", textTransform: "uppercase" }}>AySA * SAP Marketing Cloud</span>
              {campaign && (
                <>
                  <span style={{ color: "#1e3a5f" }}>|</span>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: campaign.color }} />
                  <span style={{ fontSize: 11, color: "#64748b" }}>{campaign.label}</span>
                </>
              )}
            </div>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>CSV Transformer</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#00b4ff" }}>{currentUser}</span>
            <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 11 }} onClick={openHistory}>Historial</button>
            <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 11 }} onClick={handleLogout}>Salir</button>
          </div>
        </div>

        {/* Stepper */}
        {step !== "campaign" && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: i > currentIdx ? 0.28 : 1 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 10, fontWeight: 600,
                    background: i === currentIdx ? "#0066ff" : i < currentIdx ? "rgba(0,180,255,0.15)" : "rgba(255,255,255,0.04)",
                    border: i === currentIdx ? "none" : "1px solid rgba(255,255,255,0.08)",
                    color: i < currentIdx ? "#00b4ff" : "#e2e8f0",
                  }}>
                    {i < currentIdx ? "+" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, color: i === currentIdx ? "#fff" : "#475569" }}>{label}</span>
                </div>
                {i < 4 && <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.07)", margin: "0 8px" }} />}
              </div>
            ))}
          </div>
        )}

        {/* CAMPAIGN */}
        {step === "campaign" && <CampaignSelector onSelect={(key) => { setCampaignKey(key); setStep("upload"); }} />}

        {/* UPLOAD */}
        {step === "upload" && (
          <div className="fadeUp">
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop} onClick={() => !loading && fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? campaign?.color || "#00b4ff" : "rgba(0,180,255,0.22)"}`,
                borderRadius: 8, padding: "64px 32px", textAlign: "center",
                cursor: loading ? "not-allowed" : "pointer",
                background: dragOver ? "rgba(0,180,255,0.05)" : "rgba(0,180,255,0.015)", transition: "all 0.2s",
              }}>
              {loading ? (
                <div>
                  <div style={{ width: 36, height: 36, border: "3px solid rgba(0,180,255,0.2)", borderTopColor: "#00b4ff",
                    borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
                  <p style={{ margin: 0, color: "#00b4ff", fontSize: 13 }}>La IA esta analizando las columnas...</p>
                  <p style={{ margin: "6px 0 0", color: "#334155", fontSize: 11 }}>{fileName}</p>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 14 }}>📂</div>
                  <p style={{ margin: "0 0 8px", fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600 }}>Arrastra tu archivo o hace click</p>
                  <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 12 }}>Campana: <span style={{ color: campaign?.color }}>{campaign?.label}</span></p>
                  <p style={{ margin: 0, color: "#334155", fontSize: 11 }}>
                    <span className="tag">.xlsx</span> <span className="tag">.csv</span> <span style={{ marginLeft: 4 }}>· CSV separado por <span className="tag">;</span> o <span className="tag">,</span></span>
                  </p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            {error && <div style={{ marginTop: 14, padding: "11px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 4, fontSize: 13, color: "#f87171" }}>{error}</div>}
            <div style={{ marginTop: 20 }}>
              <button className="btn-ghost" onClick={resetToCampaign}>Cambiar campana</button>
            </div>
          </div>
        )}

        {/* MAPPING */}
        {step === "mapping" && parsed && (
          <div className="fadeUp">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 4px", fontSize: 19 }}>Mapeo de Columnas</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>IA mapeo <span style={{ color: "#00b4ff" }}>{fileName}</span> - revisa y ajusta si es necesario</p>
              </div>
              <span className="tag">{parsed.rows.length} filas</span>
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
              {Object.entries(campaignFields).filter(([, cfg]) => !cfg.fixed && !cfg.computed).map(([field, cfg]) => (
                <div key={field} style={{
                  display: "grid", gridTemplateColumns: "1fr 28px 1fr", alignItems: "center", gap: 12,
                  padding: "11px 14px", background: "#0d1528", borderRadius: 6,
                  border: mapping[field] && mapping[field] !== "null" ? "1px solid rgba(0,180,255,0.22)" : "1px solid rgba(255,255,255,0.04)"
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#00b4ff", marginBottom: 2 }}>{field}</div>
                    <div style={{ fontSize: 11, color: "#334155" }}>{cfg.description}</div>
                  </div>
                  <div style={{ textAlign: "center", color: "#1e3a5f" }}>-&gt;</div>
                  <select className="select-map" value={mapping[field] || "null"}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}>
                    <option value="null">- Sin mapeo -</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", alignItems: "center", gap: 12,
                padding: "11px 14px", background: "#0d1528", borderRadius: 6, border: "1px solid rgba(0,255,128,0.1)" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#34d399", marginBottom: 2 }}>YY1_DIRECPOSTALCUENTA_MCP</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>direccion postal completa</div>
                </div>
                <div style={{ textAlign: "center", color: "#1e3a5f" }}>-&gt;</div>
                <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>Calculado: STREET + HOUSE_NUM1 + CITY1</div>
              </div>
            </div>
            <div style={{ padding: "10px 14px", background: "rgba(0,255,128,0.03)", border: "1px solid rgba(0,255,128,0.09)", borderRadius: 6, marginBottom: 22 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>
                Campos fijos: {Object.entries(campaignFields).filter(([, v]) => v.fixed).map(([f, v]) => (
                  <span key={f} style={{ marginRight: 10 }}><span className="tag">{f}</span> <span style={{ color: "#34d399" }}>= {v.default}</span></span>
                ))}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" onClick={handlePreview}>Ver Preview</button>
              <button className="btn-ghost" onClick={resetToUpload}>Volver</button>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step === "preview" && transformed && (
          <div className="fadeUp">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 4px", fontSize: 19 }}>Preview del CSV</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}><span style={{ color: campaign?.color }}>{campaign?.label}</span> * {transformed.length} registros</p>
              </div>
              <button className="btn-primary" onClick={handleDownload}>Descargar CSV</button>
            </div>
            {stats && (
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Registros originales", value: stats.original, color: "#64748b" },
                  { label: "Duplicados eliminados", value: stats.removed, color: stats.removed > 0 ? "#f59e0b" : "#34d399" },
                  { label: "Registros finales", value: stats.deduped, color: "#00b4ff" },
                ].map((s) => (
                  <div key={s.label} style={{ flex: 1, padding: "12px 16px", background: "#0d1528", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk',sans-serif" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ overflowX: "auto", borderRadius: 6, border: "1px solid rgba(0,180,255,0.13)", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "rgba(0,180,255,0.07)" }}>
                    {smcFields.map((f) => (
                      <th key={f} style={{ padding: "9px 11px", textAlign: "left", color: "#00b4ff", whiteSpace: "nowrap", fontWeight: 500, borderBottom: "1px solid rgba(0,180,255,0.12)" }}>{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transformed.slice(0, 5).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {smcFields.map((f) => (
                        <td key={f} style={{ padding: "7px 11px", color: "#94a3b8", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row[f] || <span style={{ color: "#1e293b" }}>-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transformed.length > 5 && <p style={{ margin: "0 0 20px", color: "#334155", fontSize: 12, textAlign: "center" }}>Mostrando 5 de {transformed.length} registros</p>}
            <button className="btn-ghost" onClick={() => setStep("mapping")}>Editar mapeo</button>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="fadeUp" style={{ textAlign: "center", padding: "60px 32px" }}>
            <div style={{ fontSize: 44, marginBottom: 20 }}>✅</div>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: "0 0 10px", fontSize: 22 }}>CSV exportado correctamente</h2>
            <p style={{ color: "#475569", fontSize: 13, marginBottom: 32 }}>
              <code style={{ color: "#00b4ff" }}>SMC_{(campaign?.label || "").replace(/\s+/g, "_").toLowerCase()}_{new Date().toISOString().slice(0, 10)}.csv</code>
              <br /><br />
              {stats && <span>{stats.deduped} registros * {stats.removed} duplicados eliminados</span>}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn-primary" onClick={resetToUpload}>Procesar otro archivo</button>
              <button className="btn-ghost" onClick={resetToCampaign}>Cambiar campana</button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORY MODAL */}
      {showHistory && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
        }} onClick={() => setShowHistory(false)}>
          <div style={{
            width: 540, height: "100vh", background: "#0d1528", borderLeft: "1px solid rgba(0,180,255,0.2)",
            padding: "32px 28px", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", margin: 0, fontSize: 18 }}>Historial de Exportaciones</h2>
              <button className="btn-ghost" style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => setShowHistory(false)}>✕</button>
            </div>
            {historyLoading ? (
              <div style={{ textAlign: "center", paddingTop: 60 }}>
                <div style={{ width: 28, height: 28, border: "2px solid rgba(0,180,255,0.2)", borderTopColor: "#00b4ff",
                  borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
                <p style={{ color: "#64748b", fontSize: 13 }}>Cargando historial...</p>
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 60, color: "#334155" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <p style={{ fontSize: 13 }}>Sin transformaciones aún</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.map((h) => (
                  <div key={h.id} style={{
                    padding: "14px 16px", background: "#0a0f1e", borderRadius: 6,
                    border: "1px solid rgba(0,180,255,0.1)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>{h.campaign_label}</span>
                      <span style={{ fontSize: 10, color: "#475569" }}>
                        {new Date(h.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                      <span style={{ color: "#64748b" }}>👤 <span style={{ color: "#94a3b8" }}>{h.username}</span></span>
                      <span style={{ color: "#64748b" }}>↑ <span style={{ color: "#00b4ff" }}>{h.input_tokens}</span> tokens entrada</span>
                      <span style={{ color: "#64748b" }}>↓ <span style={{ color: "#a78bfa" }}>{h.output_tokens}</span> tokens salida</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
