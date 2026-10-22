# Project constraints

- All generated data, caches, logs, tools and temporary files stay under D:\ChatGPT.
- Use D:\ChatGPT\Tools\dotnet\dotnet.exe with process-scoped TEMP/TMP, DOTNET_CLI_HOME and NuGet cache paths on D:.
- Stage 1 is the game bridge, telemetry coverage and measured overhead. Do not build screens before this is verified.
- UI uses normal HTML/CSS and semantic interactive elements with hover/focus states. CRT/VFX belongs to a separate optional overlay library; never bake effects into assets or layout.
- All user-visible UI strings, including native messages, tooltips and accessibility labels, live in JSON locale files. Ship Russian only for now; use locale-aware numbers/time and a locale catalog for future languages.
- Match Concepts typography with bundled Cyrillic slab-serif monospace fonts. Fullscreen operates on the window's current monitor, including mixed DPI, and restores the original window placement. F11 toggles; Escape exits.
- Never let UI requests trigger game scans. Collect under bounded budgets, cache, label data age and coverage.
- Do not replace a running player's save with a test copy. Validation copies must be explicitly identified.
- Distinguish measured telemetry, estimates, unsupported fields and insufficient history.
- No AI model is needed at runtime. MCP calls and HTTP routes are fixed in code.
