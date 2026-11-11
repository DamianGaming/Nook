# Nook

A free, web-only chat app: private DMs and group chats with categories and channels. No servers.

## Setup

1. Create a free project at supabase.com.
2. In the Supabase **SQL editor**, run these files in this order (`schema.sql` is for the first run only; the others are safe to re-run):
   1. `supabase/schema.sql`
   2. `supabase/fix_profiles.sql`
   3. `supabase/update_media.sql`
   4. `supabase/update_v3.sql`
   5. `supabase/update_v4.sql` (calls)
   6. `supabase/update_v5.sql` (keeps the voice roster accurate in background tabs)
   7. `supabase/update_v6.sql` (group voice rooms, drag-and-drop saving, badges, statuses)
   8. `supabase/update_v7.sql` (friends)
   9. `supabase/update_v8.sql` (social links on profiles)
   10. `supabase/update_v9.sql` (video uploads up to 50 MB, avatar frames, name fonts, card themes)
   11. `supabase/update_v10.sql` (voice messages and audio files, gradient name colour, frame colour)
   12. `supabase/update_v11.sql` (end-to-end encrypted DMs, group banners, terms acceptance, report categories, data export)
   13. `supabase/update_v12.sql` (custom emoji, Staff badge, per-member group permissions, channel and group customisation)
   14. `supabase/update_v13.sql` (automatic always-on encryption, staff admin panel, picture icons for channels)
   15. `supabase/update_v14.sql` (staff two-factor requirement, announcements, group tools, signup chart)
   16. `supabase/update_v15.sql` (activity statuses, unread @mention counts)
   17. `supabase/update_v16.sql` (automatic activity, on/off switch)
   18. `supabase/update_v17.sql` (instant message deletes for everyone)
   19. `supabase/update_v18.sql` (automatic activity marker, used by the desktop app and calls)
   20. `supabase/update_v19.sql` (program icon on automatic activity, steady start time)
   21. `supabase/update_v20.sql` (several activities at once, "Using" an app)
   22. `supabase/update_v21.sql` (reactions with any emoji, pinned messages, whole-group search, per-chat notification settings, timeouts, bulk delete and activity log, rate limits, web push table, error log)
   23. `supabase/update_v22.sql` (shared music queue for calls)
   24. `supabase/update_v23.sql` (group invite previews)
   25. `supabase/update_v24.sql` (bots, threads, polls, saved messages, search filters, welcome/rules, stickers)
   26. `supabase/update_v25.sql` (many more bot abilities; also tidies away the voice rooms that v24 briefly had)
   27. `supabase/update_v26.sql` (favourite GIFs, bot default permissions, even more bot abilities)
   28. `supabase/update_v27.sql` (slash commands, buttons and menus, hidden replies)
   29. `supabase/update_v28.sql` (removes the old built-in bot storage)
   30. `supabase/update_v29.sql` (200 commands per bot, bots show online, Activities)
   31. `supabase/update_v30.sql` (four more Activities)
   32. `supabase/update_v31.sql` (bigger staff panel, site settings, forms for bots, bot status)
3. Copy `.env.example` to `.env` and add your project URL and anon key (Project Settings, then API).
4. `npm install` then `npm run dev`.
5. Calls need a little extra setup, see `CALLS_SETUP.md`.
6. Deploy: connect the repo to Netlify (`netlify.toml` is included) or upload `dist/` after `npm run build`. Set the two env vars there, and add your site URL in Supabase under Authentication, URL Configuration (needed for password reset links).

## What works

- Accounts, password reset, change username (every 14 days) and password, delete account
- DMs by username, group chats with categories and channels, invite codes (founder can regenerate)
- No true owner: the **founder** manages channels, categories, topics, members and can delete messages; everyone else has equal chat abilities; the role can be passed on
- Profiles: picture and banner uploads (animated GIF/WebP supported), display name, pronouns, bio, status, colours, live preview
- Online, idle and do-not-disturb presence (idle after 5 quiet minutes, invisible hides you)
- Unread badges (per channel, group and DM), tab title count, optional desktop notifications
- Typing indicators, replies, reactions, image attachments (button, paste or drag and drop), links, `code` and **bold**
- Message search, date dividers, jump to latest, edit with the up arrow, load older history
- Reports, blocking (with an unblock list), rate limiting, community guidelines screen
- Voice and video calls in DMs (rings the other person) and one voice room per group (join from the top of the group's sidebar, see who is in it), camera, mic, deafen, screen sharing on desktop browsers (LiveKit); calls rejoin by themselves after a tab sleep or network drop
- Voice and video settings (devices, noise suppression, volume, test mic) and call sounds, all synthesised so there are no audio files
- In-app confirmations, prompts and toasts instead of browser popups (`src/dialog.jsx`)
- Nooky, the mascot: `src/components/Mascot.jsx` (moods, tones, animated with CSS only)
- Friends: add by username, accept requests, and friends appear in your private chats (profile cards have an Add friend button)
- One Settings screen (gear by your name): profile, account, voice and video, notifications and sounds, privacy, about
- Messages send, edit and delete instantly (delete has a 5 second Undo); replies to you and reactions on your messages are highlighted
- Social links on profiles (up to 5, set in Settings, My profile), and a roomier profile card
- Right-click menus on messages, channels, categories, private chats and members
- Offline banner, installable on phones and desktops (Add to Home Screen), responsive layout

## Styling

All UI rules (tokens, spacing, motion, performance, accessibility) are in `STYLE_GUIDE.md`. Follow it for any new UI. Colours and timings live as variables at the top of `src/styles.css`.

## Before a public launch

- Replace the guidelines text with proper Terms of Service and a Privacy Policy, and add a contact address for reports. Get legal advice on wording (UK Online Safety Act, UK GDPR).
- Reports are stored in the `reports` table (Supabase, Table editor). Decide who reviews them and how quickly.
- Image uploads are public-by-URL. Consider adding moderation or scanning if the community grows.
- Deleting an account removes its messages and profile but not its uploaded files from storage; clean these up periodically.
- Free-tier limits apply (Supabase database, storage and realtime connections).

## Badges

Badges are shown on profiles. Nobody can give themselves one; you hand them out in the Supabase SQL editor:

```sql
update profiles set badges = array['team','early'] where username = 'damian';
```

Available: `team`, `early`, `supporter`, `bughunter`, `creator`. Automatic ones (Fresh Sprout, One Year In, All Set Up, group Founder) need no setup. Add more in `src/badges.jsx`.

## Video, emoji and profile style

- **Videos:** MP4, WebM and MOV up to 50 MB can be attached in chats (button, drag and drop, or paste). They play in Nook's own player: seek bar, volume, speed, picture in picture, download, full screen, and keyboard shortcuts (space, arrows, M, F). Run `update_v9.sql` first so storage accepts them. Supabase's free plan caps uploads at 50 MB.
- **Emoji:** type `:smile:` and it turns into the emoji. Typing `:smi` shows suggestions (arrow keys then Enter or Tab). The list loads only when you first type a colon.
- **Voice messages and audio:** tap the mic in the message box to record (up to 5 minutes), then send, or bin it. MP3, M4A, WAV and OGG files up to 50 MB can be attached and play in a small player with a waveform and speed control. Needs `update_v10.sql`.
- **Profile style** (Settings, Profile style): avatar frames (some take your own colour), name fonts, a second name colour for a gradient, and card themes. They are stored on the profile and checked by the database, so only the listed options are accepted.
- **Badges:** hand out the given ones in the SQL editor, for example `update profiles set badges = array['team','mod','tester'] where username = 'damian';`. Given: team, early, supporter, bughunter, creator, mod, partner, tester, translator, champion. Automatic: sprout, month, halfyear, year, allset, linked, styled, storyteller, founder.
- Every profile card (popup, your menu, editor preview) is the same `CardBody` component in `ProfileUI.jsx`.

- The card in the menu above your name is a compact version on purpose; every other profile card is the full one.
- Unread badges: counts are refreshed when you come back to the tab, and the chat you are looking at is cleared as read.


## Privacy, safety and legal (v11)

- **End-to-end encryption (DMs only):** turn it on in Settings, Privacy and safety. Keys are made in the browser and locked with a passphrase Nook never sees. Text, voice messages and attachments in DMs are sealed; the server only holds scrambled data. Group chats and calls are encrypted in transit only, not end-to-end. If someone forgets their passphrase they must reset, and older encrypted messages are lost. Compare safety numbers to verify a contact.
- **Legal pages:** Terms, Privacy, Guidelines, Copyright and Safety live at `#/terms`, `#/privacy`, `#/rules`, `#/copyright`, `#/safety`. Sign-up needs an age (13+) and terms tick, and everyone is asked again when `TERMS_VERSION` in `src/legal/config.js` changes.
- **Set these env vars before launch:** `VITE_CONTACT_EMAIL`, `VITE_COMPANY_NAME`, `VITE_COMPANY_ADDRESS`, `VITE_LEGAL_JURISDICTION` (default England and Wales).
- **Not legal advice:** the policies are a strong, plain-language starting point. Have a qualified lawyer review them for where you operate.
- **Reports, group banners, data export and Light screen-share quality** all arrive with `update_v11.sql` and this version. Redeploy the `livekit-token` function so call tiles show frames and name styles.

## Emoji, permissions and customisation (v12)

- **Emoji button** in the message box opens a picker with search, recents, every standard emoji, and your groups' custom emoji. Typing `:name:` still works, with suggestions.
- **Custom emoji:** people with the Manage emoji permission add pictures (under 256 KB, up to 50 per group) in Group settings. They can be used in any group and in DMs, and show for people outside the group too (messages store `<e:ID:name>`).
- **Permissions, no roles:** the founder switches individual powers on per member in Group settings, Members, Permissions: manage channels, manage messages, manage emoji, create invites, remove members, customise the group. The founder always has all of them.
- **Channel settings** (sliders icon on a channel): name, topic, icon, slowmode, and read-only announcement channels. **Group settings** also gain a description and group colour.
- **Staff badge:** an official gradient badge, only given from the SQL editor: `update profiles set badges = array['staff'] where username = 'yourname';`
- Badges show as a short row with a +N chip in chat, and as full labelled pills on profile cards, most important first.


## Always-on encryption, staff panel, channel pictures (v13)

- **Encryption is always on.** Keys are created automatically the first time someone opens Nook and follow them to every device, with nothing to type. Each person's key backup is opened by a random secret kept in their own row (`key_secrets`). That means encrypted DMs are unreadable to the database and to normal staff access, but the person running the Supabase project could technically unlock them. People who want it to be impossible can add their own passphrase in Settings, Privacy and safety (then only they can unlock it, and a forgotten passphrase means lost history). Signing out wipes the key from that browser. The Privacy Policy says all of this plainly, so keep it in sync if you change the design.
- **Staff panel:** people with the `staff` badge see a shield button next to Settings. It has Reports (resolve, reopen, delete the reported message, suspend), People (search, suspend, lift, give or remove badges), Overview (counts) and Log (every action, with who did it). The checks are enforced in the database (`is_staff()`), not just hidden in the page. Suspended accounts can read but not send.
- **Channel pictures:** Channel settings has a picture upload, shown in the sidebar and header. A picture wins over the symbol.
- **Speed:** fewer re-renders for names, badges and avatars, and the database connection is opened early.


## Two-factor, full end-to-end, more staff tools (v14)

- **Two-factor sign-in (authenticator app):** Settings, Privacy and safety, Set up two-factor (scan the QR, enter a code). After the password, a 6-digit check appears. Turn on TOTP in Supabase under Authentication, Multi-Factor first. If someone loses their phone, remove their factor in the Supabase dashboard (Authentication, Users).
- **Staff need two-factor:** `is_staff()` now also requires a two-factor session, so the staff panel stays locked until the person has set it up and signed in with a code.
- **Full end-to-end:** Settings, Switch to full end-to-end creates a recovery key (shown once, copy or download). The automatic secret is deleted, so only the person holds the key and Nook cannot unlock their messages. New devices need the recovery key (a passphrase of their own works too).
- **Staff panel additions:** Groups tab (search, member and channel counts, delete with a reason), Announce tab (a dismissible banner for everyone), CSV export of reports, and a 7-day signups chart.


## Encrypted calls, tidier panel (v14b)

- **Encrypted calls, like Discord:** one-to-one DM calls (voice, video and screen sharing) are end-to-end encrypted with LiveKit's built-in call encryption. The key is worked out on both devices from the two people's encryption keys and is never sent anywhere. A green "End-to-end encrypted" chip shows in the call. If either person has no key yet (or has not unlocked a passphrase account), the call falls back to normal transport encryption and the chip says so. Group voice channels are encrypted in transit only.
- Settings no longer shows the encryption heading twice, and the staff panel is a compact list.

## Home page and activity statuses (v15)

- Signed-out visitors land on a home page (`Landing.jsx`) with info about Nook, a **Use in web** button (opens sign in) and a **Download for Windows** button that only shows "coming soon" for now. Signed-in users skip it.
- **Activity status**: pick Playing, Listening, Watching, Streaming, Competing or Building plus a name from your profile menu. It shows on your profile card, in member lists and in Friends, and disappears after 24 hours. Needs `update_v15.sql`.
- **Automatic activity** (v16): while you are in a group call Nook shows "In a call in <group>", and "Sharing their screen in <group>" while you share. DM calls only say "a private call". Switch it off with **Show what I'm doing** in your profile menu. Activities you set yourself are never replaced. Needs `update_v16.sql`.
- **Home page when signed in**: profile menu, **Nook home page** (address `#/home`). It opens over the app so a running call keeps going.
- **Mentions**: `@username`, `@everyone` and `@here`. Unread mentions give a red badge on groups and channels, and persist across reloads via `mention_counts` in `update_v15.sql`.
- The call bar stays visible in group chats too, and voice rosters skip re-rendering when nothing changed.

## Voice presence, mentions, ping (v15)

- **See who is in voice from anywhere:** a green headphone badge with a count appears on a group's icon in the left bar when people are in its voice channel, and hovering shows who. The Home sidebar also has an "In voice now" list that jumps you to the group.
- **Ping and connection quality:** while in a call, the sidebar bar and the call header show your round trip to the call server in ms (green, amber, red), and each person's tile shows signal bars.
- **@mentions** in groups and DMs: type `@` to pick someone (arrow keys and Enter). `@everyone` and `@here` are offered to founders and people with Manage messages. Mentions are highlighted chips, messages that mention you get a gold edge, and in groups a red dot or badge marks channels where you were mentioned. They are plain text, so they work in encrypted DMs. The check for who may use `@everyone` happens in the app, so it is a courtesy and not a security control.

## Windows desktop app

**Step-by-step instructions to get the installer: see `WINDOWS_APP.md`** (double-click `desktop/build-windows.bat` on a Windows PC, or let GitHub build it).

The `desktop/` folder holds the Windows app. It is the website in its own window, running the very same built files, so every screen and feature is identical. The only differences are things that only make sense on a computer:

- **No home page.** It opens straight on sign in.
- **Automatic activity, any app.** Every 30 seconds the app takes one quick look at what is running and shows **everything that is true at once**, as a neat stack on your profile card: **Playing** a game (matched against about 180 popular games in `desktop/games.json`), **Streaming** (OBS, Streamlabs), **Listening to** *artist - song* on Spotify, **Using** the app you are working in (any app: Visual Studio Code, Photoshop, a game that is not on the list...), plus **In a call** or **Sharing their screen** from Nook itself. Each card shows the program's own icon (read from its `.exe`, saved as a tiny picture in your media folder), the name, and how long, counting up live.
  - "Using" is the app that stays in front for two checks in a row, so quick alt-tabbing is ignored. Only the app's name is shared, never window titles or contents (Spotify's song title is the one exception). It clears after 5 minutes away from the keyboard. The desktop itself, system parts, Nook and password managers are never shared.
  - **Your controls:** the profile menu switch **Show games and what I'm doing** turns all automatic activity off. The tray menu item **Show the app I am using (not just games)** turns off just the "Using" card. To hide particular apps, create `hidden-apps.json` in the app's data folder (`%APPDATA%\Nook`), like `["notepad", "My Banking App"]` (program name or the name shown). To teach it a game, create `custom-games.json` there, like `{ "mygame": "My Game" }` (program name without `.exe`, lower case).
  - It refreshes every few minutes and vanishes within about 15 minutes if the app closes. One you set yourself is separate and is never replaced. Needs `update_v18.sql`, `update_v19.sql` and `update_v20.sql`.
- **Tray icon.** Closing the window keeps Nook running in the tray, so calls and messages carry on. Right-click the tray icon for **Start with Windows**, **Check for updates** and **Quit**.
- **Taskbar flash** when something new arrives while Nook is in the background, and the tray tooltip shows the unread count.
- **Screen sharing picker.** Windows shows a "Choose what to share" window (sound is included when sharing a whole screen).
- **Automatic updates** from your GitHub releases. When an update has downloaded, a toast offers **Restart**; otherwise it installs the next time you quit.

### Publish it on GitHub (installer, updates and the download button)

1. Put the project in a GitHub repository. In **Settings, Secrets and variables, Actions** add the secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optionally the variables `VITE_CONTACT_EMAIL` and `VITE_COMPANY_NAME`).
2. Set `"version"` in `desktop/package.json` (for example `0.1.0`), then push a tag with the same number: `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`.
3. The workflow **Build and publish Windows app** builds the installer and publishes a GitHub release containing `Nook-Setup.exe`. Every later tag becomes an update that installed apps pick up by themselves. Raise `"version"` each time.
4. Set `VITE_GITHUB_REPO=owner/repo` for the website and rebuild it. The home page's **Download for Windows** button then downloads the latest `Nook-Setup.exe` from your releases (it shows "coming soon" until then, and is not shown in the desktop app).

To build it on your own Windows PC instead: put your keys in `.env`, then in `desktop/` run `npm install` and `npm run dist` (installer in `desktop/release/`; set `NOOK_REPO=owner/repo` first if you want that copy to receive updates), or `npm start` to try it without installing.

Notes: confirmation and password-reset emails open in your browser, so finish them there and then sign in on the app. The installer is not code-signed, so Windows may show a SmartScreen warning on first run.

## Latest additions (v21)

- **Reactions with any emoji** (the "+" in the reaction bar opens the full picker, custom emoji included). **Platform icons** next to the status dot show whether someone is on the website or the desktop app.
- **Pinned messages** (pin button on a message for the founder, and in DMs for both people; pin list in the chat header). **Search** this channel or the **whole group**; clicking a result jumps to it, even from another channel. Encrypted DMs are searched on your device.
- **Notification settings** per group, channel or DM (all / mentions / mute for a while) from the bell in the chat header.
- **Moderation:** in Group settings > Members: timeouts (5 min to 1 week), delete someone's recent messages, and an activity log. Spam rate limits are enforced in the database.
- **Staff panel > Errors:** crashes people hit, grouped. Reporting sends only the error text and page name.
- **Appearance:** light, dark or match-my-device, plus an accent colour (Settings > Appearance). Big pictures are shrunk before upload; GIFs are never touched.
- **Voice keys:** push to talk (while Nook is in front) and, in the desktop app, global mute/deafen keys (Voice and video settings).
- **Alerts when Nook is closed:** see `WEB_PUSH.md`. The site is also installable (service worker) and opens offline-shell.
- **Backups:** `.github/workflows/backup.yml` saves the database weekly (private repositories only; it covers database tables, not uploaded files or login accounts, which Supabase backs up itself on paid plans).
- Not done: a custom title bar, a windowed (virtualised) message list, an on-device message cache and link embeds. The app remains fast with the lighter row rendering described below.

## Music in calls (v22)

Everyone in a call (group voice room or DM call) has a **music button** in the call controls. Anyone can paste a **YouTube link, a YouTube playlist link, or a direct link to an audio file** (.mp3, .m4a, .ogg, .wav). Songs join one shared queue and everyone in the call hears the same song at the same point. Anyone can skip; the person who added a song (or a group manager) can remove it; managers can clear the queue. **Mute and volume are personal**: they only change what you hear, and are remembered on your device. Being deafened silences the music for you too.

How it works and its limits:
- Run `supabase/update_v22.sql`. The queue and "what is playing since when" live in the database, so people who join late start in the right place.
- Songs are never downloaded or stored by Nook. YouTube songs play in YouTube's own embedded player on each person's device, so a video whose owner blocked embedding, or a private one, is skipped with a message. Spotify, Apple Music and SoundCloud do not allow this and are refused with an explanation. YouTube "Mix" playlists cannot be added.
- Playlists are read by loading them in a hidden player (up to 50 songs at a time, 100 in the queue).
- Browsers sometimes block sound until you click once; then the panel shows **Tap to start the music**.
- Not paused-and-resumed: the queue plays continuously, like a radio. Skip moves everyone on.

## Right-click moderation, picker and desktop polish (v22b)

- **Timeouts and bulk delete are right-click actions**: right-click a member (in the member list) or a message from someone else. "Time out" and "Delete their messages" open small submenus. They only appear if you have the Members / Messages permission. The activity log stays in Group settings.
- **Emoji picker is much faster**: the list is prepared once, opens instantly after the app has been idle for a moment, draws long categories in two steps, and uses one click handler for the whole grid. The reaction picker now opens next to its button and always stays fully on screen.
- **Music** opens as a dropdown attached to its button.
- **Desktop screen share window** now matches the app (screens and windows tabs, search, selection check, same buttons).

## Smoothness pass (v22c)

- Typing indicators are sent at most every 2.5 s; scroll measurement runs once per frame; chat scrolling keeps its position when older messages load.
- Rows in long lists (members, friends, search results, emoji) are only laid out when near the screen. Hover effects are skipped on touch screens. Animations respect "reduce motion".
- LiveKit (calls) is its own cached file; production builds drop debug logging.
- Spacing made consistent for settings rows, modal footers, section headings and right-click menus.

## Formatting, embeds and invite links (v23)

- **Markdown in messages:** `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `||spoiler||` (click to reveal), `` `code` ``, code blocks with three backticks, `> quote`, `# heading` (1 to 3), `- list`, `1. list`, `---` line, `[text](https://link)` and plain links. No raw HTML is ever shown as HTML.
- **Typing toolbar:** a small bar appears above the message box while you type (bold, italic, underline, strike, spoiler, code, quote, list, link, **Embed**). Ctrl+B / Ctrl+I / Ctrl+U work too, and pressing a button again removes the formatting.
- **Embeds:** the Embed button opens a builder (title, description, side colour, up to 4 fields, large and small picture, footer, title link) with a live preview. They work in channels and in encrypted DMs. Pictures must be https links and load from that address.
- **Invite links:** Group settings > Invite code has **Copy invite link** and **Send to someone** (sends it straight into a DM, encrypted like any message). Anyone who receives the link sees a card with the group's picture, name, description and member count and a **Join** button. Opening the link in a browser keeps it through sign-in and then shows the same card. Run `supabase/update_v23.sql` first. If your site address differs from where the app runs (for example the desktop app), set `VITE_SITE_URL=https://your-site` so copied links point at the website.
- **Fixed:** the profile card banner and close button misplacement.

## Bots, threads, polls and more (v24)

Run `supabase/update_v24.sql` and `supabase/update_v25.sql`, then deploy the new `link-preview` function (`supabase functions deploy link-preview`). Everything degrades quietly if a piece is missing.

- **Developer portal and bots:** the `</>` button in the top bar opens the portal. Create a bot, copy its token (shown once), and paste its *add code* in Group settings > Members > **Add a bot** (needs the Manage members permission, up to 10 bots per group). Group settings is now tabbed (Overview, Invites, Welcome, Emoji and stickers, Members, Audit log, Leave). Bots show a BOT tag, cannot be DMed, and only ever make outgoing requests, so they run fine on a home PC with no ports open. The public guide lives at `/developers` (also inside the portal) and covers setup, Windows auto-start, the `nook-bot.mjs` library (`public/sdk`, also in `examples/`) and Python. Bots talk to Postgres functions through the normal API with the anon key, so no extra server is needed.
- **Threads:** hover a message and press the speech bubble (channels only). Replies appear in the channel and in a side panel with a reply count under the original.
- **Polls:** the **Poll** button in the formatting bar (channels). 2 to 6 options, one vote each, live results. Bots can post polls too.
- **Saved messages:** the star on a message saves it privately; the star in the chat header lists them.
- **Search filters:** `from:name`, `has:image|video|audio|file|link`, `before:2026-10-31`, `after:2026-09-01`, mixed with normal words. Whole-group search runs on the server; direct messages are searched on your device because they are encrypted.
- **Welcome and rules:** Group settings > Welcome and rules. People see a welcome screen; if rules are set they must press **I agree** before posting (the founder and bots are exempt; editing the rules asks everyone again). Optionally jump new people to a first channel.
- **Stickers and GIFs:** groups add stickers like emoji (Group settings, up to 30, under 512 KB). The emoji picker gets Stickers and GIF tabs. GIF search uses **GIPHY**: create a free app at developers.giphy.com (choose API), copy its key and set `VITE_GIPHY_KEY` (in Netlify and in your desktop build). With no key the GIF tab says it is off. Showing a GIF contacts GIPHY.
- **Link previews:** channels show a card under the first link, fetched by the `link-preview` function (blocks private addresses, 5 s and 512 KB limits). Each person can turn it off in Settings > Notifications > Messages.
- **Offline and reconnect:** the newest messages of each chat are kept in the browser (encrypted chats stay encrypted) and wiped on sign-out. A banner shows when you are offline, and chats catch up when the connection returns.
- **Accessibility:** an axe scan of the home, sign-in and developer pages is clean in light and dark; added a skip link, a labelled message log, labelled controls and better contrast on buttons.

## Performance notes

- **Small first load:** each screen (home, sign in, chat, two-factor, recovery) loads only when needed; popups are fetched in the background once the app is idle, and the call library is fetched a few seconds after sign in (skipped on data saver or slow connections), so the first call starts quickly.
- **Long chats:** message rows far off screen are not laid out or painted until they come near (`content-visibility`).
- **Fewer timers and requests:** the typing-indicator timer only runs while someone is typing; the voice roster stops polling while the tab is hidden and refreshes when you come back; unread counts are batched.
- **Fewer re-renders:** avatars, group icons, channel icons, custom emoji, names and badges are memoised; emoji search stays instant while the long list catches up.
- **Caching:** built files are cached for a year, icons for a week (`netlify.toml`).
- **Desktop:** program detection is one quick look every 30 seconds, and a program's icon is only read when the activity changes.

## Bots, round two (v25)

Run `supabase/update_v25.sql`. Bots can now do much more, each action limited by the permissions the founder gives that bot in Group settings > Members > Permissions (the same list people have):

- **Everything in one feed:** new messages, edits, reactions and people joining (`bot_events2`; older bots using `bot_events` keep working).
- **Reading:** channel history, member lists, single messages with reaction counts, poll results, the channels and permissions of each group.
- **Acting:** delete other people's messages and pin (needs *messages*), kick and time out (needs *members*), create and delete channels (needs *channels*). Everything shows in the audit log under the bot's name.
- **Itself:** a "Playing/Watching..." status, leaving a group, and a private key-value store (500 keys) so a bot remembers things without its own database.
- **Library v2** (`/sdk/nook-bot.mjs`, also in `examples/`): `m.reply()`, command descriptions with an automatic `!help`, per-person cooldowns, `bot.history/members/pin/kick/timeout/kv/setStatus` and more. New example `examples/mod-bot.mjs`.
- **Docs** at `/developers` are now a paged guide (Welcome, Quick start, Running your bot, Library, Events, Messages and style, Permissions, Storing data, Limits, Troubleshooting).
- Voice rooms (briefly in v24) were removed on request; update_v25.sql drops their table if you had already run v24.

## GIF favourites, connect keys and AI-built bots (v26)

Run `supabase/update_v26.sql` (after v25). It is safe to run again.

- **More GIFs:** the GIF tab now loads 48 at a time and keeps loading as you scroll (or press Load more), with category chips (Trending, Reactions, Happy, Funny, Love, Sad, Angry, Wow, Thumbs up, Dance, Celebrate and more). Needs `VITE_GIPHY_KEY`.
- **Favourite GIFs:** tap the star on any GIF, in the picker or on a GIF in chat, and it appears under the Favourites chip. They are stored in your account (up to 300) so they follow you to every device.
- **One connect key:** the Developer portal gives each bot a single `nkc_...` key (site address + public key + the bot's token). In code it is just `new NookBot({ key })`, or set the `NOOK_KEY` environment variable and write `new NookBot()`. The long form with `url`, `anonKey` and `token` still works. The key is shown when a bot is made or when you press New key (the token is only stored hashed, so it cannot be shown again).
- **Default permissions:** when you create a bot you choose what it may do (Chat only, Moderator, Full control, or tick your own). When a group founder adds it with its add code it joins with exactly those permissions. Someone with only "manage members" can only pass on permissions they hold themselves. The Add bot box shows the permissions before you confirm, and the founder can still change them in Group settings > Members.
- **More powerful bots:** rename channels, set topics, change the group name and description, read the invite code, purge the latest messages, list pins, search messages, read the audit log and look up users (each limited by its permission). Library: `renameChannel`, `setTopic`, `updateGroup`, `inviteCode`, `purge`, `pins`, `search`, `audit`, `user`.
- **Build with ChatGPT or any AI:** the docs page "Build with AI" (and the portal's "Copy brief for ChatGPT") produces a ready-made brief that teaches an AI the whole library, so it can write a working bot from a plain description. A bot that answers with ChatGPT needs its owner's own OpenAI key, kept in the `OPENAI_API_KEY` environment variable on their PC.
- **Do it yourself without code:** the portal's Download starter gives a single `mybot.mjs` (library included, key inside) plus `start.bat`, which checks Node.js, runs the bot and restarts it if it stops. Starters: Hello bot, Welcome and rules, Moderator, Auto-replies, AI chat bot, Blank.

Tested here: all SQL against a local Postgres 16 (`supabase/tests/smoke.sh`), the starter files parse, the connect key decodes, the site builds. Not tested here: the signed-in app against a real Supabase project, live GIPHY calls, the bot library against a live project, Windows `start.bat`, or a real OpenAI call.

## Slash commands, buttons, hidden replies and single-file bots (v27)

Run `supabase/update_v27.sql` (after v26). Safe to run again.

- **Slash commands:** bots publish commands with descriptions and options. Type `/` in a group and every bot command appears above the message box (arrow keys, Enter or Tab to pick). Commands with options open a small form above the box (text, numbers, yes/no switch, member list, fixed choices); typing `/roll 20` in full works too. Nook validates required options, numbers, members and choices before the bot hears about it.
- **Buttons and dropdown menus:** bot messages can carry up to 10 buttons (primary, secondary, success, danger, or link buttons) and a dropdown with up to 25 options. Presses reach the bot, which can reply, reply privately, or update the message the button was on.
- **Hidden replies ("Only you can see this"):** a bot can answer a command or button press so only that person sees it. They live in their own table with row-level security, never in the chat, and disappear after about an hour or when dismissed.
- **Richer embeds:** author line, inline fields (up to 6), footer picture, timestamp, longer text, plus text above the card. Spoilers (`||text||`) work everywhere.
- **Cleaner composer bar:** proper icons for bold, italic, underline, strikethrough, spoiler, code, code block, quote, list and link, with Commands, Embed and Poll buttons grouped on the right.
- **Libraries fetched, not built in:** the site hosts installable packages, like discord.js and discord.py (`npm install https://YOUR-SITE/sdk/nook-bot.tgz`, `pip install https://YOUR-SITE/sdk/nook_bot-4.0.0-py3-none-any.whl`). A bot is as many files as it likes and imports the library normally. Rebuild them after editing the library with `python3 scripts/build_sdk.py`.
- **Library v3:** `bot.slash(...)`, `bot.button(...)`, `bot.select(...)`, `i.reply/hidden/update/say`, message objects `{ content, embed, buttons, select }` accepted by `send`, `edit` and `reply`. Raw API: `bot_register_commands`, `bot_interactions`, `bot_respond`.

Tested here: all SQL (including validation, privacy of hidden replies, expiry and button presses) against local Postgres 16; the library end to end through the real SQL (register, run a command, public and hidden replies, button update, dropdown); starters and AI-assembled files parse; the new interface pieces rendered in a browser and checked for accessibility. Not tested here: the signed-in app against a real Supabase project (so the live "/" menu in the chat window is untested end to end), live GIPHY, Windows `start.bat`, a real OpenAI call.

## Node.js and Python bots, your own database, user embeds with buttons (v28)

Run `supabase/update_v28.sql` (after v27). Safe to run again.

- **Node.js or Python:** pick a language in the Developer portal. "Download bot folder" gives a zip with your bot file, `.env` (the connect key), `start.bat`, and `package.json` or `requirements.txt`. `start.bat` installs the newest Nook library from your site (plus anything else the bot imports), runs the bot, and restarts it if it stops. Python has the same features as Node (`@bot.slash`, `@bot.button`, `@bot.select`, `i.reply / hidden / update`, embeds, moderation).
- **Library is fetched:** `start.bat` always downloads the current library, so updates reach every bot. Nothing is pasted into the bot file, and a bot can be split into as many files as you want.
- **No built-in bot storage:** the old `bot.kv` is gone (v28 removes its tables). A bot that must remember things keeps its own database: SQLite (a single file; the "Points" starter shows it) or MySQL. The docs page "Remembering things" explains both, and the ChatGPT brief tells the AI to use them.
- **No raw API in the docs:** the docs only show the libraries.
- **People can add buttons to their own embeds:** the embed builder now has link buttons (up to 5), author, text above the card, footer picture, timestamp, inline fields (up to 6) and a live preview beside the form. Buttons that do things need a bot, so people get link buttons.
- **Examples:** `examples/node/` and `examples/python/` hold a complete folder for every starter.

Tested here: all SQL against local Postgres 16; the Node package (installed from the built `.tgz`) and the Python package (installed from the built `.whl`) both run slash commands, hidden replies, buttons, dropdowns and `!` commands end to end through the real SQL; every example file parses; the embed encoder and parser round-trip; the site builds. Not tested here: the signed-in app on a real Supabase project, installing from your deployed site, Windows `start.bat`, a real OpenAI or MySQL connection.

## Bigger command lists, online bots, a tidier message bar and Activities (v29)

Run `supabase/update_v29.sql` (after v28). Safe to run again.

- **Up to 200 slash commands per bot** (was 50). The "/" list scrolls and filters by name, bot or description, and shows how many matches there are.
- **"/" always shows something:** Nook has built-in commands (`/shrug`, `/tableflip`, `/unflip`, `/me`, `/spoiler`, `/embed`, `/poll`, `/activity`) that sit in the same list as bot commands. The Commands button in the message bar is always there too.
- **Bots show online:** while a bot is running (any call it makes counts) it gets the green dot, and it clears about a minute after it stops. The site asks the server every 30 seconds.
- **Message bar fixed:** the bold/italic/etc bar, the command list and the option form now line up exactly with the message box's edges, with the same border thickness, on desktop and phone widths.
- **Activities:** the gamepad button in a channel's top bar starts a shared activity that everyone in the group can join: **Tic-Tac-Toe**, **Connect Four** (rules and turns are enforced by the database, with scores and rematch), **Watch Together** (a YouTube video that plays, pauses and seeks in sync for everyone) and **Sketch Pad** (one shared canvas with colours, brush size, undo and clear). One activity runs per channel at a time. The person who started it, the founder, or anyone with the Messages permission can end it. Starting one posts a small note in the chat.

Tested here: all SQL against Postgres 16 (command limit, online status, every game rule, wrong-turn and outsider checks, YouTube link validation, stroke validation); the build; the new pieces rendered in a browser (message bar alignment, "/" list, option form, all four activities, the Activities menu). Not tested here: Realtime updates and YouTube playback on a real Supabase project and a real browser session (the sync logic is written but untested live), the "/" list with real bots in a signed-in app.

## More Activities (v30)

Run `supabase/update_v30.sql` (after v29). Safe to run again. Four new things in the gamepad menu:

- **Wordle:** the whole channel guesses one five-letter word together (six tries, green/yellow/grey tiles, a colour-coded keyboard you can also type on). The word stays on the server in a table nobody can read, and is only revealed when the round ends, so no one can peek. Then pick "New word". Any five letters count as a guess (there is no dictionary check); the answers come from a list of about 640 common words.
- **Hangman:** anyone can guess a letter; seven mistakes and the drawing is complete. About 100 words, also secret until the end.
- **Rock Paper Scissors:** two players, picks are hidden on the server until both have chosen, first to three wins, then rematch.
- **Memory Match:** 16 cards, 1 to 4 players take turns flipping pairs; a match scores and lets you go again. The card layout is secret until flipped. A missed pair stays visible until the next player flips.

Tested here: all SQL against Postgres 16 (tile colours including repeated letters, the secret never appearing in shared state or readable by players, win/lose/new-round for Wordle and Hangman, hidden picks and match scoring for Rock Paper Scissors, seat/turn/match/miss rules for Memory); the screens were rendered in a browser. Not tested: Realtime updates between two real browsers on a real Supabase project.

## UI polish (v30.1, no new SQL)

- The formatting bar (bold, italic, Commands, Embed, Poll) is now a floating pill above the message box.
- All icons are now [Lucide](https://lucide.dev) (ISC licence) in `src/components/Icon.jsx`. Same `<Icon name size />` API.
- Wordle follows the real game: NYT colours, tile flip reveal, pop on typing, toasts (Not enough letters, Already tried, Not in word list), praise on a win, on-screen keyboard with a delete key. Hangman keys, Rock Paper Scissors (icons instead of emoji) and the dock were tidied.

## Bot dropdowns and library fixes (no new SQL)

- Bot dropdowns are now a custom menu that opens over the chat (the old native one closed whenever the chat refreshed and never showed what was picked). It shows the picked value, option descriptions, defaults, keyboard control (arrows, Enter, Escape), and pick-many menus with a Send button.
- Libraries: `select: { id, placeholder, min, max, disabled, options: [{ label, value, description, default }] }`, `selects: [...]` for up to 4 dropdowns, plain strings as options, `i.followUp`, `i.defer`, `i.user`. A button or menu from an old message now gets "That button is no longer active" instead of silence. Pressing on an offline bot shows a notice.
- Rebuilt `public/sdk/nook-bot.tgz` and the Python wheel.

## v31: staff panel, developer portal, forms, user embeds

Run `supabase/update_v31.sql` (after v30). Safe to run again.

- **Staff panel** now has a sidebar: Overview (numbers and 7-day charts), Reports, People (with a Details view per person), Groups, Bots (online status, suspend), Settings (pause sign-ups, read-only mode, announcement), Activity log (with filter) and Errors. Pausing sign-ups blocks new accounts; read-only mode lets only staff post. Both are logged.
- **Developer portal** is a list of your bots on the left (online dot) and one bot on the right with tabs: General, Permissions, Connect, Danger zone.
- **Forms (modals) for bots:** `i.modal({ id, title, fields })` opens a form for the person; when they send it, `bot.modal(id, fn)` runs and the answers are in `i.fields`. Node and Python libraries are rebuilt.
- **Embeds people make** can now have a dropdown (each option shows an answer or opens a link to whoever picks it) and note buttons (text shown to whoever presses it), no bot needed.
- Tested: the SQL (read-only and sign-up pause really block, forms are checked, answers reach the bot) in the smoke test; the dropdowns, notes, staff panel and portal rendered in a browser with sample data.

## Activities: live and polished (no new SQL)

- Everyone in an activity sees who else is there (avatars in the header). Realtime catches up after a dropped connection, when the tab wakes, and every 10 seconds as a safety net.
- Sketch Pad: you see other people's strokes while they draw (shared over Realtime broadcast, saved when the pen lifts).
- Wordle: you see what a teammate is typing as dashed letters, with "Sam is typing…".
- Watch Together: a quiet line says who paused, played or jumped, and an In sync / Syncing badge shows if your video matches everyone else.
- One calmer look for every game (hairline borders, pill seats and status, board panels, win pulse, mobile sizes).

## v4.1.0: bots and profile editor

- Bot libraries (Node and Python) 4.1.0: `bot.every('10m', fn)` / `bot.daily('09:30', fn)` timers, `waitForMessage`, an `Embed` builder, forms (`i.modal`, `bot.modal`), follow-ups, automatic retry when rate limited. New "Feedback and reminders" template.
- The AI brief and docs come from one table in `src/botDocs.js`. `node scripts/check_docs.mjs` (run automatically by `python3 scripts/build_sdk.py`) fails if a library function is undocumented or versions differ, so the brief cannot go stale.
- Settings > profile: new editor (`ProfileCustomize.jsx`) with click-to-change banner and picture, counters, link validation, status chips, quick looks, and live Card / Chat / Members previews. Save is enabled only when something changed; Close asks before discarding.

## v32: command replies, polls, profile editor polish

- **Run `supabase/update_v32.sql`** (after v31). Bot replies to a slash command now show "<person> used /command" above them, and bot messages carry a BOT tag. Only `bot_respond` can set that line, so it cannot be faked.
- Polls: new card (option dots, percent and count, leading option highlighted) and a builder with counters, Enter to add the next option and a live preview.
- Profile editor: padding and alignment fixes, header/hint layout, "Surprise me" random look.
- Smoke tests cover v32 (`supabase/tests/smoke.sh`).

## v33: bots are not friends, more staff controls

- **Run `supabase/update_v33.sql`** (after v32).
- Bots cannot be added as friends (checked in the database as well as the button). Their profile shows a clean BOT pill, an "Automated account" panel, and no Message or Add friend buttons.
- Staff panel: People gets time-outs (10 minutes to 1 week, can read but not post, lift any time); Groups gets Freeze/Unfreeze, a member list and Remove member (not the founder); Bots gets Revoke token (cuts the bot off until its owner makes a new token). All are logged and need two-factor like the rest of the staff tools.
- Smoke tests cover all of it.
