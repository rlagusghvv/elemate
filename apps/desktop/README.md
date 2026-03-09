# EleMate Desktop

Electron desktop shell for the EleMate web and API stack.

## What it does

- launches the FastAPI backend if it is not already running
- builds and launches the Next.js web app if needed
- exposes native folder picker and macOS permission status to the web UI
- packages as a macOS desktop app with `electron-builder`

## Commands

```bash
npm --workspace apps/desktop run start
```

```bash
npm --workspace apps/desktop run dist
```

```bash
./scripts/run_elemate_desktop.sh
```
