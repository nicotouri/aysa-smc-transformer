// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE CAMPAÑAS
// Para agregar una nueva campaña, copiá un bloque y modificalo.
// fixed: true   → valor fijo, no se mapea
// computed: true → se calcula automáticamente (STREET + HOUSE_NUM1 + CITY1)
// description   → la IA intenta mapearlo desde el CSV origen
// ─────────────────────────────────────────────────────────────────────────────

export const CAMPAIGNS = {

  "altos-consumos": {
    label: "Altos Consumos",
    description: "Clientes con consumo superior al promedio histórico",
    color: "#ef4444",
    fields: {
      ID_ORIGIN:                  { fixed: true, default: "SAP_CRM_BUPA" },
      ID:                         { description: "número de cuenta contrato (se formatea a 12 dígitos con ceros)" },
      COUNTRY_FT:                 { fixed: true, default: "AR" },
      REGION_FT:                  { fixed: true, default: "Buenos Aires" },
      CITY1:                      { description: "localidad o ciudad" },
      STREET:                     { description: "nombre de la calle (sin número)" },
      HOUSE_NUM1:                 { description: "número de puerta o altura" },
      SMTP_ADDR:                  { description: "correo electrónico o email del cliente" },
      OPT_IN_SMTP_ADDR:           { fixed: true, default: "Y" },
      YY1_COD_APARATO_MCP:        { description: "número de serie del medidor" },
      YY1_Subcuenca_MCP:          { description: "nomenclador o subcuenca" },
      YY1_DIRECPOSTALCUENTA_MCP:  { computed: true, description: "STREET + HOUSE_NUM1 + CITY1 concatenados" },
      YY1_NROCUENTACONTRATO_MCP:  { description: "número de cuenta contrato sin padding" },
    }
  },

  // Para agregar una campaña nueva:
  // 1. Copiá el bloque de arriba
  // 2. Cambiá el key (ej: "corte-programado"), label, description, color
  // 3. Modificá o agregá fields según lo que necesite esa campaña
  // 4. Push → se deploya automáticamente y aparece en el menú

};
