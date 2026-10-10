# REA (morluto/rea, MIT): server MCP per il reverse engineering con agenti, in un container: niente sul PC di ©User.
# Node 24 + rea-agents + Ghidra 12.1.4 (decompilatore nativo linux_x86_64) + JDK 21. Server MCP su stdio: `rea mcp`
# dietro filtro.mjs (solo gli strumenti del profilo REA_PROFILO: i 139 interi non entrano nel contesto di un modello locale).
# Registrazione in OpenCode e uso: README.md di questa cartella.
FROM node:24-bookworm-slim AS node

FROM eclipse-temurin:21-jdk-noble
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl ca-certificates python3 file binutils git \
 && rm -rf /var/lib/apt/lists/*

ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
RUN curl -fsSL -o /tmp/ghidra.zip "$GHIDRA_URL" && unzip -q /tmp/ghidra.zip -d /opt && rm /tmp/ghidra.zip \
 && mv /opt/ghidra_12.1.4_PUBLIC /opt/ghidra
ENV GHIDRA_INSTALL_DIR=/opt/ghidra GHIDRA_HEADLESS_MAXMEM=8G

ARG REA_VERSION=6.3.0
RUN npm install --global --no-audit --no-fund rea-agents@${REA_VERSION} && npm cache clean --force

COPY filtro.mjs /opt/rea/filtro.mjs
COPY skill /opt/rea/skill

# utente 1000 = laco in WSL: i file scritti nel progetto montato restano suoi
USER 1000:1000
ENV HOME=/tmp/rea-home
WORKDIR /work
CMD ["node", "/opt/rea/filtro.mjs"]
