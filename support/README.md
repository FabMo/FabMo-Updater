# Remote support sessions

Lets a customer open a time-limited connection so a ShopBot support tech can
reach the machine. Built on Tailscale; the machine is only on the support
network while a session is running.

## Pieces

| File | What |
|------|------|
| `support/fabmo-support` | The shell script that does everything: `start`, `stop`, `status`, `whois`. Holds all the safety rules. |
| `support.js` | Thin wrapper the updater uses to run the script. |
| `routes/support.js` | `GET /support/status`, `POST /support/start`, `POST /support/stop`. |
| `routes/terminal.js` | Refuses the web terminal to a tunnel connection unless the session is at the `system` level. |

It lives in the updater so that support can get in when the engine is down.

## What a session does

1. Downloads the pinned Tailscale build on first use (checksum verified) into
   `/opt/fabmo-support/` - outside `/opt/fabmo`, which engine updates delete.
2. Puts up a firewall on the tunnel interface that lets nothing in.
3. Arms a timer that ends the session (default 120 min, max 480).
4. Starts `tailscaled` as a transient unit with its state in memory and log
   upload off, and joins using the single-use key it was given.
5. Checks the machine landed on `SUPPORT_TAILNET` under `SUPPORT_TAG`. If not, it leaves at once.
6. Only then opens tcp 80 and 81 on the tunnel, and enables Tailscale SSH if
   the `system` level was asked for.

`stop` (or the timer, or a reboot) logs out, stops the daemon, removes the
firewall table and the session record. The node is ephemeral, so it also
disappears from the tailnet's machine list.

## Rules that must stay true

- Nothing runs and nothing is installed as a service outside a session.
- DNS and routes are never accepted from the tailnet; nothing is forwarded.
- The tailnet is pinned in the script. Do not make it a setting: a start
  request carrying a key for someone else's tailnet must not work.
- A session can be started only from the machine's own network, never from
  the tunnel side. Anyone may stop one.
- The key reaches the script in a root-only file, never on a command line.

## Levels

- `dashboard` - ports 80 and 81 only; no SSH; the updater's web terminal is
  refused to tunnel connections.
- `system` - the same plus Tailscale SSH (as allowed by the tailnet policy)
  and the web terminal.

A session normally starts at `dashboard`. The customer can raise it to
`system` while it is running (`fabmo-support elevate`, `POST
/support/elevate`) without a new key or code; it stays raised until the
session ends. Only the customer's side may do this.

The levels describe what the tech is offered. They are not a hard privilege
boundary: the updater can install packages as root at either level.

## Tailnet side

Machines join tagged `tag:customer-machine` with a single-use, ephemeral,
pre-approved key. A key made without the tag is refused by the script.

The policy gives machines no access to anything, and needs:

```json
"acls": [
  { "action": "accept", "src": ["group:support"],   "dst": ["tag:customer-machine:80,81"] },
  { "action": "accept", "src": ["group:engineers"], "dst": ["tag:customer-machine:22"] }
],
"ssh": [
  { "action": "check", "src": ["group:engineers"], "dst": ["tag:customer-machine"], "users": ["pi"] }
]
```

Tailscale SSH needs BOTH the port-22 access rule and the `ssh` rule; with
only the `ssh` rule the connection times out. Port 22 in the policy does not
open SSH on a `dashboard` session: Tailscale SSH is off on the machine and
the machine's own firewall drops port 22 on the tunnel.

## Getting the key: the broker

`POST /support/request` asks the ShopBot support broker (separate project,
fabmo-support-broker) for a short code and shows it to the customer. The
updater then waits; when a signed-in tech enters the code on the broker's
support page, the broker hands over the key and the updater runs `start`.
`POST /support/cancel` gives the code up. `POST /support/start` with a key in
hand still works.

Each step is written to `/run/fabmo-support/pending.json` (no secrets in it)
so the engine can tell the dashboard without polling.

The broker's address is `BROKER_URL` in `support.js`; the file
`/opt/fabmo-support/broker-url` overrides it for development. The address is
not a security boundary - the tailnet and tag checks above apply to whatever
key arrives.

## Not here yet

The at-the-machine confirmation for motion, and SSH logins in the audit log.
