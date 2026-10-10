# REA in Docker per OpenCode e modelli locali (10/10/2026)

Ramo `main-laco` (predefinito) del fork personale `LadislavSopko/rea`: tutto quello che serve per usare REA con un modello locale
(OpenCode + llama-swap su ubuntu-ai) sta in questa cartella; il codice di REA non è toccato. Il progetto che lo usa
(`ubuntu-ai/docker/rea`) costruisce l'immagine da qui:
`docker build -t ubuntu-ai/rea:6.3.0 https://github.com/LadislavSopko/rea.git#main-laco:contrib/ubuntu-ai`.

[REA](https://github.com/morluto/rea) (MIT): server MCP che dà a un agente gli strumenti del reverse engineering (Ghidra,
.NET, Android, firmware, web). Qui: `rea-agents` 6.3.0 + Ghidra 12.1.4 + JDK 21 nell'immagine `ubuntu-ai/rea:6.3.0`,
niente sul PC.

```
docker compose build                                  # da questa cartella
docker compose run --rm rea rea doctor --json         # Ghidra, JDK e decompilatore nativo: healthy (Hopper e IDA no)
```

## Il filtro (`filtro.mjs`): due strumenti + una skill

REA espone **139 strumenti**: descrizioni e schemi d'ingresso fanno ~606k caratteri (~150k token), che OpenCode manderebbe
a ogni richiesta. Il filtro sta davanti a `rea mcp` e nella modalità predefinita (`REA_PROFILO=porta`) il modello vede
**2 strumenti, 820 caratteri**:
- `rea_describe {"names": [...]}`: descrizione e schema d'ingresso degli strumenti nominati (dal catalogo del server);
- `rea_call {"name": ..., "arguments": {...}}`: esegue lo strumento vero; la sessione (bersaglio aperto, analisi Ghidra)
  resta nel server fra una chiamata e l'altra.

Il catalogo sta nella skill **`rea`** (`skill/SKILL.md`, 7 KB, caricata solo quando serve): regole (percorsi assoluti,
solo Ghidra, cosa non è installato), il percorso tipico per un binario con gli argomenti esatti, i 139 nomi per gruppo.

Le risposte di `rea_call` si snelliscono: di un record di evidenza restano id, operazione, `normalized_result`,
confidenza e limiti, e ogni limite solo la prima volta nella sessione (pseudocodice di una funzione: 3.200 → 1.140
caratteri). `REA_COMPLETO=1` le lascia intere. Altri profili, con gli strumenti veri: `nativo` (28), `dotnet` (31),
`tutto` (139); `REA_STRUMENTI=a,b` aggiunge strumenti veri.

## OpenCode

Progetto di prova `~/re-lab` in WSL Ai (separato da `open-code-test`, così i giri TDDAB non si portano dietro REA):
`opencode.json` di questa cartella + `skill/SKILL.md` in `.opencode/skills/rea/`. Il container
monta `~/re-lab` allo stesso percorso: i bersagli vanno messi lì e REA vuole percorsi **assoluti**. `timeout` 60 s: la
prima risposta aspetta l'avvio del container. Verifica: `cd ~/re-lab && opencode mcp list` → `✓ rea connected`.

Bersaglio di prova: `retrocalc` (da `retrocalc.c`, `gcc -O2 -s`, senza simboli): chiede una chiave di licenza. Il sorgente
resta fuori da `~/re-lab`. Domanda per il modello: «Che chiave accetta `/home/laco/re-lab/retrocalc`? Usa REA.»
