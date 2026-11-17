# Setting up calls

Calls use LiveKit (free tier is plenty to start). Until this is done, the call buttons show "Calls are not set up yet."

1. Create a free project at livekit.io (LiveKit Cloud). Copy the **WebSocket URL** (wss://...), **API key** and **API secret**.
2. In Supabase SQL editor, run `supabase/update_v4.sql`, then `supabase/update_v5.sql` and `supabase/update_v6.sql`.
3. In Supabase, go to Edge Functions, create a function named `livekit-token`, paste in `supabase/functions/livekit-token/index.ts`, and deploy. Leave "Verify JWT" on.
4. In Edge Functions, Secrets, add: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
5. Redeploy the site on Netlify.

Notes
- If you deployed `livekit-token` before, paste in the new `index.ts` and deploy again (it now lets the deafen status show to others).
- Voice settings (devices, noise suppression, volume, sounds) are saved per browser. Deafen and sounds need no setup.
- The window or screen picker you see after pressing Share is the browser's own and cannot be restyled; Nook shows its own quality dialog first.
- Calls need HTTPS (Netlify provides it) for mic and camera to work.
- Screen sharing works in desktop browsers; phone browsers do not support it, so the button is hidden there.
- Only people allowed in a DM or group channel can get a token, and blocked users cannot call each other.
- LiveKit free-tier limits apply (monthly minutes and bandwidth). Check your LiveKit dashboard.

- Voice is now one room per group, shown at the top of the group's sidebar. Run `update_v6.sql` and redeploy the `livekit-token` function for this to work.
