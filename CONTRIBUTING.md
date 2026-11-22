# Contributing

Thanks for helping. The most useful thing you can do is **try it on your bike and report what happened**: your bike model, the Peloton OS
version the installer prints, and whether live stats, Netflix and the overlay worked. That fills in the "Which bikes work" table in
[docs/INSTALL.md](docs/INSTALL.md).

## Ground rules

- **No Peloton account, no Peloton OS updates, no root.** The project exists to use a bike you own without a subscription. Nothing may
  sign in to Peloton, take an update, or need root.
- **Read-only on the bike's sensor services.** Only call service methods whose purpose is known; some of them can command the hardware.
- **No cloud, no keys, no personal data in the repository.** Rides stay on the device. `npm run verify` runs a secrets check; don't
  weaken it.
- **Never enable freeform windowing** on the tablet: it blanks the screen until a reboot.
- Don't redistribute Netflix, Kindle, Peloton or Google software (APKs, platform-tools).

## Working on the code

Developer setup is in [docs/SETUP.md](docs/SETUP.md) and the rules and gotchas in [CLAUDE.md](CLAUDE.md). In short: the web app (`src/`,
React + TypeScript) does everything you see and all the effort math; the Android shell (`android/`, Kotlin) only does what a web page
can't (read the sensor, record behind other apps, draw over Netflix/Kindle). Messages between them are defined in
[docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md), `src/bridge/types.ts` and `Messages.kt`: change all three together. Visual rules are in
[docs/STYLE.md](docs/STYLE.md).

Before opening a pull request: `npm run verify`, plus `npm run android:test` if you changed Kotlin. Say in the PR what you checked on a
real bike and what you couldn't. Use US spelling in anything a rider reads.
