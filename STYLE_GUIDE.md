---
name: nook-ui-style
description: Design system and styling rules for the Nook chat web app. Use whenever restyling, adding or reviewing any Nook UI so it stays clean, modern, simple, fast and consistent.
---

# Nook UI style

Goal: a calm, modern, easy-to-navigate chat UI. Familiar layout (icon rail, sidebar, chat, members), very few colours, quiet motion, fast on cheap phones.

## Principles

1. **Simple first.** One obvious action per area. No decoration without a job. The layout stays: icon rail, sidebar, chat, members.
2. **Colour with restraint.** Neutral surfaces. The accent is only for the primary action, the active item, links and unread. Gradients are for brand moments only (logo, avatar fallbacks), never large areas.
3. **Depth through tone, not shadow.** Raise a surface by making it one step lighter and give it a hairline border. Shadows are only for things that float (menus, popovers, modals).
4. **Consistent rhythm.** 4px grid (4, 8, 12, 16, 24, 32). Radii: 8 small controls, 12 inputs and cards, 16 composer and large cards, 20 modals, full for pills and avatars.
5. **Quiet motion.** Motion explains a change (appear, press, hover). 120ms for hover and press, 200ms for enter. Ease-out. Never delay or block interaction.
6. **Fast by default.** See the performance rules. If a style costs frames, drop it.

## Tokens

All colours, radii, shadows and timings are CSS variables in `:root` of `src/styles.css`. Never hard-code a colour in a component rule; add or reuse a token.

- Surfaces: `--bg-0` (rail, page) < `--bg-1` (sidebar) < `--bg-2` (chat, modals) < `--bg-3` (raised, inputs in chat) < `--bg-4` (hover on raised, selected tabs)
- Lines: `--line` (default hairline), `--line-strong` (inputs, modals)
- Interaction: `--hover`, `--press`
- Text: `--text`, `--text-2` (secondary), `--text-3` (hints). All meet 4.5:1 on the surfaces they sit on.
- Accent: `--accent` (fills, white text on it), `--accent-hover`, `--accent-text` (links, names, icons), `--accent-soft` (active backgrounds)
- State: `--danger`, `--danger-soft`, `--success`, `--warn`
- Radius: `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`
- Motion: `--ease`, `--spring`, `--t-fast`, `--t`

## Components

- **Buttons.** `primary` = solid accent, white text, one per view. `ghost` = raised surface with hairline. `icon-btn` = 30px, transparent, hover tint. Destructive actions use `danger` text, tinted on hover.
- **Inputs.** Dark inset surface, hairline border, 3px soft accent ring on focus. 16px font on touch devices so iOS does not zoom.
- **Rows** (channels, DMs, members). 34px high, 8px radius, secondary text; hover tint; active = soft accent background and primary text; unread = primary text, semibold, count pill.
- **Rail.** 40px tiles. Active tile has a small bar on the left and a 2px accent ring. Hover lifts slightly.
- **Messages.** No bubbles. Avatar, name (bold, user's accent colour), muted time, text. Consecutive messages group. Hover tint and a floating toolbar.
- **Composer.** One rounded container holding attach, text and send. Focus ring on the container, not the textarea.
- **Modals.** `--bg-2`, strong hairline, 20px radius, scale-and-fade in. On phones they become bottom sheets.
- **Avatars and group icons.** Image if set, otherwise gradient tile with initial. Status dot ring colour comes from `--dot-ring` so it matches whatever surface it sits on.
- **Icons.** Inline SVG from `Icon.jsx`, stroke 2, 14 to 18px, inherit `currentColor`. No emojis anywhere.

## Motion

- Hover and press: `--t-fast`, colour/background/transform only.
- Enter (modals, popovers, toasts): `--t`, fade plus 8px rise or 0.98 scale.
- Only the newest message animates in. Loading history must not animate.
- Loops are limited to the typing dots, the spinner and the gentle logo float.
- Everything respects `prefers-reduced-motion`.

## Performance rules (non-negotiable)

- Animate **transform and opacity only**. Never width, height, top, left, margin or box-shadow.
- Transition explicit properties. Never `transition: all`.
- No `backdrop-filter`, no `background-attachment: fixed`, no large blurs or filters, no big shadows on repeated items.
- No `will-change` except briefly during an animation.
- Typeface is Figtree (variable, self-hosted via @fontsource-variable/figtree, latin subsets only, font-display swap). No other web fonts, no icon fonts.
- Images: `loading="lazy"`, `decoding="async"`, give them a size so layout does not jump.
- One stylesheet, flat selectors, no deep descendant chains.
- Code-split rarely used screens (dialogs, settings). Keep the first load small.
- Static gradients only, painted once, never on scrolling or animated layers.

## Accessibility

- Text contrast at least 4.5:1. Never rely on colour alone (unread also uses weight and a count).
- Visible `:focus-visible` outline on every interactive element.
- Hit targets at least 32px, 40px on touch. Icon-only buttons need `aria-label` or `title`.
- Layout survives 200% zoom and phone widths down to 320px.

## Responsive

- 720px and below: rail plus sidebar become a left drawer with a scrim. 860px and below: members become a right drawer.
- Use `dvh` for full height and `env(safe-area-inset-bottom)` for the composer.
- Modals become bottom sheets on phones.

## Checklist before shipping any UI change

1. Uses tokens only. No stray hex colours.
2. Same spacing grid and radius scale as neighbouring components.
3. Hover, active, focus, disabled and empty states all exist.
4. Only transform/opacity animate; reduced motion respected.
5. Works at 360px and 1440px wide.
6. No emojis, no new blocking assets.
7. `npm run build` passes and the bundle did not grow noticeably.

## Brand and mascot

- Nooky (`src/components/Mascot.jsx`) is the face of Nook: a rounded arch body, two eyes, no mouth detail beyond a small smile. Keep it simple, flat colours, no outlines.
- Use moods (`happy`, `wave`, `wink`, `oops`, `sleepy`) to fit the moment: welcome screens, empty states, errors, loading. Never use it inside dense UI such as message lists.
- Animation is CSS only (blink, wave, float) and must respect `prefers-reduced-motion`.
- `Logo` is the compact version for headers and icons.

## Dialogs and sounds

- Never use `window.confirm`, `alert` or `prompt`. Use `confirmDialog`, `promptDialog` and `notify` from `src/dialog.jsx` (destructive actions set `danger: true`).
- Sounds come from `src/sounds.js` (synthesised, respect the user's sound setting and volume). Add new sounds there, keep them short and soft.
- Device and audio settings live in `src/prefs.js`, per browser.

## Profile cards, frames, video
- One card component (`CardBody`) draws every profile card. Change it there, never per place.
- Names go through `<Name profile />` so styles and fonts apply everywhere. Name fonts use system stacks, no extra downloads.
- Frames are CSS rings drawn inside the avatar box (`.avatar[data-frame]`), only animated with transform/opacity, shown from 28px up, and the status dot rides on the ring.
- Video uses the shared `VideoPlayer`. Never show a raw `<video controls>`.
- Audio and video use the shared players; never show a raw <audio controls>.
