# Alerts when Nook is closed (web push) — optional, 5 minutes

Without this, Nook still shows alerts while a tab or the desktop app is open. This adds alerts on phones and browsers when nothing is open. It is off until you do these steps, and the switch in Settings > Notifications only appears once step 2 is done.

1. Run `supabase/update_v21.sql` (adds the `push_subscriptions` table).
2. Make a key pair: run `npx web-push generate-vapid-keys` on your computer.
   - Put the **public** key in your hosting environment as `VITE_VAPID_PUBLIC_KEY` and redeploy the site.
3. Deploy the function and give it its secrets (Supabase CLI):
   ```
   supabase functions deploy send-push --no-verify-jwt
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com PUSH_WEBHOOK_SECRET=pick-a-long-random-string
   ```
4. In Supabase: Database > Webhooks > Create. Table `messages`, event **Insert**, type "Supabase Edge Functions", function `send-push`, and add an HTTP header `x-webhook-secret` with the same string as `PUSH_WEBHOOK_SECRET`.
5. Open Nook > Settings > Notifications > turn on "Alerts when Nook is closed" (per device).

Notes
- It respects each chat's notification setting (everything / mentions / mute).
- Encrypted DMs cannot be read by the server, so they only say "New message". Everything else shows the sender and the start of the message.
- On iPhone, alerts only work after you "Add to Home Screen" (Share menu) and open Nook from that icon.
- The desktop app does not use this; it has its own notifications.
