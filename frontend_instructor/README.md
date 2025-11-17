# frontend_instructor

Single-page React + TypeScript + Vite app for instructors to fetch and complete feedback requests.

## Features
- Minimal login gate: Enter Instructor ID, then fetch a pending/in-progress request.
- Display details: formatted Problem ID, Hint type, Student program (Monaco), Reflection Q/A, AI hint, Student notes.
- If backend returns `student_notebook` (Jupyter notebook JSON), the notebook is displayed instead of problem description and student program. Run/reset/output controls are hidden in this mode. Rendering uses `react-ipynb-renderer` and is lazy-loaded.
- Write feedback; submit to orchestration backend.
- On success, freeze UI with translucent white pad and show a purple "Continue to the next request" button.
- On failure, show error without clearing typed feedback.

## Project layout
- `index.html` – Vite entry
- `src/main.tsx` – app bootstrap
- `src/pages/App.tsx` – main UI and logic
- `src/lib/api.ts` – calls `/instructor_feedback/fetch_request/` and `/instructor_feedback/save_feedback/`
- `src/index.css` – Tailwind entry (base/components/utilities)
- `tailwind.config.js`, `postcss.config.js` – manual Tailwind setup

## Configure
The app needs the orchestration backend base URL.

- Preferred: set `VITE_ORCH_BASE_URL` in an `.env.local` file at this folder root.
  Example: `VITE_ORCH_BASE_URL=http://localhost:8000`
  See `.env.example` in this folder as a starting point.

## Run
```sh
cd frontend_instructor
npm install
npm run dev
```
Then open the printed local URL (e.g., http://localhost:5174).

Ensure the orchestration backend is running and allows CORS from this dev origin.

Tip: Set `DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5174` in orchestration when developing this app.

## Notes
- Problem ID is rendered in Title Case with underscores replaced by spaces.
- Monaco editor is read-only and configured with Python language and word wrap.
- Notebook rendering uses `react-ipynb-renderer` and is lazy-loaded to keep the initial bundle small. The app accepts either a JSON object or a JSON string in `student_notebook`.
- The freeze overlay ensures no interaction after a successful submit, except the purple Continue button which stays on top.
