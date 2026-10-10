---
name: rea
description: Reverse engineer binaries and packages (ELF/PE/Mach-O executables, .NET assemblies, archives) with REA through two MCP tools, rea_describe and rea_call. Use it when a question depends on a compiled artifact without source - what a program does, what input it accepts, how a function works - and to decompile, trace strings and calls, or annotate.
---

# REA - reverse engineering through rea_call

REA has 139 tools. You do not see them directly: you see two.
- `rea_describe({"names": ["tool_a", "tool_b"]})` returns each tool's full description and JSON input schema.
- `rea_call({"name": "tool", "arguments": {...}})` runs it.

The REA session remembers the open target and Ghidra's analysis between calls: open once, then ask many questions.
Call `rea_describe` before you first use a tool not listed with its arguments below. Results are JSON evidence records:
read the `result` part, the rest is provenance.

## Rules
- Paths are ABSOLUTE and must be inside the project folder (`/home/laco/re-lab/...`): REA runs in a container that only
  sees this folder.
- One target at a time: `open_binary` switches target.
- The deep engine here is **Ghidra 12.1.4** (headless). Extra engines already wired in the image: **pwntools**
  (offline ELF layout/mitigations + recorded crashes), **unblob** (firmware extraction), **Google Chrome** (web),
  **jadx-headless-mcp** (Android). .NET static, EVM and JS/Electron analysis need no engine. Still NOT installed:
  Hopper and IDA (no license) — so Hopper-only tools (`current_address`, `current_procedure`, `current_document`,
  `goto_address`, `next_address`, `prev_address`, bookmarks) do not work; also Binwalk (firmware *region inspection*,
  a Rust build), Wakaru (JS source recovery), ghidra-nativeaot, pwndbg/LLDB.
- Addresses are hexadecimal strings as REA returns them (e.g. `"0x101169"`); procedures can be named by symbol or address.
- Stripped binaries have no names: functions are `FUN_00101169`-style. Find the interesting one through STRINGS
  (messages like "invalid", "license", "password") and their cross-references, not by reading every function.

## Native binary: the usual path (arguments are exact)
1. `open_binary {"path": "/home/laco/re-lab/<file>"}` - format, architecture, sha256.
2. `binary_overview {}` - segments, number of procedures and strings.
3. `search_strings {"pattern": "valid"}` (literal, case-insensitive; `"mode": "regex"` for a regex) or `list_strings {}`.
4. `xrefs {"address": "<string address>"}` - who uses that string; or in one go `trace_feature {"query": "<exact string>"}`
   (string -> xrefs -> containing procedures).
5. `procedure_pseudo_code {"procedure": "<name or address>"}` - C-like decompilation. `batch_decompile {"addresses": [...]}` for several.
6. `procedure_callees` / `procedure_callers {"procedure": ...}`, `get_call_graph {"address": ..., "direction": "forward"}` (forward = callees, backward = callers) - follow the flow.
7. Data the code reads (tables, keys): `read_bytes {"address": "<addr>", "length": <n>}`.
8. Optional, to keep notes: `set_address_name {"address": ..., "name": ...}`, `set_comment {"address": ..., "comment": ...}`.
Check a claim by RUNNING the program when that is safe (it is a local file you may execute with bash), not by guessing.

## Catalog by group (name - what it does)

**Open and session:** open_binary - open executable/bundle/archive/JS/plist · binary_session - current target and
capabilities · close_binary - close, optional snapshot · list_documents - provider documents.

**Native navigation (Ghidra):** binary_overview · list_procedures · search_procedures [pattern] · procedure_info
[procedure] · procedure_address [procedure] · procedure_pseudo_code [procedure] · procedure_assembly [procedure] ·
read_function_instructions [procedure] · procedure_callers [procedure] · procedure_callees [procedure] ·
procedure_references [procedure] · resolve_containing_procedure [address] · list_strings · search_strings [pattern] ·
xrefs · find_xrefs_to_name [name] · list_names · address_name · list_segments · read_bytes [address] ·
address_to_file_offset [address] · inspect_address_context [address] · get_navigation_context · comment · inline_comment.

**Native analysis:** analyze_function [procedure] - full dossier of one function · batch_decompile - many at once ·
get_call_graph [address] · trace_call_path [start] - callers/callees until a goal · trace_feature [query] - string ->
code · trace_native_values [procedure] - static data dependencies · inspect_native_api [procedure] - API boundary ·
inspect_native_instruction [address] · resolve_native_call_targets [address] · inspect_native_data_type ·
inspect_native_load_image - DOS MZ/COM images.

**Annotate:** set_address_name [address,name] · set_addresses_names [names] · set_comment [address,comment] ·
set_inline_comment [address,comment] · annotate_native_function [procedure].

**Artifacts and layout:** inspect_artifact - archive/package in one call · extract_artifact · inspect_binary_layout [path]
- headers/sections without launching · inspect_analysis_view [source,view] · inspect_recorded_crash [path] - ELF core ·
inspect_evm_interface [path,encoding] - EVM bytecode.

**.NET (managed PE/CLI):** inspect_managed_artifact - assembly identity, framework · inspect_managed_members - types,
methods, CIL, call edges · inspect_managed_native_boundaries - P/Invoke · compare_managed_members [left,right] ·
verify_managed_native_boundaries · import_managed_reconstruction · project_managed_application_graph.

**Apple (Mach-O, .app, untested here):** inspect_macho · inspect_signature · inspect_plist · list_architectures ·
demangle_swift [symbols] · analyze_swift_types · get_objc_classes · get_objc_protocols · inspect_native_dispatch_metadata
· decode_interface_builder · inspect_keyed_archive · inspect_asset_catalog · trace_dylib_resolution ·
project_apple_application_graph · trace_native_ui_action / observe_native_ui / capture_native_ui_scenario /
observe_native_calls (macOS only).

**Running a process:** capture_process_scenario [executable] - run a command under a PTY and record what it does ·
compare_process_captures [left,right].

**Compare versions:** compare_artifacts [left,right] · compare_functions [left,right] · compare_bundles · find_changed_behavior
· build_call_path [functions,start,goal] · correlate_static_and_runtime.

**Evidence and open questions:** get_evidence_bundle · export_evidence_bundle [path] · import_evidence_bundle [path] ·
list_unknowns · record_unknown · update_unknown · verify_unknown_resolution · verify_reconstruction [specification] ·
build_reconstruction_obligation_ledger · evaluate_reconstruction_coverage.

**Available with the engines wired in this image:** offline ELF (`inspect_binary_layout`, `inspect_recorded_crash` -
pwntools), firmware extraction (`extract_firmware` - unblob), web/Electron (`list_browser_targets`, `inspect_web_page`,
`analyze_web_bundle`, `observe_web_*`, `capture_browser_scenario`, `trace_web_*`, `export_web_scripts`, `compare_web_*`,
`*_electron_*` - Chrome), Android (`search_android_classes`, `inspect_android_*`, `trace_android_references`,
`project_android_application_graph` - jadx), plus .NET (`inspect_managed_*`, `compare_managed_members`,
`verify_managed_native_boundaries`, `import_managed_reconstruction`), EVM (`inspect_evm_interface`) and static
JS/ASAR (`analyze_javascript_application`, `trace_application_feature`, `compare_application_versions`,
`compare_source_to_bundle`, `reconcile_javascript_runtime`) which need no engine.

**Not available in this setup:** Hopper/IDA (native analysis uses only Ghidra, so the Hopper-only cursor/GUI tools do
not work); firmware *region inspection* `inspect_firmware_regions` (needs a Rust Binwalk 3.1.x - build it and set
`REA_BINWALK_COMMAND`); JavaScript source recovery `recover_javascript_sources` (needs Wakaru); the JavaScript
*runtime* observers (`list_javascript_runtime_targets`, `observe_javascript_runtime`); the Apple/macOS-only UI observers
(`trace_native_ui_action`, `observe_native_ui`, `capture_native_ui_scenario`, `observe_native_calls`); pwndbg/GDB
runtime mapping. Enabling an optional engine is only configuration (see README): REA never installs engines itself.
