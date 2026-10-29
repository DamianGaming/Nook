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

## Performance notes

- **Small first load:** each screen (home, sign in, chat, two-factor, recovery) loads only when needed; popups are fetched in the background once the app is idle, and the call library is fetched a few seconds after sign in (skipped on data saver or slow connections), so the first call starts quickly.
- **Long chats:** message rows far off screen are not laid out or painted until they come near (`content-visibility`).
- **Fewer timers and requests:** the typing-indicator timer only runs while someone is typing; the voice roster stops polling while the tab is hidden and refreshes when you come back; unread counts are batched.
- **Fewer re-renders:** avatars, group icons, channel icons, custom emoji, names and badges are memoised; emoji search stays instant while the long list catches up.
- **Caching:** built files are cached for a year, icons for a week (`netlify.toml`).
- **Desktop:** program detection is one quick look every 30 seconds, and a program's icon is only read when the activity changes.
