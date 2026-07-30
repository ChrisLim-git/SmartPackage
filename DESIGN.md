# Design

Visual system for the Smart Package Locker app. Seeded pre-implementation; **colour values are authored by the supplied shadcn preset**, not invented here.

> [!important] Palette is preset-derived — do not hand-author colours
> The theme comes from:
>
> ```bash
> pnpm dlx shadcn@latest init --preset b4ZVs1wIPh --base radix --template next --pointer
> ```
>
> Captured from the generated `app/globals.css` after scaffolding. **`app/globals.css` is the single source of truth**; the values below are a reading of it, not a second definition. Change colour there, never here.
>
> The preset resolved to style **`radix-mira`**, base colour **taupe**, icon library **remixicon**.

## Theme

Light-or-dark is decided by the preset, not by preference. The physical scene that would otherwise force it: _a delivery agent under bright mall lighting at 2pm, reading a phone held at arm's length against a wall of pale metal lockers._ That scene argues for **light** with high-contrast ink — glare, not gloom, is the ambient problem. If the preset ships dark as primary, the field surfaces must be contrast-checked under that assumption rather than assumed fine.

Register is **product**: design serves the task. Temperament is **operational** — internal tooling built by someone who ships.

## Colour

**Strategy: Restrained.** The product-register floor, and correct here. Tinted neutral surfaces, one accent carrying primary actions, current selection, and state indicators — never decoration.

The preset is a **warm taupe neutral with an amber accent**. Light mode is white-surfaced; dark mode is near-black taupe.

| Token                  | Light                       | Dark                                 | Use                                                                                     |
| ---------------------- | --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `--background`         | `oklch(1 0 0)`              | `oklch(0.147 0.004 49.3)`            | Page surface                                                                            |
| `--foreground`         | `oklch(0.147 0.004 49.3)`   | `oklch(0.986 0.002 67.8)`            | Body ink                                                                                |
| `--card`, `--popover`  | `oklch(1 0 0)`              | `oklch(0.214 0.009 43.1)`            | Raised surface — second neutral layer in dark                                           |
| `--primary`            | `oklch(0.852 0.199 91.936)` | `oklch(0.795 0.184 86.047)`          | **Amber accent.** Primary action only                                                   |
| `--primary-foreground` | `oklch(0.421 0.095 57.708)` | `oklch(0.421 0.095 57.708)`          | Dark brown ink _on_ amber — amber is a light accent, so its label is dark in both modes |
| `--muted`              | `oklch(0.96 0.002 17.2)`    | `oklch(0.268 0.011 36.5)`            | Subdued fill                                                                            |
| `--muted-foreground`   | `oklch(0.547 0.021 43.1)`   | `oklch(0.714 0.014 41.2)`            | Metadata, placeholders                                                                  |
| `--border`, `--input`  | `oklch(0.922 0.005 34.3)`   | `oklch(1 0 0 / 10%)` · input `/ 15%` | Rules and field edges                                                                   |
| `--ring`               | `oklch(0.714 0.014 41.2)`   | `oklch(0.547 0.021 43.1)`            | Focus ring — **neutral, not amber**                                                     |
| `--destructive`        | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)`          | Errors                                                                                  |
| `--sidebar*`           | tinted off-white            | `oklch(0.214 0.009 43.1)`            | Admin chrome; the second neutral layer already exists as tokens                         |
| `--radius`             | **`0`**                     | —                                    | Every `--radius-*` step derives from it, so **`0` means square corners everywhere**     |

> [!warning] Two preset choices that override this document's earlier assumptions
>
> - **`--radius: 0`.** The whole radius scale is `calc(0 * n)`. Nothing is rounded — no pills on chips either. The "≤16px on containers" rule below is moot; sharpness _is_ the supplied identity.
> - **`--ring` is neutral taupe, not the accent.** Focus is legible without competing with primary actions. Keep it.
>
> Amber at `oklch(0.852 …)` is **light** — white text on it fails contrast. Always pair with `--primary-foreground`, never with `--background`.

Rules that hold regardless of what the preset supplies:

- **Body text ≥4.5:1, large text ≥3:1, placeholders ≥4.5:1.** Measured, not eyeballed. If `--muted-foreground` fails against `--background`, it gets darkened rather than accepted — light-gray-for-elegance is the most common readability failure and it is not shipping on a screen someone reads standing up.
- **Locker state is never colour-only.** Available vs occupied carries a text label or icon as well as a tint. Colour-blind users and glare both defeat colour-only encoding.
- A **second neutral layer** distinguishes the admin sidebar/toolbar from the content surface.
- Accent at full saturation only on active states. Never on disabled or inactive.

## Typography

The preset ships **three** families, not one, and inverts the usual default:

| Variable         | Family             | Where                                                                      |
| ---------------- | ------------------ | -------------------------------------------------------------------------- |
| `--font-mono`    | **JetBrains Mono** | **The default body font** — `globals.css` sets `html { @apply font-mono }` |
| `--font-heading` | **Merriweather**   | Headings (serif)                                                           |
| `--font-sans`    | Geist              | Loaded and available; opt in with `font-sans`                              |

> [!note] Mono-by-default is the supplied theme, and it is kept
> This document originally specified one sans family with mono reserved for code/data. The preset decided otherwise, and the preset is the _supplied_ theme — [[T602 Apply supplied shadcn theme|T602]] exists to honour it, not to relitigate it. A monospace operational UI reads as instrument-panel, which suits the register.
>
> The consequence: **mono no longer signals "transcribe this"**, because everything is mono. The pickup code, locker label and fee must earn emphasis through **size, weight and `tracking`** instead — the `display` step below is what carries them.

JetBrains Mono is a genuine tabular face, so fee columns and code digits align for free.

**Fixed rem scale, not fluid.** Clamp-sized headings don't serve product UI; a fluid heading that shrinks inside a panel looks worse, not better. Scale ratio ~1.2.

| Step      | Size              | Use                                                                                                     |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `display` | 2.25rem           | The locker label and pickup code on the agent success screen; the fee on collect. Arm's-length reading. |
| `h1`      | 1.5rem            | Page title                                                                                              |
| `h2`      | 1.25rem           | Section                                                                                                 |
| `body`    | 1rem              | Default. **Never smaller on the field surfaces.**                                                       |
| `small`   | 0.875rem          | Admin table cells, metadata                                                                             |
| `label`   | 0.8125rem, medium | Form labels                                                                                             |

`text-wrap: balance` on headings. Prose capped at 65–75ch; admin tables may run denser.

**Display letter-spacing floor: −0.03em.** Not tighter.

## Layout

- **Field surfaces (agent, collect): single column, 375px-first.** No side-by-side fields. Content in a single flow, primary action full-width and bottom-anchored within thumb reach.
- **Admin: 1280px-first.** Dense tables, a persistent side nav, dialogs for creation. Responsive behaviour is _structural_ — the sidebar collapses, the table scrolls — never fluid type.
- Flexbox for one-dimensional, Grid for two. No Grid where `flex-wrap` suffices.
- **Cards are not the default container.** Named anti-reference. Grouping comes from spacing, rules and headings; a card appears only where a genuinely detachable object needs edges. **Nested cards never.**
- Radius: `--radius` is `0`. Square everywhere. Do not add a local `rounded-*` to opt out.
- **Never** `1px border` + `box-shadow` blur ≥16px on the same element.
- Semantic z-index scale: `dropdown → sticky → modal-backdrop → modal → toast → tooltip`. No 999.
- Vary vertical rhythm; uniform spacing reads as a template.

## Components

Sourced from shadcn/ui, **`radix-mira`** style, `radix-ui` primitives (`--base radix`).

Installed set: `button input label field table dialog select card badge sonner alert skeleton input-otp` — plus `separator`, pulled in as a `dialog` dependency.

Two consequences of the pinned base and version, both verified:

- **`form` is a file-less stub** in `radix-mira` — `shadcn add form` writes nothing. Forms are `field` + react-hook-form's own `<Controller />` + Zod. Any `<Form>/<FormField>` snippet is pre-4.x.
- **`sonner` is the toast**, not `toast` — sonner is the component documented under the `radix` base. Pulls in `next-themes`.

Every interactive component ships **default, hover, focus, active, disabled, loading, error**. Not half of them.

- **Skeletons for loading**, never a spinner centred in content.
- **Empty states teach the interface** — "No lockers at this station yet. Add one to start accepting packages." Not "No data".
- One button shape, one form-control vocabulary, one icon style — **Remix Icon** (`@remixicon/react`), which is what the preset installed. Not Lucide. Across all surfaces. If Save looks different in two places, one is wrong.
- Tap targets ≥44px on field surfaces. **`size="lg"` is not enough in this preset** — `radix-mira` is compact (`Input` `h-7`, `Button size="lg"` `h-8`, `SelectTrigger` `h-7`), so the agent and collect screens state a height through `components/field-surface.ts` instead of trusting a variant name. Admin keeps the compact defaults, which is what dense tables want.
- `--pointer` is set, so buttons show a pointer cursor.

## Motion

- **150–250ms** on transitions. Users are in flow.
- Motion conveys **state only**: change, feedback, loading, reveal. Nothing decorative.
- Ease-out curves (quart/quint/expo). No bounce, no elastic.
- **No page-load choreography.** The app loads into a task.
- Every animation has a `prefers-reduced-motion: reduce` alternative — crossfade or instant.
- One place motion earns real weight: the agent's **store → success** transition. The locker label and code arriving needs to feel like a result, not a re-render.

## Bans, enforced at review

Card grids as default layout · gradient text · decorative glassmorphism · side-stripe accent borders · ghost cards (border + wide shadow) · radii ≥24px on containers · decorative CSS grid backgrounds · uppercase tracked eyebrows · display fonts in labels or data · modals as first thought · colour-only state encoding · spinners where skeletons belong.
