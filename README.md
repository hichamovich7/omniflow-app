# OmniFlow

AI-powered Pinterest content generation platform. Generate optimized titles, descriptions, keywords, board suggestions, and image prompts — then export as a Pinterest-compatible CSV for bulk upload.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + Shadcn UI
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Hosting:** Vercel

## Requirements

- Node.js 18+
- npm
- Supabase account with a project created

## Installation

```bash
git clone <repository-url>
cd omniflow-app
npm install
```

## Environment Variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | App URL (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Documentation

See the [docs/](docs/) directory:

- [PROJECT.md](docs/PROJECT.md) — Product vision and MVP scope
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Technical architecture
- [DATABASE.md](docs/DATABASE.md) — Database schema
- [API.md](docs/API.md) — API endpoints
- [UI_UX.md](docs/UI_UX.md) — UI/UX specification
- [RULES.md](docs/RULES.md) — Development rules
- [TASKS.md](docs/TASKS.md) — Task tracker
