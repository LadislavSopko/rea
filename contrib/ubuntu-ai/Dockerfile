# REA (morluto/rea, MIT): server MCP per il reverse engineering con agenti, in un container: niente sul PC di ©User.
# Node 24 + rea-agents + Ghidra 12.1.4 (decompilatore nativo linux_x86_64) + JDK 21. Server MCP su stdio: `rea mcp`
# dietro filtro.mjs (solo gli strumenti del profilo REA_PROFILO: i 139 interi non entrano nel contesto di un modello locale).
# Motori montati: Ghidra (nativo) + pwntools (ELF offline/crash) + unblob+binwalk (firmware) + Google Chrome (web)
# + jadx (Android) + wakaru (recovery JS) + ghidra-nativeaot (metadati .NET NativeAOT) + pwndbg/GDB + esbuild
# (source-map web). .NET statico, EVM e analisi JS/Electron girano gia' senza motore extra. NON montati: Hopper e IDA
# (a licenza) e ilspycmd (decompilatore .NET; tool-host .NET 6/9 non risolvibile qui, e l'analisi .NET di REA non lo
# richiede). Ogni passo di build si auto-segnala (PASS/SKIPPED): un insuccesso non affonda l'immagine.
# Registrazione in OpenCode e uso: README.md di questa cartella.
FROM node:24-bookworm-slim AS node

FROM eclipse-temurin:21-jdk-noble
SHELL ["/bin/bash", "-c"]
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
# pkgs base + toolchain di build (Rust/C/CMake), gdb (pwndbg), estrattori (unblob), .NET SDK (ilspy)
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl ca-certificates python3 file binutils git \
 && apt-get install -y --no-install-recommends python3-venv build-essential pkg-config cmake \
      libfontconfig1-dev libssl-dev libasound2-dev \
 && apt-get install -y --no-install-recommends p7zip-full cpio zstd lz4 lzop bzip2 gdb \
 && rm -rf /var/lib/apt/lists/*

ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
RUN curl -fsSL -o /tmp/ghidra.zip "$GHIDRA_URL" && unzip -q /tmp/ghidra.zip -d /opt && rm /tmp/ghidra.zip \
 && mv /opt/ghidra_12.1.4_PUBLIC /opt/ghidra
ENV GHIDRA_INSTALL_DIR=/opt/ghidra GHIDRA_HEADLESS_MAXMEM=8G

ARG REA_VERSION=6.3.0
RUN npm install --global --no-audit --no-fund rea-agents@${REA_VERSION} && npm cache clean --force

# --- motori opzionali (tutti come root, prima di USER 1000). Ogni passo PASS/SKIPPED. ---

# ELF diagnostics + crash registrati: pwntools 4.15.0 + pyelftools 0.33 + Unicorn 2.1.2 in un venv isolato
RUN python3 -m venv /opt/rea-pwntools \
 && /opt/rea-pwntools/bin/pip install --no-cache-dir "pwntools==4.15.0" "pyelftools==0.33" "unicorn==2.1.2" \
 && chmod -R a+rX /opt/rea-pwntools && echo "PASS pwntools"

# Firmware (estrazione): unblob in un venv dedicato
RUN python3 -m venv /opt/rea-firmware \
 && /opt/rea-firmware/bin/pip install --no-cache-dir unblob \
 && chmod -R a+rX /opt/rea-firmware && echo "PASS unblob"

# Web: Google Chrome stabile (il pacchetto `chromium` di noble e' uno stub snap e non gira in container)
RUN curl -fsSL -o /tmp/chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" \
 && apt-get update && apt-get install -y /tmp/chrome.deb && rm -f /tmp/chrome.deb && rm -rf /var/lib/apt/lists/* \
 && echo "PASS google-chrome"

# Android: jadx-headless-mcp 0.7.1 (JAR con SHA-256 verificato, come scripts/fixtures/android/fetch.mjs)
RUN curl -fsSL -o /opt/rea-jadx.jar \
   "https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar" \
 && echo "6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75  /opt/rea-jadx.jar" | sha256sum -c - \
 && chmod a+rX /opt/rea-jadx.jar && echo "PASS jadx"

# Web source-map compiler: esbuild
RUN npm install -g --no-audit --no-fund esbuild && esbuild --version && echo "PASS esbuild"

# Nota: ilspycmd (decompilatore .NET) NON e' montato: le sue build da "dotnet tool" richiedono un tool-host
# .NET 6/9 che non si risolve con gli SDK 8 disponibili; REA fa gia' l'analisi .NET (metadata/CIL/native) senza.
# Per aggiungerlo piu' tardi: installa un SDK .NET >= 9 coerente e poni REA_ILSPY_CMD_PATH=<abs ilspycmd>.

# Rust: toolchain moderna (rustc>=1.77) per Binwalk 3.1.0 e Wakaru 1.13.0; tolta dopo la build
RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup-init \
 && sh /tmp/rustup-init -y --profile minimal --default-toolchain stable >/tmp/rustup.log 2>&1 \
 && . /root/.cargo/env \
 && git clone https://github.com/ReFirmLabs/binwalk /tmp/binwalk >/dev/null 2>&1 \
 && git -C /tmp/binwalk checkout 4fdab3d464d97b68e0af9088df3f9e2e1545b21c >/dev/null 2>&1 \
 && (cd /tmp/binwalk && cargo build --release >/tmp/bw.log 2>&1) && cp /tmp/binwalk/target/release/binwalk /opt/rea-binwalk \
    && /opt/rea-binwalk --version >/dev/null 2>&1 && echo "PASS binwalk" || echo "SKIPPED binwalk (vedi /tmp/bw.log)"
RUN . /root/.cargo/env \
 && git clone https://github.com/pionxzh/wakaru /tmp/wakaru >/dev/null 2>&1 \
 && git -C /tmp/wakaru checkout 6070266d24b32951fa2fe1d2dad5b4313bd5c81b >/dev/null 2>&1 \
 && (cd /tmp/wakaru && cargo build --release >/tmp/wk.log 2>&1) \
 && (test -f /tmp/wakaru/target/release/wakaru && cp /tmp/wakaru/target/release/wakaru /opt/rea-wakaru) \
    && test -f /opt/rea-wakaru && /opt/rea-wakaru --version >/dev/null 2>&1 && echo "PASS wakaru" || echo "SKIPPED wakaru (vedi /tmp/wk.log)"
RUN rm -rf /tmp/binwalk /tmp/wakaru "$HOME/.cargo" "$HOME/.rustup" && echo "rust toolchain rimossa"

# Ghidra NativeAOT: costruito dal facade REA (javac21+jar+git) contro il Ghidra gia' montato
RUN git clone --depth 1 --branch main-laco https://github.com/LadislavSopko/rea.git /tmp/reasrc >/dev/null 2>&1 \
 && git -C /tmp/reasrc submodule update --init third_party/ghidra-nativeaot >/dev/null 2>&1 \
 && (GHIDRA_INSTALL_DIR=/opt/ghidra node /tmp/reasrc/scripts/build-ghidra-nativeaot.mjs >/tmp/naot.log 2>&1) \
 && cp /tmp/reasrc/_reference/nativeaot-integration/extension/rea-ghidra-nativeaot.jar /opt/rea-nativeaot.jar \
    && echo "PASS ghidra-nativeaot" || echo "SKIPPED ghidra-nativeaot (vedi /tmp/naot.log)"
RUN rm -rf /tmp/reasrc

# Crash registrati (mappa debugger): pwndbg (unchanged) in un venv + gdb gia' installato
RUN git clone https://github.com/pwndbg/pwndbg /opt/pwndbg >/dev/null 2>&1 \
 && python3 -m venv /opt/rea-pwndbg-venv \
 && /opt/rea-pwndbg-venv/bin/pip install --no-cache-dir /opt/pwndbg >/tmp/pwndbg.log 2>&1 \
 && chmod -R a+rX /opt/pwndbg /opt/rea-pwndbg-venv \
    && echo "PASS pwndbg" || echo "SKIPPED pwndbg (vedi /tmp/pwndbg.log)"

# Discovery provider: REA trova i motori da queste variabili. Se un binario non c'e' (passo SKIPPED), REA riporta
# semplicemente quel motore come non disponibile: nessuna analisi rotta, nessuna assunzione.
ENV REA_PWNTOOLS_PYTHON=/opt/rea-pwntools/bin/python \
    REA_UNBLOB_COMMAND=/opt/rea-firmware/bin/unblob \
    REA_BINWALK_COMMAND=/opt/rea-binwalk \
    REA_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
    REA_BROWSER_NO_SANDBOX=1 \
    REA_WEB_SOURCE_MAP_COMPILER=/usr/local/bin/esbuild \
    REA_JADX_MCP_JAR=/opt/rea-jadx.jar \
    REA_WAKARU_COMMAND=/opt/rea-wakaru \
    REA_GHIDRA_NATIVEAOT_JAR=/opt/rea-nativeaot.jar \
    REA_PWNDBG_GDB=/usr/bin/gdb \
    REA_PWNDBG_GDBINIT=/opt/pwndbg/gdbinit.py \
    REA_PWNDBG_VENV_PATH=/opt/rea-pwndbg-venv

COPY filtro.mjs /opt/rea/filtro.mjs
COPY skill /opt/rea/skill

# utente 1000 = laco in WSL: i file scritti nel progetto montato restano suoi
USER 1000:1000
ENV HOME=/tmp/rea-home
WORKDIR /work
CMD ["node", "/opt/rea/filtro.mjs"]
