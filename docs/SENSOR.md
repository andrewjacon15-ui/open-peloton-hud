# Sensor protocol (Bike PLTN-RB1VQ)

How the HUD reads live power, cadence and resistance. Found by the sniffer (`SniffActivity`, `npm run bike -- sniff`) on 2026-11-02,
**with the Peloton app signed out** — so riding needs no membership.

## The path

Bind `com.peloton.service.SensorData` (action `android.intent.action.peloton.SensorData`, category `com.peloton.sensor.category.BIKE`).
It binds as a `Messenger`. Wrap the binder in a `Messenger`, create our own incoming `Messenger`, and register by sending a `Message`
with `replyTo` set to ours. The service then streams one `Message` per metric, about 10 Hz each.

Registration: the service **subscribes on a command code**, then streams metrics tagged with their own ids. Sending `Message.what` =
0..15 (each with `replyTo` = our Messenger, spaced ~120 ms apart; a tight burst did not take) makes it stream back replies tagged
`what` = 7, 8, 9 — the three live metrics. The subscribe code is *not* the same as the metric id, so registering only 7/8/9 subscribes to
nothing (the bug that first showed all-zero data). We send the whole 0..15 range; narrowing to the exact subscribe code is a later cleanup.

## The messages

Each reply `Message` has:
- `what` = the metric id (7, 8 or 9)
- `data` (in `msg.data` Bundle) = `data: float` already parsed by Peloton, `time: long` (epoch ms), `responseHexString: string` (the raw
  serial frame), `requestId: null`.

| `what` | metric | unit | confirmed range seen | notes |
|---|---|---|---|---|
| 7 | cadence | rpm | 0–72 | rose/fell with pedaling |
| 8 | power (output) | watts | 0–260 | the bike's own wattage — no power curve needed; kJ = ∫ power dt |
| 9 | resistance | % | 0–100 | tracked the knob 0→88; rest sits ~50 |

Read the value as a `Number` (`msg.data.get("data") as? Number`) rather than `getFloat` — it is a `Float` today but reading it generically
is robust if the service ever stores a `Double`. `time` is a `Long`. Ignore `responseHexString` except for debugging.

## Validation

Occasional garbage frames slip through (seen: resistance 830 and 137). Range-check every reading and drop the frame if out of range:
cadence 0–200, power 0–2000, resistance 0–100. (Belt and braces: the raw frame carries a checksum — see below — but range-checking the
parsed `data` is enough in practice.)

## Raw frame (for reference / fallback)

`responseHexString` is the Peloton serial frame: `F1 <cmd> <len> <ascii-decimal payload> <checksum> F6`.

| `what` | cmd | example frame | payload → value |
|---|---|---|---|
| 7 cadence | `0x41` 'A' | `F1 41 03 30 30 30 C5 F6` | "000" → 0 (integer rpm) |
| 8 power | `0x44` 'D' | `F1 44 05 30 30 30 30 30 2A F6` | "00000" → 0 (5 digits, value ×10, so "02596" → 259.6 W) |
| 9 resistance | `0x49` 'I' | `F1 49 03 30 35 30 D2 F6` | "050" → 50 (integer %) |

We rely on the service's parsed `data` float, not this frame; the table is here so a future change in the service can be checked against
the wire.

## Shell wiring (phase 1 step 2+)

`SensorSource` (Kotlin): bind on `start(onSample)`, register 7/8/9, keep the latest of each, and emit a combined `sample` (power, cadence,
resistance) at 1 Hz to the bridge. `sensor: "sensordata"` in the `hello` message. `stop()` unbinds.
