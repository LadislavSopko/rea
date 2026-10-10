# REA (morluto/rea, MIT): server MCP per il reverse engineering con agenti, in un container: niente sul PC di ©User.
# Node 24 + rea-agents + Ghidra 12.1.4 (decompilatore nativo linux_x86_64) + JDK 21. Server MCP su stdio: `rea mcp`
# dietro filtro.mjs (solo gli strumenti del profilo REA_PROFILO: i 139 interi non entrano nel contesto di un modello locale).
# Motori opzionali montati (profili aggiuntivi): pwntools (layout ELF + crash registrati), unblob (estrazione firmware),
# Google Chrome (web), jadx-headless-mcp (Android). .NET statico, EVM e analisi JS/Electron girano già senza motore extra.
# Binwalk (ispezione regioni firmware) resta fuori: è scritto in Rust e REA richiede rustc>=1.77 (vedi README, opzionale).
# Restano fuori (motivi loro, vedi README): Hopper/IDA (senza licenza), Binwalk (Rust), Wakaru, ghidra-nativeaot, pwndbg/GDB.
# Registrazione in OpenCode e uso: README.md di questa cartella.
FROM node:24-bookworm-slim AS node

FROM eclipse-temurin:21-jdk-noble
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl ca-certificates python3 file binutils git \
 && apt-get install -y --no-install-recommends python3-venv \
 && apt-get install -y --no-install-recommends p7zip-full cpio zstd lz4 lzop bzip2 \
 && rm -rf /var/lib/apt/lists/*

ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
RUN curl -fsSL -o /tmp/ghidra.zip "$GHIDRA_URL" && unzip -q /tmp/ghidra.zip -d /opt && rm /tmp/ghidra.zip \
 && mv /opt/ghidra_12.1.4_PUBLIC /opt/ghidra
ENV GHIDRA_INSTALL_DIR=/opt/ghidra GHIDRA_HEADLESS_MAXMEM=8G

ARG REA_VERSION=6.3.0
RUN npm install --global --no-audit --no-fund rea-agents@${REA_VERSION} && npm cache clean --force

# --- motori opzionali: profili REA aggiuntivi (tutti installati come root, prima di USER 1000) ---

# ELF diagnostics + crash registrati: pwntools 4.15.0 + pyelftools 0.33 + Unicorn 2.1.2 in un venv isolato
RUN python3 -m venv /opt/rea-pwntools \
 && /opt/rea-pwntools/bin/pip install --no-cache-dir "pwntools==4.15.0" "pyelftools==0.33" "unicorn==2.1.2" \
 && chmod -R a+rX /opt/rea-pwntools

# Firmware (estrazione): unblob 26.6.x in un venv dedicato. Binwalk per l'ispezione regioni non e' montato: e' Rust
# (rustc>=1.77) e REA lo tratta come motore caller-supplied -> resta un'aggiunta opzionale documentata nel README.
RUN python3 -m venv /opt/rea-firmware \
 && /opt/rea-firmware/bin/pip install --no-cache-dir unblob \
 && chmod -R a+rX /opt/rea-firmware

# Web: Google Chrome stabile (il pacchetto `chromium` di noble e' uno stub snap e non gira in container)
RUN curl -fsSL -o /tmp/chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" \
 && apt-get update && apt-get install -y /tmp/chrome.deb && rm -f /tmp/chrome.deb && rm -rf /var/lib/apt/lists/*

# Android: jadx-headless-mcp 0.7.1 (JAR con SHA-256 verificato, come scripts/fixtures/android/fetch.mjs)
RUN curl -fsSL -o /opt/rea-jadx.jar \
   "https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar" \
 && echo "6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75  /opt/rea-jadx.jar" | sha256sum -c - \
 && chmod a+rX /opt/rea-jadx.jar

# Discovery provider: REA trova i motori da queste variabili (le versioni sono quelle verificate sopra).
# REA_BINWALK_COMMAND resta volutamente non impostato: senza di esso l'ispezione regioni firmware riporta la sua
# remediation standard ("set REA_BINWALK_COMMAND"), mentre extract-firmware (unblob) e' gia disponibile.
ENV REA_PWNTOOLS_PYTHON=/opt/rea-pwntools/bin/python \
    REA_UNBLOB_COMMAND=/opt/rea-firmware/bin/unblob \
    REA_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
    REA_BROWSER_NO_SANDBOX=1 \
    REA_JADX_MCP_JAR=/opt/rea-jadx.jar

COPY filtro.mjs /opt/rea/filtro.mjs
COPY skill /opt/rea/skill

# utente 1000 = laco in WSL: i file scritti nel progetto montato restano suoi
USER 1000:1000
ENV HOME=/tmp/rea-home
WORKDIR /work
CMD ["node", "/opt/rea/filtro.mjs"]
