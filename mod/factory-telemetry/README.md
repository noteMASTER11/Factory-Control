# Factory Telemetry Bridge

A bounded, incremental telemetry collector for Factorio. It adds no prototypes and does not change production, resources, player commands or game rules. Its technical state is stored under `storage.factory_telemetry`.

Current development version: **0.6.2**. The published Factory Control 0.2.0 desktop release contains collector 0.4.0 instead.

## Compatibility and installation

The shared sources are packaged separately for **Factorio 2.0.77+** and **2.1.23+ experimental**. Source `info.json` targets 2.0; `scripts/package-telemetry.ps1 -GameBranch 2.1` supplies the 2.1 metadata. Each archive supports one Factorio branch. Space Age and Quality are optional dependencies.

Place the matching ZIP in the game's `mods` folder, enable **Factory Telemetry Bridge**, restart Factorio and load a map. Keep the mod enabled when synchronizing a save's mod set. Updating an already loaded collector requires reloading the map. For desktop integration, use the matching `Install-FactoryControl.ps1` with an explicit `-GameExecutable` path.

## Exported data

Completed JSON snapshots are written under `script-output/factory-telemetry/`:

| Channel | Contents |
|---|---|
| `status` | Game/mod versions, session, players, game tick/speed, indexing coverage, budgets and collector errors. |
| `production` | Item/fluid production and consumption by surface/force over 5-second, 1-minute and 10-minute windows. |
| `machines` | Machine/recipe/status groups, idle reasons, ingredients/products, coordinate samples, monitored inventory with quality, fluid stock and spatial diagnostics. |
| `power` | Networks, generation/consumption by prototype, theoretical generator capacity and accumulator count/charge/capacity. |
| `logistics` | Robot networks, contents, available/total robots, requester filters, assigned deliveries, trains, schedules, cargo and Space Age transport observations. |
| `research` | Current technology/level, progress, queue and science-pack requirements by force. |
| `resources` | Surveyed resource chunks, type, amount, tile count, infinite-resource flag and measurement tick. |
| `combat` | Enemy damage, attack episodes, destroyed/rebuilt structures, quality, positions, rebuilding items and coverage. |

Space transport observations include platform state, tracked ports, bounded inventory samples with quality/freshness, cargo-pod events and observed route history. Availability depends on the game branch and installed expansion.

Native chart imagery is exported separately as `map.json` and RGB565 chunks: 32×32 pixels, 2,048 bytes per chunk. It covers relevant charted factory/player/observed areas progressively. Map files do not enter the ordinary telemetry history stream.

## Collection bounds

- Incremental discovery and event-based tracking; up to **16 indexed entities per tick**, at most one discovery chunk query per step and four production-flow rows per step.
- Requester exports use **16 records per tick** and alternating output directories; references are published only when a set is complete.
- Power cycles start after 60 ticks, machines/status/combat publish at 120 ticks, logistics/research cycles start after 300 ticks and resources after 600 ticks. Work may finish later because it is spread across ticks.
- Space observations use bounded inventory/event reads and capped platform, port and event histories. Overflow or partial coverage is reported.
- Native map capture performs at most **one chart read per six ticks** with a capped index. It reads cached game chart pixels; UI requests never trigger collection.
- Spatial diagnostics track up to 512 groups / 32,768 problematic entities; overflow is explicit.
- Attack episodes end after 900 game ticks without enemy damage; up to eight episodes are retained.
- Snapshots carry measurement ticks, session and coverage information. Reloading/changing worlds creates a new export generation. Errors and average collector time over 300 ticks are logged in `profile.txt`.

Rolling observations are not an atomic world snapshot. Initial indexing can take time, and incomplete/stale coverage should be considered before interpreting totals or forecasts.

## Diagnostics and integration

- `/factory-telemetry-status` prints collection coverage.
- `remote.call("factory_telemetry", "snapshot", "power")` returns the latest completed JSON for that channel, or `nil`; it does not scan the world.
- Multiplayer exports are written on the server. A desktop client needs access to the server's exported files.

See the [project README](../../README.md) for the desktop application, local API and installation workflow.
