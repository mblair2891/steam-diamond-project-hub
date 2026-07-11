# Steam × Diamond Project Hub

**Next.js 14+ App Router** project management hub for **Steam Distillery × Diamond House BBQ**.

| Layer | Stack |
|--------|--------|
| Framework | Next.js 14 + TypeScript (App Router) |
| Styling | Tailwind CSS — dark UI, warm amber accents |
| Auth | Clerk — phone number + SMS OTP |
| Data | Browser `localStorage` for project content |

## Quick start

```bash
cd steam-diamond-project-hub
cp .env.example .env.local
# Add Clerk keys to .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

### 3. Environment variables

`.env.local` (and Vercel → Environment Variables):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes |
| `CLERK_SECRET_KEY` | Yes (server / middleware) |

Also accepts legacy `VITE_CLERK_PUBLISHABLE_KEY` as a fallback for the publishable key.

### 4. Domains

Allow `http://localhost:3000` and your production Vercel URL in Clerk.

### 5. Roles

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

## Deploy on Vercel

1. Push repo to GitHub  
2. Import on [vercel.com](https://vercel.com) as **Next.js**  
3. Add both Clerk env vars for **Production**  
4. Deploy  

---

## Features

- Dashboard — days to keys/opening, open tasks, pending approvals, media assets  
- Key Dates — editable (defaults Keys Aug 1 2026, Opening Sept 2026); Gantt offsets from Keys  
- Gantt — horizontal timeline  
- Timeline — combined milestones  
- Project Tasks — CRUD, priority, due dates, search  
- Media Blitz Calendar — month view + CSV export  
- Media Library — drag & drop previews  
- Approvals — decision log  
- Filming — shoot days + shot list  
- Profile — Clerk `UserProfile` (info + security/password if enabled)  
- Export — full project JSON + calendar CSV  

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
middleware.ts                # auth.protect()
components/ · hooks/ · lib/
```

## Reset project data

```js
localStorage.removeItem('sdh_project_v2');
location.reload();
```
