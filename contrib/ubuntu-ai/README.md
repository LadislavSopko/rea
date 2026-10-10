# REA in Docker per OpenCode e modelli locali (10/10/2026)

Ramo `main-laco` (predefinito) del fork personale `LadislavSopko/rea`: tutto quello che serve per usare REA con un modello
locale (OpenCode + llama-swap su ubuntu-ai) sta in questa cartella, compreso il compose; il codice di REA non è toccato.

[REA](https://github.com/morluto/rea) (MIT): server MCP che dà a un agente gli strumenti del reverse engineering (Ghidra,
.NET, Android, firmware, web). Qui: `rea-agents` 6.3.0 + Ghidra 12.1.4 + JDK 21 nell'immagine `ubuntu-ai/rea:6.3.0`
(~2,7 GB su disco), niente installato fuori da Docker.

| file | cosa |
|------|------|
| `Dockerfile` | Node 24 + `rea-agents` + Ghidra 12.1.4 (decompilatore nativo linux_x86_64) + JDK 21, utente 1000 |
| `compose.yaml` | progetto compose `ubuntu-ai`, servizio `rea`: solo per costruire e provare l'immagine |
| `filtro.mjs` | sta davanti a `rea mcp`: il modello vede 2 strumenti invece di 139 (sotto) |
| `skill/SKILL.md` | skill `rea` per OpenCode: regole, percorso tipico, i 139 nomi per gruppo |
| `opencode.json` | registrazione MCP del progetto di prova `~/re-lab` |
| `retrocalc.c` | bersaglio di prova: chiede una chiave di licenza |

## Installazione

Su una macchina con Docker e OpenCode (qui: WSL Ai, utente `laco`, uid 1000). Tutti i comandi in WSL.

**1. Immagine.** Dal clone del fork:
```
cd <clone>/contrib/ubuntu-ai
docker compose build
docker compose run --rm rea rea doctor --json       # Ghidra, JDK e decompilatore nativo: healthy (Hopper e IDA no)
```
Oppure senza clone, direttamente dal ramo:
```
docker build -t ubuntu-ai/rea:6.3.0 https://github.com/LadislavSopko/rea.git#main-laco:contrib/ubuntu-ai
```

**2. Progetto.** Una cartella dedicata, separata dai progetti di sviluppo (così i giri TDDAB non si portano dietro REA):
```
mkdir -p ~/re-lab/.opencode/skills && cd ~/re-lab && git init
cp <clone>/contrib/ubuntu-ai/opencode.json .
docker run --rm -v ~/re-lab/.opencode/skills:/out ubuntu-ai/rea:6.3.0 cp -r /opt/rea/skill /out/rea
```
La skill si prende dall'immagine, così è sempre quella che va col filtro. In `opencode.json` il percorso montato è
`/home/laco/re-lab`: per un altro utente o un'altra cartella cambiare le due occorrenze (montaggio e `-w`).

**3. Verifica.**
```
cd ~/re-lab && opencode mcp list                    # → ✓ rea connected
```
`timeout` 60 s nella configurazione: la prima risposta aspetta l'avvio del container.

**4. Bersaglio di prova.** Il sorgente resta fuori da `~/re-lab`, nel progetto va solo il binario senza simboli:
```
gcc -O2 -s -o ~/re-lab/retrocalc <clone>/contrib/ubuntu-ai/retrocalc.c
```
In OpenCode, dentro `~/re-lab`: «Che chiave accetta `/home/laco/re-lab/retrocalc`? Usa REA.»

**Aggiornare:** cambiare `REA_VERSION` (o `GHIDRA_URL`) nel `Dockerfile`, rifare il punto 1 e ricopiare la skill.
**Togliere:** `docker compose down --rmi all` (o `docker rmi ubuntu-ai/rea:6.3.0`) e la voce `rea` da `opencode.json`.

### Come gira

Il server MCP **non è un servizio fisso**: OpenCode lancia `docker run -i --rm --init ...` a ogni sessione e parla col
container su stdio; a fine sessione il container sparisce. Il container monta `~/re-lab` **allo stesso percorso**: i
bersagli vanno messi lì e REA vuole percorsi **assoluti**. Gira come uid 1000, quindi i file che scrive nel progetto
restano dell'utente.

Le opzioni del filtro si passano al container aggiungendo `"-e", "REA_PROFILO=nativo"` (ecc.) al `command` di
`opencode.json`, prima del nome dell'immagine.

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
caratteri).

| variabile | effetto |
|-----------|---------|
| `REA_PROFILO=porta` | predefinito: `rea_describe` + `rea_call` |
| `REA_PROFILO=nativo` / `dotnet` / `tutto` | gli strumenti veri del profilo: 28 / 31 / 139 |
| `REA_STRUMENTI=a,b` | strumenti veri esposti in più (anche in modalità porta) |
| `REA_COMPLETO=1` | risposte intere, senza snellire |
