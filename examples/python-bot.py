# The same idea in Python (needs:  pip install requests ).  Run:  python python-bot.py
import time, requests

URL = "https://YOUR-PROJECT.supabase.co"
ANON_KEY = "YOUR-ANON-KEY"
TOKEN = "nk_YOUR_BOT_TOKEN"

def rpc(name, body):
    r = requests.post(f"{URL}/rest/v1/rpc/{name}", json=body,
                      headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}, timeout=15)
    if not r.ok:
        raise RuntimeError(r.json().get("message", r.text))
    return r.json() if r.text else None

me = rpc("bot_me", {"token": TOKEN})
print("Logged in as", me["name"])
cursor = me["now"]
while True:
    try:
        for m in rpc("bot_events2", {"token": TOKEN, "after": cursor, "lim": 100}):
            cursor = m["at"]
            # m["type"] is message, edit, reaction or member_join. Every other call works the same way: rpc("bot_<name>", {...}).
            if m["type"] == "message" and (m["content"] or "").strip() == "!ping":
                rpc("bot_send", {"token": TOKEN, "channel": m["channel_id"], "content": "pong!", "reply": m["message_id"]})
    except Exception as e:
        print("Problem:", e)
        time.sleep(10)
    time.sleep(1.5)
