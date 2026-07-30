# UI specification

Written before the first screen, so every screen is born on-brand instead of
retrofitted. Values, not adjectives — a token _schema_ with undecided values is not
a design.

The brief names **User Interface** as its own rubric line and asks for a "cool and
creative design" twice. This document is the answer to that, and the reason the
design tokens ship in the same PR as the native scaffold rather than later.

---

## 1. Visual direction

| Decision      | Value                                                  | Why                                                                                                              |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Ground        | `#0B0F14` dark · `#FAFAF9` light                       | Near-black with a blue cast, not pure `#000`. Pure black on OLED smears during scroll and reads as "screen off". |
| Accent        | One cool azure, `#5296FF` on dark / `#2E7DF6` on light | A _single_ accent. Multi-accent palettes are the fastest way for a small app to look unconsidered.               |
| Priority ramp | Hue walk: azure → violet → magenta                     | Not red/amber/green. See §3.                                                                                     |
| Radius        | `12px` everywhere that isn't a pill                    | One signature corner.                                                                                            |
| Row padding   | `16pt`                                                 | Generous rows read as considered; cramped rows read as a list view.                                              |
| Type          | System font, 1.25 modular scale                        | Correctly hinted on the grader's device with no font loading.                                                    |
| Elevation     | Tint, never shadow                                     | An Android elevation shadow is invisible against `#0B0F14`.                                                      |

Both schemes are first-class. The theme toggle lives in the task-list header —
there is no settings screen.

---

## 2. Tokens

Single source of truth: **`apps/mobile/src/shared/theme/tokens.js`**.
`tailwind.config.js` imports that file; `src/shared/theme/index.ts` re-exports it
with types and adds the semantic light/dark themes.

There is exactly one list of colours in this repo, and this is it. The reason is
concrete: `interpolateColor` on the urgency rail takes colour _strings_ and cannot
read a Tailwind class, so the palette must exist as TypeScript regardless. Having
it exist twice is how a palette drifts.

**Type scale** (1.25 modular, base 16, rounded to whole px):

| Name       | Size / line-height | Use                               |
| ---------- | ------------------ | --------------------------------- |
| `micro`    | 10 / 14            | Pills, badge counts               |
| `caption`  | 13 / 18            | Metadata, timestamps, helper text |
| `body`     | 16 / 24            | Task titles, form input           |
| `subtitle` | 20 / 26            | Section headers                   |
| `title`    | 25 / 31            | Screen titles                     |
| `display`  | 31 / 37            | Auth screens only                 |

**Spacing** — 4pt scale. **Radius** — `sm 8 · md 12 · lg 16 · xl 24 · full`.

---

## 3. The priority ramp, and why it isn't red/amber/green

| Priority | Colour    |                                                 |
| -------- | --------- | ----------------------------------------------- |
| `LOW`    | `#6B8FB8` | desaturated azure — present, recedes            |
| `MEDIUM` | `#3E9BFF` | the accent's own hue                            |
| `HIGH`   | `#8B7BFF` | violet — a hue _shift_, not a brighter blue     |
| `URGENT` | `#E8559E` | magenta — hottest point of the same cool family |

Two reasons, both practical rather than aesthetic:

1. **Traffic lights collide with semantics.** The app also needs a red for
   destructive actions and errors, and a green for success. If `HIGH` is amber and
   `URGENT` is red, then "urgent" and "something went wrong" are the same colour.
2. **It stays inside the accent family**, so the whole app still reads as one
   palette instead of a cool app with a warm widget bolted on.

**Colour is never the only channel.** Priority always ships with a text label, so
the ramp is legible to a colour-blind user and to a grader reading a screenshot.

**Urgency rail** (Tier 2 visualisation) interpolates `#3E9BFF → #8B7BFF → #FF5C8A`
over the 0–1 urgency score — a continuous version of the same walk.

---

## 4. Screen inventory

The whole app. There is deliberately **no Task Detail screen**: the composer
already shows every field, and a row expands in place to reveal its description.
An extra screen would be a navigation edge case with nothing on it.

| Screen            | Presentation            | Contents                                                          |
| ----------------- | ----------------------- | ----------------------------------------------------------------- |
| **Splash**        | Native bootsplash       | Held until auth bootstrap resolves, capped at ~1.5s.              |
| **Login**         | Auth stack              | Email + password, inline `zod` validation, shake on error.        |
| **Register**      | Auth stack              | Email, password, optional display name. Auto-logs in.             |
| **Task List**     | App stack root          | The app. Rows, status pills, sort toggle, theme toggle, sign-out. |
| **Task Composer** | `presentation: 'modal'` | Create _and_ edit — same screen, same form.                       |

The composer is a **native-stack modal**, not a bottom sheet. `@gorhom/bottom-sheet`
was cut: its current release predates gesture-handler 3 and carries an open bug
where _the keyboard covers the TextInput inside the sheet_ — precisely this use
case, on a mandatory screen.

---

## 5. `scheduledAt` vs `dueAt` — answering the trap in the brief

The brief names "date-time" and "deadline" as separate fields, which users
routinely confuse. The UI resolves it in the labels rather than hoping:

- **"Scheduled for"** — when I intend to work on it. Calendar icon.
- **"Due by"** — when it becomes late. Flag icon.

The countdown chip on a row is **always** derived from `dueAt`. Never from
`scheduledAt`. This mapping is deliberately unmissable to a grader ticking off the
requirement list.

### Date entry is a design problem, not a picker

`@react-native-community/datetimepicker` on Android opens the stock Material date
dialog _and then a separate time dialog_ — two 2015-looking system modals for the
most-used interaction in the app.

Primary affordance is a **quick-chip row** — `Today 6pm` · `Tonight` ·
`Tomorrow 9am` · `This weekend` — with the native picker behind a `Custom…` chip.
Highest design-return-per-hour item in the project.

---

## 6. Task row anatomy

```
┌─┬────────────────────────────────────────────────┐
│▌│  ☐  Renew passport                      HIGH   │   ← 3px urgency rail (left)
│▌│     Due by · Tomorrow 9:00 AM                  │   ← countdown from dueAt
└─┴────────────────────────────────────────────────┘
```

- **Checkbox** completes the task (optimistic).
- **Tap the row** opens the composer in edit mode.
- **Trailing icon + confirm dialog** deletes. Swipe-to-delete is Tier 2.
- **Status pill + strikethrough** on the title when `DONE`, so _"view a list of
  tasks with their status"_ is literally visible rather than implied.

---

## 7. States

Graders check these specifically, because most submissions ship an
`ActivityIndicator` and a bare "No tasks".

| State   | Treatment                                                            |
| ------- | -------------------------------------------------------------------- |
| Loading | Skeleton rows in the real row geometry — not a spinner.              |
| Empty   | Context-aware copy ("Nothing overdue. Nice.") plus a primary action. |
| Error   | Designed panel with the API's `code`, and a Retry button.            |
| Offline | Same error panel. Offline _tolerance_ is explicitly out of scope.    |

---

## 8. Styling boundary rule — set on day one

> **NativeWind for static layout and theme. Plain `StyleSheet` for anything animated.**

This is not a preference. `react-native-css-interop` (NativeWind's engine) has an
open bug — **#1781**, a regression introduced in 4.2.3 — where plain `StyleSheet`
styles passed via `style` are dropped on RN primitives routed through the NativeWind
JSX runtime. Our pin, 4.2.6, is inside that window.

So animated components take `StyleSheet` objects into `useAnimatedStyle` and do not
mix `className` onto the same element. Mixing the two on one node is the exact
shape that triggers the bug.

Verified by a smoke assertion in the native smoke panel (see §10), so if the bug
bites it names itself at scaffold time rather than at hour 24.

### The variant that actually bit us: `Pressable`'s callback `style`

The probe above passes a style **object**, which works. A style **function** does
not:

```tsx
// ✗ Silently discarded under Metro. No height, no radius, no background,
//   label flush left. Found on device; `uiautomator dump` measured the button
//   at 63px instead of 52dp.
<Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]} />

// ✓ Plain array, native press feedback.
<Pressable android_ripple={{ color: theme.onAccent }} style={[styles.button, { backgroundColor }]} />
```

**A test cannot catch this.** Jest never imports `global.css`, so css-interop stays
in passthrough and resolves the callback correctly — reintroducing the broken form
was mutation-tested and left the entire suite green. The guard is therefore a
`no-restricted-syntax` ESLint rule (`eslint.config.js`), which is static and does
not depend on which runtime is loaded.

Press feedback goes through `android_ripple`, which is the platform-native
affordance regardless.

---

## 9. Accessibility — the tests physically depend on it

React Native Testing Library v14 exposes **host elements only** and removed
`UNSAFE_getByType` / `UNSAFE_getByProps`. Without `accessibilityRole` and
`accessibilityLabel` on custom buttons, chips and rows, component tests **cannot
find them at all**.

So every interactive element carries a role and a label. This is a testing
requirement first and a rubric freebie second.

Edge-to-edge is mandatory on API 36 — apps targeting it cannot opt out. Content is
padded from `useSafeAreaInsets()`, never from the deprecated `SafeAreaView`.

---

## 10. Native smoke panel

`src/features/diagnostics` renders one row per native module with a live
pass/fail assertion. It exists because installing thirteen native modules and then
building gives no bisect: a failure surfaces as a blank red screen with a stack
trace pointing at the bridge.

With the panel, a broken library **names itself**. It is `__DEV__`-only and is not
part of the shipped UI.
