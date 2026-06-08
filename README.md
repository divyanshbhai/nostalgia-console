<div align="center">
  <img src="https://cdn-icons-png.flaticon.com/512/2780/2780137.png" alt="Nostalgia Console" width="80" />

  # Nostalgia Console

  **Retro Gaming, Cloud Powered.**

  Turn any TV into a multiplayer retro console. Your phone is the controller — no hardware, no installs.

  ![Version](https://img.shields.io/badge/version-1.0.0-a78bfa?style=flat-square)
  ![License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)
  ![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
  ![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?style=flat-square)
  ![Platform](https://img.shields.io/badge/platform-PWA%20%7C%20APK-4ade80?style=flat-square)
  ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

</div>

---

## What is Nostalgia Console?

Nostalgia Console is an open-source retro gaming platform that runs entirely in the browser. Open the **TV app** on any screen, scan a QR code with your **phone**, and your phone instantly becomes a game controller. Upload any ROM and play — no extra hardware, no app store, no account required.

All emulation runs **client-side** via EmulatorJS + WebAssembly libretro cores. The relay server only forwards controller inputs — it never stores game data.

---

## Apps

Two installable PWAs (also available as APKs):

| App | Description | Start URL |
|-----|-------------|-----------|
| **Nostalgia Console TV** | Displays the game on your TV or any large screen. Generates a QR code for players to join. | `/tv` |
| **Nostalgia Controller** | Runs on your phone. Scan the QR code to pair instantly and use your phone as a full game controller. | `/controller` |

---

## Features

- ⚡ Sub-80ms input latency on local WiFi
- 👥 Up to 4 players simultaneously, each with their own color & identity
- 🎮 Full controller — D-pad, face buttons, shoulder buttons, haptic feedback
- 💾 Save states, pause, reset, mute, fullscreen — all from your phone
- 🌐 Works on same WiFi, different networks, or mobile hotspot via relay server
- 🎮 Supports **NES, SNES, Game Boy, GBA, Game Boy Color, Genesis, Master System**
- 📡 QR code instant pairing — connect in under 10 seconds
- 🔄 Automatic reconnection — player slot held for 15 seconds on disconnect
- 🔒 Private sessions, no account or login needed
- 📲 Installable PWA on iOS and Android (add to home screen)
- 🖥️ Wake lock — screen stays on during gameplay

---

## How it Works

```
Open /tv on TV  →  QR code appears  →  Phone scans QR  →  Upload ROM  →  Play
```

1. Open the **TV app** (`/tv`) on any browser — Android TV, Smart TV, laptop
2. Scan the QR code with your phone — controller opens instantly in the browser
3. Upload a ROM file from your phone — game starts on the TV immediately
4. Press **Ready** → **Start Game** and play

---

## Supported Consoles

| Console | Core | Extensions |
|---------|------|------------|
| NES | fceumm | `.nes` |
| SNES | snes9x | `.sfc`, `.smc` |
| Game Boy / GBC | mgba | `.gb`, `.gbc` |
| Game Boy Advance | mgba | `.gba` |
| Sega Genesis | genesis_plus_gx | `.md`, `.gen` |
| Sega Master System | genesis_plus_gx | `.sms` |

> ROMs are validated client-side by file extension and magic bytes before upload.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Emulation | EmulatorJS (libretro cores via WebAssembly) |
| Realtime | Socket.IO 4 (WebSocket + polling fallback) |
| Socket Server | Bun + Socket.IO server |
| Database | Prisma + SQLite |
| Deployment | Vercel (frontend) · Railway / Render (socket server) |

---

## Self-Hosting

### Requirements

- Node.js 20+ or Bun 1.x
- A deployed Socket.IO relay server (Railway, Render, or any VPS)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/nostalgia-console.git
cd nostalgia-console
bun install
```

### 2. Configure environment

```env
# .env.local
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.railway.app
```

### 3. Run locally

```bash
# Frontend + socket server together
bun run dev:full

# With LAN URL printer (useful for phone testing on same WiFi)
bun run dev:lan
```

### 4. Deploy

**Frontend → Vercel**

```bash
vercel deploy
```

**Socket server → Railway**

```bash
cd mini-services/retro-console-server
# Connect repo in Railway dashboard and set PORT env var
```

### 5. (Optional) Self-host EmulatorJS assets

```env
NEXT_PUBLIC_EMULATOR_PATH=/emulatorjs/data/
```

Copy the EmulatorJS `data/` folder into `public/emulatorjs/` to avoid CDN dependency.

---

## Project Structure

```
nostalgia-console/
├── src/
│   ├── app/
│   │   ├── tv/                   # TV mode — game display + lobby
│   │   ├── controller/           # Phone controller UI
│   │   └── api/                  # Next.js API routes
│   ├── components/
│   │   ├── tv-mode.tsx
│   │   └── premium-controller.tsx
│   └── lib/
│       ├── emulator-config.ts    # EmulatorJS core mappings
│       ├── emulator-adapter.ts   # EmulatorJS runtime wrapper
│       ├── input-router.ts       # Controller input → emulator mapping
│       ├── rom-validator.ts      # ROM validation by extension + magic bytes
│       ├── game-session-manager.ts
│       └── ws-url.ts             # Socket URL resolution
├── mini-services/
│   └── retro-console-server/     # Socket.IO relay server (Bun)
│       └── index.ts
└── public/
    ├── manifest-tv.json          # PWA manifest for TV app
    └── manifest-controller.json  # PWA manifest for Controller app
```

---

## Contributing

Contributions are welcome and appreciated!

1. **Fork** the repository
2. **Create** a feature branch — `git checkout -b feature/your-feature`
3. **Commit** your changes — `git commit -m "feat: your feature description"`
4. **Push** to your fork — `git push origin feature/your-feature`
5. **Open a Pull Request** against `main`

### Guidelines

- Keep PRs focused — one feature or fix per PR
- For large changes, open an issue first to discuss
- Follow the existing code style (TypeScript, inline styles, minimal comments)
- Do not include ROM files or copyrighted game assets in PRs

### Reporting Bugs

Open an issue and include:
- What you expected to happen vs what actually happened
- Steps to reproduce the issue
- Browser, OS, and device model
- Any console errors

---

## Legal & ROM Disclaimer

**ROM files are not included, distributed, or endorsed by this project.**

Nostalgia Console is an emulation frontend only. You are solely responsible for ensuring that any ROM files you use comply with the copyright laws in your jurisdiction. Only use ROMs for games you legally own.

---

## License

```
MIT License

Copyright (c) 2025 Divyansh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/<your-username>">Divyansh</a> · Open source · Deployable on Vercel + Railway
</div>
