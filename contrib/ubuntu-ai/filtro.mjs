// Filtro stdio davanti a `rea mcp`: REA 6.3.0 espone 139 strumenti, ~606k caratteri di descrizioni e schemi d'ingresso
// (~150k token: più di metà del contesto di un modello locale, a ogni richiesta).
//   REA_PROFILO=porta (predefinito): il modello vede 2 strumenti, rea_describe e rea_call; il catalogo raggruppato sta
//     nella skill «rea» (skill/SKILL.md). La sessione (bersaglio aperto, analisi Ghidra) resta nel server fra le chiamate.
//   REA_PROFILO=nativo | dotnet | tutto: gli strumenti veri del profilo, senza outputSchema.
//   REA_STRUMENTI=nome1,nome2: strumenti veri esposti in più (anche in modalità porta).
//   Le risposte di rea_call si snelliscono: di un record di evidenza restano id, operazione, risultato normalizzato,
//   confidenza e limiti (~80% era provenienza: profilo di analisi, digest, raw_result doppio); ogni limite solo la prima
//   volta nella sessione (quelli di Ghidra si ripetono identici a ogni chiamata). REA_COMPLETO=1: intere.
import { spawn } from "node:child_process";

const NATIVO = `open_binary close_binary binary_session binary_overview list_procedures search_procedures procedure_info
  procedure_pseudo_code procedure_assembly procedure_callers procedure_callees list_strings search_strings xrefs
  find_xrefs_to_name list_segments list_names read_bytes analyze_function batch_decompile get_call_graph trace_feature
  trace_call_path inspect_artifact inspect_native_api set_comment set_address_name inspect_address_context`.split(/\s+/);
const DOTNET = [...NATIVO, "inspect_managed_artifact", "inspect_managed_members", "inspect_managed_native_boundaries"];
const profilo = process.env.REA_PROFILO || "porta";
const extra = (process.env.REA_STRUMENTI || "").split(",").map((s) => s.trim()).filter(Boolean);
const ammessi = profilo === "tutto" ? null
  : new Set([...(profilo === "dotnet" ? DOTNET : profilo === "nativo" ? NATIVO : []), ...extra]);

const PORTA = [
  {
    name: "rea_describe",
    description: "Describe REA reverse-engineering tools: full description and JSON input schema. Pass one name or several. " +
      "Tool names and groups are in the `rea` skill; call this before the first rea_call of a tool you have not used yet.",
    inputSchema: { type: "object", properties: { names: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["names"], additionalProperties: false },
  },
  {
    name: "rea_call",
    description: "Run one REA tool by name with its arguments object (as given by rea_describe). The REA session keeps the " +
      "open target and its analysis between calls. Paths must be absolute.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, arguments: { type: "object" } },
      required: ["name"], additionalProperties: false },
  },
];

let catalogo = null;            // nome -> strumento, dalla prima tools/list del server
const inAttesa = [];            // richieste rea_describe arrivate prima del catalogo
const daSnellire = new Set();   // id delle tools/call arrivate da rea_call
const completo = process.env.REA_COMPLETO === "1";
const limitiVisti = new Set();
const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const testo = (id, t, isError = false) => out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: t }], isError } });

const rea = spawn("rea", ["mcp"], { stdio: ["pipe", "pipe", "inherit"] });
rea.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => rea.kill(s));
process.stdin.on("end", () => rea.stdin.end());
const alServer = (m) => rea.stdin.write(JSON.stringify(m) + "\n");

righe(process.stdin, (riga) => {
  let m;
  try { m = JSON.parse(riga); } catch { return rea.stdin.write(riga + "\n"); }
  if (profilo !== "porta" || m.method !== "tools/call") return alServer(m);
  const { name, arguments: a = {} } = m.params ?? {};
  if (name === "rea_describe") return catalogo ? descrivi(m.id, a) : chiediCatalogo(m.id, a);
  if (name === "rea_call") {
    let args = a.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { return testo(m.id, "arguments must be a JSON object", true); } }
    if (catalogo && !catalogo.has(a.name)) return testo(m.id, `unknown REA tool «${a.name}»: see the rea skill for the names`, true);
    if (!completo) daSnellire.add(m.id);
    return alServer({ ...m, params: { ...m.params, name: a.name, arguments: args } });
  }
  return alServer(m);
});

righe(rea.stdout, (riga) => {
  let m;
  try { m = JSON.parse(riga); } catch { return process.stdout.write(riga + "\n"); }
  if (m.id === "__filtro_catalogo") {
    catalogo = new Map(m.result.tools.map((t) => [t.name, t]));
    for (const [id, a] of inAttesa.splice(0)) descrivi(id, a);
    return;
  }
  if (daSnellire.delete(m.id) && m.result) snellisci(m.result);
  const tools = m?.result?.tools;
  if (Array.isArray(tools)) {
    catalogo = new Map(tools.map((t) => [t.name, t]));
    const veri = tools.filter((t) => !ammessi || ammessi.has(t.name)).map(({ outputSchema, ...t }) => t);
    m.result.tools = profilo === "porta" ? [...PORTA, ...veri] : veri;
  }
  out(m);
});

const TOGLI = ["subject", "provider", "analysis_profile", "predicate_type", "parameters", "raw_result", "authority", "environment"];
function snellisci(res) {
  delete res.structuredContent;
  for (const c of res.content ?? []) {
    if (c.type !== "text") continue;
    let e;
    try { e = JSON.parse(c.text); } catch { continue; }
    if (!e || typeof e !== "object" || !("normalized_result" in e)) continue;
    for (const k of TOGLI) delete e[k];
    if (Array.isArray(e.limitations)) {
      e.limitations = e.limitations.filter((l) => !limitiVisti.has(l) && limitiVisti.add(l));
      if (!e.limitations.length) delete e.limitations;
    }
    for (const k of ["locations", "evidence_links"]) if (Array.isArray(e[k]) && !e[k].length) delete e[k];
    c.text = JSON.stringify(e);
  }
}

function chiediCatalogo(id, a) {
  inAttesa.push([id, a]);
  if (inAttesa.length === 1) alServer({ jsonrpc: "2.0", id: "__filtro_catalogo", method: "tools/list" });
}

function descrivi(id, a) {
  const nomi = Array.isArray(a.names) ? a.names : [a.names ?? a.name].filter(Boolean);
  const r = nomi.map((n) => {
    const t = catalogo.get(n);
    return t ? `## ${n}\n${t.description}\ninput: ${JSON.stringify(t.inputSchema)}` : `## ${n}\nunknown tool`;
  });
  testo(id, r.join("\n\n"));
}

function righe(flusso, f) {
  let buf = "";
  flusso.setEncoding("utf8");
  flusso.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const riga = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (riga.trim()) f(riga);
    }
  });
}
