# Modulus To-Do

An Android to-do app built with **React Native CLI + TypeScript**, backed by a **NestJS + MongoDB**
API. Tasks carry a title, description, scheduled date-time, deadline and priority, and can be
sorted by a transparent urgency score that blends all three time/priority signals.

> Assignment submission for **Modulus Seventeen**.

---

## ⏱️ Evaluate this in 5 minutes

|                            |                                                                |
| -------------------------- | -------------------------------------------------------------- |
| 📱 **Install the app**     | _APK link — added at release_                                  |
| 🔑 **Demo account**        | `demo@modulusseventeen.com` · `ModulusDemo2026!`               |
| 🌐 **API docs (Swagger)**  | **https://modulus-todo-api.onrender.com/docs**                 |
| ❤️ **API health**          | **https://modulus-todo-api.onrender.com/health**               |
| 🔄 **Reset the demo data** | `POST https://modulus-todo-api.onrender.com/api/v1/demo/reset` |
| 🎬 **90-second demo**      | _video — added at release_                                     |

> ⚠️ **The API is on a free tier and sleeps after 15 minutes idle.** The first request can take
> up to a minute while it wakes up. Everything is instant after that — this is a hosting-tier
> characteristic, not a bug in the app.

**Three things worth trying**

1. Create a task with both a **"Scheduled for"** time and a **"Due by"** deadline, then switch the
   list to **Smart** sort and watch it reorder.
2. Mark something complete — the status changes in place, optimistically, before the server replies.
3. Force-quit the app and reopen it. You stay signed in; the session is restored from the device
   keystore, not from a token sitting in plain storage.

---

## Status

🚧 **In progress.** This README is filled in as the milestones land.

| Milestone                        | State          |
| -------------------------------- | -------------- |
| Phase 0 — toolchain              | ✅ Done        |
| Repo, hooks, CI                  | 🚧 In progress |
| API — foundation, auth, tasks    | ⬜             |
| Mobile — foundation, auth, tasks | ⬜             |
| Smart sort                       | ⬜             |
| Deploy + signed APK + demo       | ⬜             |

---

## Repository layout

```
modulus-todo-app/
├── apps/
│   ├── api/      NestJS + Mongoose  (own package.json / node_modules)
│   └── mobile/   React Native CLI + TypeScript
├── scripts/      setup-android.sh — provisions the Android toolchain
└── docs/         architecture notes, screenshots, demo
```

The two apps are deliberately **independent projects in one repository** rather than an npm
workspace. Nothing is genuinely shared between them — React Native cannot consume the API's
`class-validator`-decorated DTOs anyway — so workspace hoisting would add Metro `watchFolders` and
`node-linker` configuration to solve a problem that does not exist here.

## Getting started

Requires **Node 22.18.0** (see `.nvmrc`), **JDK 17**, and the Android SDK.

```bash
./scripts/setup-android.sh   # provisions JDK 17, SDK 36, NDK, an AVD, and MongoDB
nvm use                      # picks up .nvmrc
```

Per-app instructions live in `apps/api/README.md` and `apps/mobile/README.md`.

## Contributing conventions

- **Conventional Commits v1.0.0, single line.** `feat(tasks): add urgency-based smart sorting`
- **One branch per unit of work**, merged via squash-merge into a protected `main`.
- Enforced by a husky `commit-msg` hook locally and a `commitlint` job in CI.

## License

MIT — see [LICENSE](LICENSE).
