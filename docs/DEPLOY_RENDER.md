# Deploy to Render + MongoDB Atlas

CollabBoard deploys as **one Render web service** (Docker) that serves the API, the
WebSocket gateway, **and** the built React SPA from a single origin — so there are no
CORS or cross-site-cookie problems. Redis (for Socket.IO scaling) is a Render **Key
Value** instance; the database is **MongoDB Atlas**.

```
  Browser ──HTTPS──▶  Render Web Service  ──▶ MongoDB Atlas
                      (SPA + API + WS)     ──▶ Render Key Value (Redis)
```

The repo already contains everything needed: `Dockerfile` (combined build) and
`render.yaml` (the blueprint).

---

## 1 · MongoDB Atlas (database)

1. Sign up at **cloud.mongodb.com** → create a **free M0** cluster (any region).
2. **Database Access** → *Add New Database User* → username + password (save them).
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** `0.0.0.0/0`
   (Render's outbound IPs aren't fixed on the free tier).
4. **Connect → Drivers** → copy the connection string and fill in your password + the
   `collabboard` database name:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/collabboard?retryWrites=true&w=majority
   ```

## 2 · Render (backend + Redis + frontend, one service)

1. Your code is already on GitHub (`bibhash7990/collabboard`).
2. **render.com → New → Blueprint** → connect the **collabboard** repo. Render reads
   `render.yaml` and proposes two resources: **collabboard** (web) and
   **collabboard-redis** (Key Value). Click **Apply**.
3. Render prompts for the values marked `sync: false`:
   - **MONGO_URI** → paste the Atlas string from step 1.4.
   - **CLIENT_URL** → leave blank for now (you'll set it in step 5).
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SHARE_LINK_SECRET` are auto-generated;
   `REDIS_URL` is auto-wired from the Key Value service.
4. The first deploy builds the Dockerfile (compiles web + server). Wait for **Live**.
5. Copy the service URL (e.g. `https://collabboard.onrender.com`). Open the service →
   **Environment** → set **CLIENT_URL** to that URL → **Save Changes** (it redeploys).
   This makes verification / invite / share links point to the right host.

## 3 · Verify

- Open the URL → you should see the **login** page.
- Register a new account (email verification link prints to the server logs — see the
  Render **Logs** tab), or seed demo data (step 4) and log in as `alice@demo.dev`.
- Open a board → the status badge should say **Connected**, notes and canvas sync live.

## 4 · (Optional) Seed demo data into Atlas

From your machine, pointed at the Atlas database:

```bash
MONGO_URI="<your atlas uri>" npm run seed -w @collabboard/server
```

Creates `alice@demo.dev` / `bob@demo.dev` / `carol@demo.dev` (password `Password123!`).

## Notes & gotchas

- **Free web services sleep** after ~15 min idle; the first request afterward takes
  ~30–50 s to wake. Upgrade the plan (or use a pinger) to keep it warm.
- **Secrets** exist only in Render (generated) — never commit real secrets; the repo
  only ships `.env.example`.
- **Custom domain**: add it under the service's *Settings → Custom Domains*, then
  update `CLIENT_URL` to match.
- **Email**: with no SMTP configured, verification/invite links are logged (Render
  **Logs**). To send real email, set `SMTP_HOST/PORT/USER/PASS` env vars.
- **Scaling**: bump the web service to 2+ instances — the Redis adapter + CRDT pub/sub
  already keep real-time state consistent across them.
