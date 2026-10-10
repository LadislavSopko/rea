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

**1. Immagine.** Dal clone del fork in WSL (, niente copie su Windows):
```
cd ~/rea/contrib/ubuntu-ai
docker compose build
docker compose run --rm rea rea doctor --json       # tutte le voci ghidra-*: healthy
```
`healthy: false` complessivo è normale: Hopper e IDA non ci sono (`missing_analysis_engine`) e `skill:identity` dà
`config_drift` perché la skill di REA non si installa, si usa la nostra.

Oppure senza clone, direttamente dal ramo:
```
docker build -t ubuntu-ai/rea:6.3.0 https://github.com/LadislavSopko/rea.git#main-laco:contrib/ubuntu-ai
```

**2. Progetto.** Una cartella dedicata, separata dai progetti di sviluppo (così i giri TDDAB non si portano dietro REA):
```
mkdir -p ~/re-lab/.opencode/skills && cd ~/re-lab && git init
cp ~/rea/contrib/ubuntu-ai/opencode.json .
docker run --rm -v ~/re-lab/.opencode/skills:/out ubuntu-ai/rea:6.3.0 cp -r /opt/rea/skill /out/rea
```
La skill si prende dall'immagine, così è sempre quella che va col filtro. Il percorso del progetto è
`/home/laco/re-lab`: per un altro utente o un'altra cartella cambiarlo in `opencode.json` (montaggio e `-w`) e negli
esempi di `.opencode/skills/rea/SKILL.md`. Per un uid diverso da 1000 cambiare anche `USER` nel `Dockerfile`.

**3. Verifica.**
```
cd ~/re-lab && opencode mcp list                    # → ✓ rea connected
```
`timeout` 60 s nella configurazione: la prima risposta aspetta l'avvio del container.

**4. Bersaglio di prova.** Il sorgente resta fuori da `~/re-lab`, nel progetto va solo il binario senza simboli:
```
gcc -O2 -s -o ~/re-lab/retrocalc ~/rea/contrib/ubuntu-ai/retrocalc.c
```
In OpenCode, dentro `~/re-lab`: «Che chiave accetta `/home/laco/re-lab/retrocalc`? Usa REA.»

**Aggiornare:** cambiare `REA_VERSION` (o `GHIDRA_URL`) nel `Dockerfile`, rifare il punto 1 e ricopiare la skill.
**Togliere:** `docker compose down --rmi all` (o `docker rmi ubuntu-ai/rea:6.3.0`) e la voce `rea` da `opencode.json`.

## Uso: non si avvia a mano

Una volta installato, REA **non si starta**: lo accende OpenCode.

```
# WSL Ai
cp <binario> ~/re-lab/                   # REA vede solo questa cartella
cd ~/re-lab && opencode
```
e si chiede, con il percorso assoluto: «Che chiave accetta `/home/laco/re-lab/retrocalc`? Usa REA.» Il modello carica la
skill `rea` e lavora con `rea_describe` / `rea_call`.

**Cosa succede sotto:**
- all'avvio della sessione OpenCode legge `~/re-lab/opencode.json` e lancia da solo
  `docker run -i --rm --init -v /home/laco/re-lab:/home/laco/re-lab -w /home/laco/re-lab ubuntu-ai/rea:6.3.0`;
  parla col container su stdio (`rea mcp` dietro `filtro.mjs`);
- il container **resta acceso per tutta la sessione**: bersaglio aperto e analisi Ghidra non si perdono fra una domanda e
  l'altra;
- chiuso OpenCode, il container **sparisce** (`--rm`): niente servizio fisso, niente porte, niente da spegnere.

**Dove gira:** sul PC (LACO_WIN11), nel Docker Desktop, che è anche il Docker di WSL Ai. Il modello resta su ubuntu-ai
(llama-swap :8080): da lì arrivano solo le risposte del modello, REA e Ghidra lavorano sul PC.

**Condizioni:**
- **Docker Desktop acceso**: se è spento OpenCode segna `rea` non connesso e il resto va lo stesso;
- **OpenCode lanciato dentro `~/re-lab`**: REA è registrato solo nel progetto, non nella configurazione globale, quindi
  dalle altre cartelle non c'è (voluto: i progetti di sviluppo non si portano dietro REA);
- bersagli **dentro `~/re-lab`** e percorsi **assoluti**: il container monta solo quella cartella, allo stesso percorso;
  gira come uid 1000, quindi i file che scrive nel progetto restano dell'utente.

**Controllo:** `cd ~/re-lab && opencode mcp list` → `✓ rea connected`. La prima risposta può metterci qualche secondo
(avvio del container): per questo `timeout` è 60 s.

Le opzioni del filtro (tabella sotto) si passano al container aggiungendo `"-e", "REA_PROFILO=nativo"` (ecc.) al
`command` di `opencode.json`, prima del nome dell'immagine.

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
