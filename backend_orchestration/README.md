# Orchestration Backend

Django service that brokers all student/instructor traffic between the frontends and the internal backends. It:
- Proxies problem catalog and program execution to the Problem Handler backend
- Orchestrates the AI hint lifecycle with the AI Hint backend
- Exposes instructor feedback endpoints
- Persists orchestration-facing data (hints, feedback, program executions)

## Repository layout (this service)

- `backend_orchestration/` — Django project (settings/urls/wsgi/asgi)
- `problems/` — problem listing proxy + program execution proxy and logging
- `ai_hint/` — AI hint workflow (request → reflection → polling → rating, quotas)
- `instructor_feedback/` — escalation and instructor responses
- `logs/` — per-run log files

## Data flow

Student Frontend → Orchestration
- List problems; fetch a single problem with description
- Execute program against hidden tests
- AI hints: add request → add reflection → poll status → save rating
- Instructor feedback: add request, list feedback
- Quotas: fetch remaining (overall and per hint type)
- On load, the frontend queries all hints and feedback and selects the earliest unrated item (no dedicated endpoint required)

Instructor Frontend → Orchestration
- Fetch pending feedback request
- Submit feedback response

Orchestration → Backends
- Problem Handler: problems metadata + program execution
- AI Hint: hint generation and status

## API overview (high level)

Problems
- `GET /problems/programming_problems/` — list; supports `problem_id`
- `POST /problems/execute_program/` — execute (see above)

AI Hint
- `POST /ai_hint/add_request/` — body: `student_id`, `problem_id`, `hint_type` (plan|debug|optimize), `student_program`
- `POST /ai_hint/add_reflection/` — body: `request_id`, `reflection_question`, `reflection_answer`
- `GET /ai_hint/query_hint/?request_id=...`
- `GET /ai_hint/query_all_hint/?student_id=...&problem_id=...`
- `POST /ai_hint/save_hint_rating/` — body: `request_id`, `is_hint_helpful` (bool)
- `GET /ai_hint/quota_left/?student_id=...&problem_id=...`


Instructor Feedback
- `POST /instructor_feedback/add_request/` — body: `request_id` (+ optional `student_email`, `student_notes`)
- `GET /instructor_feedback/query_all_feedback/?student_id=...&problem_id=...`

Notes: See each app’s `urls.py`/`views.py` for exact payloads and shapes.

## Configuration

Environment variables (examples)
- Problem Handler service
  - `BACKEND_PROBLEM_HANDLER_GET_PROBLEMS_URL` (e.g. `http://backend-problem-handler:8002/query/programming_problems/`)
  - `BACKEND_PROBLEM_HANDLER_EXECUTE_CODE_URL` (e.g. `http://backend-problem-handler:8002/execution/execute_program/`)
  - `BACKEND_PROBLEM_HANDLER_GET_EXECUTION_RESULT_URL` (e.g. `http://backend-problem-handler:8002/execution/get_execution_result/`)
- AI Hint backend settings (see `ai_hint/views.py`)
  - `BACKEND_HINT_ADD_REQUEST_URL` (e.g. `http://backend-hint:8001/ai_hint/add_request/`)
  - `BACKEND_HINT_ADD_REFLECTION_URL` (e.g. `http://backend-hint:8001/ai_hint/add_reflection/`)
- CORS/CSRF trusted origins to match frontends
  - `DJANGO_CORS_ALLOWED_ORIGINS` (e.g. `http://localhost:5173,http://localhost:5174`)

Database (PostgreSQL)
- `DB_NAME`, `DB_USER` (or `DB_USERNAME`), `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

Email notifications (used by instructor feedback)
- `NOTIFICATION_SENDER_EMAIL` and `NOTIFICATION_SENDER_PASSWORD` (Gmail works with an App Password)

Local env file
- Copy `.env.example` to `.env.local` (preferred) or `.env` in `backend_orchestration/` and adjust values.

## User-customizable configs

Folder: `backend_orchestration/user_customizable_configs/`

- Quotas: YAML definitions that control overall and per-hint-type counts (see `user_customizable_configs/quota/`).
- Instructor feedback: config and templates for request-assignment/notifications (see `user_customizable_configs/instructor_feedback/`).

Edit these files to adapt limits and messaging for your deployment. Changes typically apply on service restart.

## Running locally

Install Python dependencies:
```
pip install -r requirements.txt
```

Migrate database:
```
python manage.py migrate
```

Run server:
```
python manage.py runserver 0.0.0.0:8000
```

Docker (from repo root):
```
docker compose up --build
```
Note: Ensure the Problem Handler service is running (not included in compose by default) and reachable at the URLs above.

## Logging

- Python logging writes to `backend_orchestration/logs/`
- Errors include upstream failures (network/non-JSON) and are also persisted on `ProgramExecution` when applicable

## Concurrency

- Critical updates are wrapped with `transaction.atomic()`; instructor assignment uses `select_for_update(skip_locked=True)` in its utilities.

## Development tips

- Browse `ai_hint/models.py` and `instructor_feedback/models.py` for relationships
- End-to-end examples are available in `.tests/test.py` at the repo root
- The student frontend’s `src/lib/api.ts` documents the expected request/response shapes used in practice

## Troubleshooting

- 502/non-JSON on execution: verify Problem Handler URL and availability; the corresponding `ProgramExecution` will have `is_success=False` and an `error_message`
- Quota issues: check `user_customizable_configs/` under the AI hint app
- CORS/CSRF rejections: ensure trusted origins include the dev server (e.g., `http://localhost:5173`)
