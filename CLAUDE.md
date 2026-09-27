# FabMo-Updater — notes for Claude

Companion agent to the engine. Runs continuously and independently (its own
systemd service, `fabmo-updater`, web UI on port 81 = engine port + 1) so a
headless tool can always be updated, repaired, or restarted even if the engine
is down. See ~/.claude/CLAUDE.md for the platform picture and conventions.

The README in this repo is accurate and worth reading before changes; this
file only adds what the README doesn't say.

## Run

- Entry `server.js` → `updater.js` (`Updater.start()`).
- `npm run setup` (plain `npm install`), `npm run debug`. No test script.
- Restart on the Pi: `systemctl restart fabmo-updater`.
- Config lives in `/opt/fabmo/config/updater.json` (created on first start;
  the updater then needed a second start previously, probably not now). Do not edit while running.

## What lives where

- `fmp/` — update packages: fetch manifest, compare versions, apply in
  priority order (self-update first). `fmp/test.js` exists.
- `patches/` — numbered OS-level patches (`001-udev-rules-usb.js` … `004-…`)
  applied without a new SD image. `TEMPLATE.js` and `README.md` describe the
  contract. A new patch = next number + README if non-trivial. Patches must be
  idempotent; they may run on Pis with skipped updates (003 failed on a Pi4 in
  that case — open issue).
- `hooks/` — platform-specific shell scripts for system actions (start/stop
  engine, network, reboot). Only the Raspberry Pi hooks are real; other
  platforms are stubs.
- `routes/` — web UI, websocket, and the endpoints the engine's Updater app
  calls. The engine treats this service as the place for diagnostics/terminal
  output (`ck_` scripts, avahi, networking checks).
- `scripts/` — build/deploy scripts for engine + updater releases.
- `samples_from_FabMo/` — reference copies, not live code.

## Cross-repo facts

- Note that `patches/` serve to update the underlying RaspberryPi OS and FabMo-related
  networking routines. Any changes to this type of functionality that is not explicitly
  handled by changes to files in `/fabmo/files/network_conf_fabmo` or files here in the
  updater require patches. When a patch is needed, we also update the `/fabmo_image_builder/`
  system so that they will be included in the next SD image production.
- The engine's own `routes/updater.js` and the dashboard's updater app talk to
  this service; changes to endpoints need matching engine changes.
- Tool-name / `.local` hostname changes and network patches originate here
  (see issues under "Networking").
- Same JS conventions as the engine: prototype pattern, callbacks, match the
  surrounding style.

## Do not, without an explicit ask

- Change the FMP manifest/version comparison logic — a mistake here can brick
  fleet updates.
- Renumber or edit an already-shipped patch; add a new one.
- Assume `sudo` without a password: newer Raspberry Pi OS (Trixie) disables it.
