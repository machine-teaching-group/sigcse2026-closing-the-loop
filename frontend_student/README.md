# Student Programming Frontend

A single-page React app where students solve programming problems, run code, request AI hints, and receive instructor feedback. It talks only to the orchestration backend.

## Features

- Problem selection with readable titles (underscores → spaces, title-cased)
- Python editor (Monaco) with local code persistence per student/problem
- Execute program against hidden test cases and see correctness, error output, and timing
- AI Hints workflow (Planning, Debugging, Optimization)
   - Reflection prompt prior to generation
   - Polling with in-place spinner: “Requesting for {Hint Type}”
   - Fixed hint overlay (30% viewport height), vertically centered content
   - Rate with 👍 Helpful / 👎 Unhelpful; for AI hints, 👎 can be escalated to an instructor; for instructor feedback, rating simply closes the overlay (no escalation)
   - Optional student email on escalation with live validation
- Quotas
   - Overall and per-hint-type counts displayed (e.g., “(N left)”) if finite
   - Optimistic updates: decrement on request; refund on failed generation
- Session continuity
   - Surfaces the unrated item across AI hints and instructor feedback; prompts for rating before moving on
   - Full hint and instructor feedback history view (shows 👍/👎 once rated for both AI hints and instructor feedback)
- Helpful UX details
   - Hint-type “?” help modal with concise descriptions
   - Hint buttons color-coded and equal width
   - Disabled states with tooltips explaining why (e.g., missing Student ID)
   - Startup entry screen requires entering Student ID before the main app is shown
   - Request hints even with empty editor code (if desired)
   - Editor, Run Code, “?” button, and hint buttons are disabled until Student ID is set

## Tech Stack

- React 18, TypeScript, Vite
- Tailwind CSS
- Monaco Editor (@monaco-editor/react)
- Axios (typed API client with logging and global error handling)

## Getting Started

Prerequisites
- Node.js 18+ and npm
- Orchestration backend running (default http://localhost:8000)

Install
```
npm install
```

Run (dev)
```
npm run dev
```

Build (prod)
```
npm run build
```

Preview (serve build)
```
npm run preview
```

## Configuration

Create `.env` (or `.env.local`) to set the orchestration backend base URL (falls back to http://localhost:8000):
```
VITE_ORCH_BASE_URL=http://localhost:8000
```
Ensure the orchestration backend allows your dev origin via `DJANGO_CORS_ALLOWED_ORIGINS`.

See `.env.example` for a ready-to-copy template.

## How it Works

Data flow (frontend → orchestration backend)
- Problems: list and single problem detail (with description)
- Execute program: sends problem_id, student_program, and student_id
- AI hints: add request → reflection → poll status → save rating
- Instructor feedback: add request
- Both AI hints and Instructor feedback: retrieve history
- Quotas: fetch current remaining counts
- Latest unrated hint: fetched for AI hints; the UI also merges instructor feedback and selects the earliest unrated overall

UI logic highlights
- Entry gate: on first load you must enter your Student ID before you can access the editor or request hints.
- Hint overlay reserves space (30vh) so the page doesn’t jump and keeps rating controls right-aligned. Instructor feedback overlay does not offer escalation.
- The help modal shows all hint types with short explanations.
- Titles and history entries surface hint type and rating with emoji.

## Key Files

- `src/pages/App.tsx` — container for layout, state, and workflows
- `src/components/ProblemSelector.tsx` — dropdown with formatted titles
- `src/components/HintButtons.tsx` — colored hint options with per-type quotas and disabled reasons
- `src/components/HintOverlay.tsx` — 30vh overlay with rating and escalation
- `src/components/HistoryList.tsx` — combined AI hint/instructor feedback history
- `src/components/StudentIdInput.tsx` — legacy inline control; the app now uses an entry screen instead.
- `src/hooks/usePolling.ts` — small polling helper
- `src/lib/api.ts` — typed API wrappers with axios interceptors
- `src/styles/tailwind.css` — Tailwind entrypoint

## Linting

```
npm run lint
```

## Troubleshooting

- 429 errors when requesting hints: You’ve reached your hint quota. The UI shows a small pop-up and per-type counts.
- Buttons disabled: Ensure Student ID and a problem are selected. Hover for tooltip reasons.
- CORS/CSRF issues: Confirm `VITE_ORCH_BASE_URL` matches the orchestration backend origin and that the backend is configured for local origins.
- No problems listed: Verify the backend problem endpoints are reachable and return JSON.

## Notes

- Empty code is allowed for hint requests (by design).
- Quota counts are updated optimistically and may resync on subsequent requests.

