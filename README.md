# Steam × Diamond Project Hub

**Next.js 14+ App Router** project management hub for **Steam Distillery × Diamond House BBQ**.

| Layer | Stack |
|--------|--------|
| Framework | Next.js 14 + TypeScript (App Router) |
| Styling | Tailwind CSS — dark UI, warm amber accents |
| Auth | Clerk — phone number + SMS OTP |
| Project data | Browser `localStorage` for tasks, dates, metadata |
| Media files | **Vercel Blob** (videos & images) |
| Notifications | **Twilio SMS** to assigned reviewers |

## Quick start

```bash
cd steam-diamond-project-hub
cp .env.example .env.local
# Add Clerk (+ optional Blob / Twilio) keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

`.env.local` (and Vercel → **Environment Variables**):

```env
# Clerk (required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Vercel Blob (required for media uploads)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Twilio SMS (optional — notifications no-op if missing)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes |
| `CLERK_SECRET_KEY` | Yes |
| `BLOB_READ_WRITE_TOKEN` | For Media Library / Media Blitz uploads |
| `TWILIO_*` | For SMS when tasks / media / approvals need attention |

Also accepts legacy `VITE_CLERK_PUBLISHABLE_KEY` as a fallback for the publishable key.

---

## Clerk setup

### 1. Create an app

1. [dashboard.clerk.com](https://dashboard.clerk.com) → create application  
2. **API Keys** → copy **Publishable key** and **Secret key**

### 2. Phone login

**User & Authentication** → Email, Phone, Username:

1. Enable **Phone number** (SMS verification)  
2. Disable Email / Password if you want phone-only  
3. Optional: turn off public sign-up in Clerk so only invited/dashboard users exist  
4. The app hides “Create an account” on Sign In; `/sign-up` redirects to `/sign-in`  
   Users are created by admins (Clerk Dashboard or in-app **Users** page).  

### 3. Domains

Allow `http://localhost:3000` and your production Vercel URL in Clerk.

### 4. Roles

**Users → user → Metadata → Public:**

```json
{ "role": "admin" }
```

| `role` | Access |
|--------|--------|
| `admin` | Full project edit **+ create/manage users** (**/users** page) |
| `editor` | Full project edit (tasks, dates, calendar…) — **no** user management |
| `view-only` | Read only (default if missing). Legacy `viewer` maps to view-only |

Admins invite users in-app at **/users** (phone creates a Clerk user for SMS login; optional email invitation).

Writes are blocked for view-only in the UI and in `ProjectProvider.setData`. User APIs require admin.

---

## Vercel Blob (media storage)

1. Vercel Dashboard → **Storage** → create a **Blob** store  
2. Copy `BLOB_READ_WRITE_TOKEN` into `.env.local` and Vercel project env  
3. Uploads go **browser → `POST /api/media/upload` → server `put()` from `@vercel/blob`**  
4. Success is shown only after the server returns a confirmed public URL  
5. Metadata (title, description, status, schedule, assignee) stays in project data; **file bytes live in Blob**  

### Upload flow

| Phase | Meaning |
|-------|---------|
| Uploading… | File bytes sent to our API (XHR progress 0–90%) |
| Saving to cloud… | Server writing to Vercel Blob (`put`) |
| Retrying… | Transient network/5xx — automatic retry (up to 3 attempts) |
| Uploaded successfully | API returned `url`; library metadata saved |

Max file size: **100MB** (app check). On Vercel Hobby, request body limits may be lower —
if large videos fail, check platform limits or upgrade the deployment plan.

**Leaving the page**

- **In-app navigation** (Dashboard, Gantt, etc.) is fine — the global upload panel + sticky banner stay mounted in the app layout.
- **Closing / refreshing the tab** shows a browser warning while uploads are active (files live in memory until done).
- Failed jobs show a **Retry** button while the file is still held in the session.

Project data is written to `localStorage` immediately when a library asset is saved (after Blob URL is confirmed).

---

## Twilio SMS notifications

When configured, the hub texts assigned users when:

| Trigger | When |
|---------|------|
| **Task** | User is newly assigned an open task |
| **Media Blitz / Library** | Item set to `in-review` or reassigned |
| **Approval** | Item is `pending` / `review` and assigned |

Phone numbers come from each Clerk user’s primary phone. Users without a phone are skipped (logged, non-blocking).

API: `POST /api/notify/sms` with `{ userIds, message, type, title }`.

---

## Deploy on Vercel

1. Push repo to GitHub  
2. Import on [vercel.com](https://vercel.com) as **Next.js**  
3. Add Clerk + Blob (+ Twilio) env vars for **Production**  
4. Link the Blob store to the project  
5. Deploy  

---

## Features

- Dashboard — days to keys/opening, open tasks, pending approvals, media assets  
- Key Dates — editable (defaults Keys Aug 1 2026, Opening Sept 2026); Gantt offsets from Keys  
- Gantt — horizontal timeline + task bars (dependency-adjusted)  
- Timeline — combined milestones  
- Project Tasks — CRUD, priority, due dates, **assignment**, **dependencies**, **SMS on assign**  
- Personal dashboard — **My assigned tasks** with days until due / overdue highlights  
- **Media Blitz** — month calendar, post/video **drafts**, status workflow, file upload, CSV export  
- **Media Library** — drag & drop to **Vercel Blob**, progress, previews, metadata & review  
- Approvals — decision log with assignee + SMS on review  
- Filming — shoot days + shot list  
- Profile — Clerk `UserProfile`  
- Export — full project JSON + calendar CSV  

### Media draft statuses

`draft` → `scheduled` → `in-review` → `approved` → `published`

---

## Scripts

```bash
npm run dev      # localhost:3000
npm run build
npm start
```

## Structure

```
app/
  layout.tsx                 # ClerkProvider
  sign-in/ · sign-up/        # Phone auth
  (app)/                     # Protected shell + pages
  api/
    blob/upload/             # Vercel Blob client upload tokens
    notify/sms/              # Twilio SMS
    users/                   # Clerk user management
middleware.ts                # auth.protect()
components/ · hooks/ · lib/
```

## Reset project data

```js
localStorage.removeItem('sdh_project_v2');
location.reload();
```

Note: clearing localStorage does **not** delete files already stored in Vercel Blob.
