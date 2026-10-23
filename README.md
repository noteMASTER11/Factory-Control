# Factory Control

A desktop control room for **Factorio on Windows x64**. Monitor production, power, logistics, research, resources and attacks on a second screen. Runs locally without an AI model or cloud service.

[Download published releases](https://github.com/noteMASTER11/Factory-Control/releases) · [Telemetry mod](mod/factory-telemetry/README.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

![Factory Control dashboard](docs/evidence/catalog-release-window.png)

## Current release

**[Factory Control 0.10.7](https://github.com/noteMASTER11/Factory-Control/releases/tag/v0.10.7)** is one Windows EXE with Factory Telemetry **0.10.7** built in. It detects Factorio 2.0 or 2.1 experimental and prepares the compatible collector automatically.

## Requirements and installation

- Windows x64 and Microsoft Edge WebView2 Runtime. The EXE bundles .NET and the telemetry collector.
- Factorio purchased separately: **2.0.77+** on the 2.0 branch, or **2.1.23+ experimental** on the 2.1 branch. Quality and Space Age are optional.

1. Download `FactoryControl.exe`, place it in a folder of your choice and launch it.
2. If Factorio is running, the application detects it. Otherwise, use **MOD** on the Connection screen and select the game's `factorio.exe`.
3. If collector installation or an update is needed, close Factorio and leave Factory Control open. It installs and enables the matching mod after the game exits. Then start Factorio and load your save with **Factory Telemetry Bridge** enabled.
4. Select the detected session and connect the dashboard.

No external installer, PowerShell or separate mod download is required for the desktop application. The collector is installed in the game's profile, while telemetry is read directly from its existing `script-output/factory-telemetry` folder. Other mods and existing exports are preserved; replaced collectors and mod-list backups are kept under the game profile's `FactoryControl/collector-backups` folder. A newer compatible collector is retained.

Keep the mod enabled when synchronizing a save's mod set. Installation is deferred while Factorio is running because the game can overwrite edits to `mod-list.json` on exit. The application does not close the game or replace your saves. If you close Factory Control before the game exits, reopen it to complete the pending setup.

**Manual mod installation:** the optional `FactoryTelemetry-0.10.7.zip` download contains `2.0` and `2.1` folders. Copy the inner `factory-telemetry_0.10.7.zip` from the matching folder into the game's `mods` directory without extracting it. Enable the mod in Factorio and restart the game. This archive is also useful for servers; it contains no desktop installer.

Application data, history, logs and cache default to `%LOCALAPPDATA%\FactoryControl`. Advanced launches accept `--data-root=<folder>`, `--game-executable=<path>` and `--game-profile=<folder>`; the last option overrides automatic game-profile detection. Existing configured data directories continue to work.

## Features

| View | What it shows |
|---|---|
| Overview | Persistent spatial machine issues, grouped nearby machines, measured locations, native map navigation, production history and conditional advice. Global deficits have no invented coordinates. |
| Power | Networks, generation and demand, sources and consumers, theoretical capacity, accumulator charge and history. |
| Production | Item/fluid flows, balance, monitored stock, recipes, idle states, demand coverage, conditional depletion, search and observed UPS. Table and native map views; Space Age imports/exports in material details. |
| Logistics | Robot networks, requests, deliveries, shortages, trains and cargo. Space Age tables and an interactive transport map with platforms, cargo pods, loading, cargo/quality filters and observed leg ETA. |
| Research | Current technology and level, progress, queue, science-pack flows, laboratory states and conditional ETA. |
| Resources | Surveyed resource chunks, deposit groups, remaining amounts, observed depletion and conditional exhaustion estimates. |
| Forecasts | Persistent deficits, reserve/zero-stock horizons, recipe relationships and production/demand scenarios. |
| Connection | Detected Factorio processes, session selection, channel state, data age and collection coverage. |
| Damage | Attacks, destroyed/rebuilt structures, outstanding rebuilding costs and comparison with monitored stock. |

- **11 languages:** English, German, Spanish, French, Czech, Hungarian, Estonian, Finnish, Portuguese, Russian and Ukrainian. First launch suggests the Windows interface language with English fallback; the choice remains available in settings. UI strings use JSON locale files.
- Resizable layout including 1024×768 and 1152×864, mixed-DPI support, fullscreen on the current monitor and 70–175% UI scale.
- Optional CRT effects, adjustable audio, ASCII startup and screen transitions. Attack alerts include a temporary red theme and an alarm that ends with the attack.
- UI and effects share a **30 FPS** cap. Background workers maintain history/models; hidden views stop rendering and native map requests.
- Native map imagery fills progressively and retains loaded imagery while panning or refreshing. Unknown or uncollected areas remain empty.
- Optional diagnostic logs, disabled by default, with a settings shortcut to their folder.

**Shortcuts:** F1 overview · F2 power · F3 production · F4 logistics · F5 refresh · F6 research · F7 resources · F8 forecasts · F9 connection · F10 settings · F11 fullscreen · Esc leave fullscreen/settings.

## Telemetry and limits

[Factory Telemetry Bridge](mod/factory-telemetry/README.md) adds no prototypes or gameplay changes. It exports completed snapshots to `script-output/factory-telemetry/` across eight channels: `status`, `production`, `machines`, `power`, `logistics`, `research`, `resources` and `combat`. Space transport observations are included in logistics; native map pixels are exported separately.

Collection is incremental: up to 16 indexed entities per tick, paged requester data, bounded transport observation and one native chart read per six ticks. Snapshots report session, tick, coverage and collection errors. Large worlds need time for initial discovery; rolling samples are not simultaneous measurements of the entire factory. Opening a view or calling an API reads prepared data and never triggers a new game scan.

- Monitored stock excludes belts, inserter hands, pipes, players and fuel inventories. Stock in a container does not imply that every consumer can reach it.
- Production-flow item totals currently use normal quality. Inventory and transport observations retain quality where available.
- Generator ratings are theoretical capacity; accumulator charge is not assigned to individual networks.
- Forecasts are conditional on observed history and coverage. They do not promise exact machine counts or train arrival times. Infinite resource patches have no finite exhaustion estimate.
- Map coverage follows factories, players and observed/charted areas under collection limits; it is not an unrestricted world scan or a complete rail/sprite renderer.
- In multiplayer, exports are written by the server. The desktop application needs access to those files.

The embedded Bridge/Gateway shares prepared snapshots with the desktop. SQLite history is separated by session, retains 60 minutes by default and compresses new snapshots without loss. The local interfaces are:

| Interface | Address / operations |
|---|---|
| MCP | `http://127.0.0.1:18740/mcp` — `telemetry_snapshot`, `telemetry_capabilities` |
| HTTP | `http://127.0.0.1:18741/api/v1/` — status, sessions, overview, `telemetry/{topic}`, forecasts, history, client updates and SSE events |
| Native map | HTTP map manifest, tiles and composed pages from completed exports of the current session |

## Source and build

- `src/`: .NET 10, WPF/WebView2 desktop, Bridge/Gateway, telemetry models and SQLite history.
- `mod/factory-telemetry/`: Lua collector.
- `tests/`: .NET, collector/model and browser checks.
- `docs/evidence/`: application captures and validation evidence.

Use the SDK version in `global.json` and PowerShell 7. The repository build scripts use the development environment configured in `scripts/env.ps1`.

```powershell
pwsh -File ./scripts/build.ps1 -Publish
pwsh -File ./scripts/package-release.ps1
```

The application is written to `dist/FactoryControl.exe`. Release packaging produces the universal EXE, optional manual-collector archive and checksums under `dist/release/`. Game names/icons are prepared during development, not imported on normal startup.

Factorio artwork and translations belong to Wube Software. This project is not officially affiliated with Wube Software. Included font/library licenses and other attributions are listed in [third-party notices](THIRD_PARTY_NOTICES.md).
