# NLUJA, Assam — Academic & Examination Management System (demo)

Demonstration build for RFP No. NLUJAA/ACAD-ADMIN/F/MISC/2024-25/510. It runs one complete examination cycle — attendance eligibility → registration → seating & admit cards → anonymous evaluation → result processing → signed grade sheets — on NLUJA's published regulations, with synthetic data.

See **[docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)** for the presentation walkthrough.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · JSON-Logic rule engine · pdf-lib / qrcode / bwip-js for documents · exceljs · recharts.

## Run locally

Requirements: Node.js 20.9+, Docker Desktop.

```powershell
docker run -d --name nluja-pg -e POSTGRES_USER=nluja -e POSTGRES_PASSWORD=nluja -e POSTGRES_DB=nluja_ems -p 5433:5432 postgres:16-alpine
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000. All demo passwords are `Demo@123`; roles marked with a key ask for the OTP `246810`.

`.env` (local):

```
DATABASE_URL="postgresql://nluja:nluja@localhost:5433/nluja_ems"
DIRECT_URL="postgresql://nluja:nluja@localhost:5433/nluja_ems"
SESSION_SECRET="<random 32+ chars>"
APP_URL="http://localhost:3000"
```

The Controller of Examinations / Admin dashboard has a **Presenter** control that rebuilds the data at any stage of the cycle.

## Deploy (Vercel + Neon)

1. Push this folder to a Git repository and import it in Vercel.
2. In Vercel → Storage, add **Neon Postgres** (choose the Mumbai / `ap-south-1` region; set the Vercel function region to `bom1`).
3. Environment variables in Vercel:
   - `DATABASE_URL` — Neon **pooled** connection string with `?sslmode=require&pgbouncer=true&connect_timeout=15`
   - `DIRECT_URL` — Neon **direct** (unpooled) connection string
   - `SESSION_SECRET` and `DOC_SIGNING_SECRET` — long random strings
   - `APP_URL` — the production URL (used inside QR codes)
4. From your machine, with the Neon `DIRECT_URL` as both URLs in a temporary `.env`: `npm run db:push` then `npm run db:seed`.
5. Deploy. The build runs `prisma generate && next build`.

## Project layout

```
prisma/schema.prisma        data model (students → enrolments → exams → scripts → results → documents, audit)
src/lib/rules/              rule engine (attendance, grading, grace) and versioned rule store
src/lib/exams/              eligibility, registration, seating, admit cards, evaluation
src/lib/results/            result engine and maker–checker workflow
src/lib/pdf/                admit card and grade sheet PDFs
src/lib/demo/               synthetic NLUJA data, scenarios and presenter stages
src/app/(app)/              authenticated pages (per-role navigation in src/lib/roles.ts)
src/app/verify/[code]/      public document verification
```
