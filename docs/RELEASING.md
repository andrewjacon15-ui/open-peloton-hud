# Releasing and publishing

For the maintainer. Users only ever see the Releases page and [INSTALL.md](INSTALL.md).

## One-time: a stable signing key

Android only installs an update over an existing app when both are signed with the same key, so every published APK must be signed with
one key, forever. Make it once, keep it somewhere safe (a password manager), and never commit it (`*.jks` is gitignored and the pre-push
hook blocks it):

```bash
keytool -genkeypair -v -keystore peloton-hud-release.jks -alias peloton-hud -keyalg RSA -keysize 4096 -validity 36500
```

Then in the GitHub repository that publishes releases: Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `HUD_KEYSTORE_B64` | the keystore, base64-encoded: `base64 -w0 peloton-hud-release.jks` (macOS: `base64 -i peloton-hud-release.jks`; Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('peloton-hud-release.jks'))`) |
| `HUD_KEYSTORE_PASSWORD` | the keystore password |
| `HUD_KEY_ALIAS` | `peloton-hud` |
| `HUD_KEY_PASSWORD` | the key password |

Your own bike: a build from your computer is signed with your local debug key, so it can't update over a published release (or the other
way round) without uninstalling, which erases the saved rides. Pick one and stay with it. To build locally with the release key, set the
same four values as environment variables (`HUD_KEYSTORE` = the path to the `.jks`, plus the three passwords/alias) before
`node scripts/android.mjs assembleRelease`.

## Cutting a release

1. `npm run verify` and `npm run android:test` pass on `main`.
2. Tag and push: `git tag v0.2.0 && git push public v0.2.0` (or `origin`, whichever repository holds the secrets).
3. The Release workflow (`.github/workflows/release.yml`) builds the web, bundles it into the APK, signs it, and publishes
   `peloton-hud-v0.2.0.zip` (APK, installers, INSTALL.md, LICENSE) plus its SHA-256 on the Releases page.

## Private and public repositories

The code holds no secrets and no personal data, so both repositories can carry exactly the same commits:

- Personal data lives only in gitignored files: `android/local.properties` (e.g. `hud.legacyOrigin`), `src/media/*.local.ts` (your
  YouTube subscriptions), and `.private-patterns` (strings the pre-push hook refuses to push: your name, email, bike serial...).
- `npm run publish:public` runs the secrets check (including `.private-patterns`) and `npm run verify`, then pushes `main` to the `public`
  remote. Set that remote once: `git remote add public https://github.com/<you>/peloton-hud.git`.

The first publish is different: the old history of the private repository contains a cloud key from before the backend was removed, so
the public repository starts from a single fresh commit of the current tree (no history). After that first push the two histories differ,
so publish with `npm run publish:public`, which pushes the current tree as one new commit on top of the public history.
