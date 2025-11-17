# Problem Handler Backend

Django service that provides programming problem metadata and executes submitted programs against hidden tests. This service is internal-only: it is called by the Orchestration backend (and sometimes by the AI Hint backend indirectly via Orchestration).

## Responsibilities
- Serve programming problem list and single-problem details (task description)
- Execute student code in a pseudo-sandboxed environment and return pass/fail, outputs, and timing
- Store no long-term student-facing state (stateless aside from logs)

## API
Base path: `/`

- `GET /query/programming_problems/`
  - With no params: returns all problems (id, title)
  - With `?problem_id=...`: returns one problem with details (such as `task_description`)
- `POST /execution/execute_program/`
  - Body: `{ problem_id: string, student_program: string, student_id?: string }`
  - Returns an `execution_id` and immediate status; Orchestration will poll for result
- `GET /execution/get_execution_result/?execution_id=...`
  - Returns the result object: success flag, error message (if any), stdout, stderr, and timing

See `execution/views.py` and `query/views.py` for exact payloads.

## Configuration

- CORS for local development (usually allow orchestration origin):
  - `DJANGO_CORS_ALLOWED_ORIGINS` (e.g. `http://localhost:8000`)
- Hosts/Debug:
  - `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1`
  - `DJANGO_DEBUG=True`
- Database: defaults to SQLite at `db.sqlite3` (no envs required)
- Problem metadata directories (see `backend_problem_handler/settings.py`):
  - `user_customizable_configs/programming_tasks/task_metadata.yaml`
  - `.../task_descriptions/`
  - `.../template_code/`
  - `.../test_templates/`
  - `.../test_cases/`
  - `.../execution_boxes/`

## User-customizable configs

Folder: `backend_problem_handler/user_customizable_configs/programming_tasks/`

- Add or modify programming problems by updating `task_metadata.yaml` and placing new files/folders in the corresponding subfolders:
  - `task_descriptions/`: problem statements
  - `template_code/`: starter code for the editor
  - `test_templates/` and `test_cases/`: template for running tests and hidden cases used during execution
  - `execution_boxes/`: per-problem execution context

`task_metadata.yaml` schema (per task under the `tasks:` key):

- Required fields:
  - `task_description_file`: Filename under `task_descriptions/`
  - `template_code_file`: Filename under `template_code/`
  - `test_template_file`: Filename under `test_templates/`
  - `test_case_files`: Glob under `test_cases/`
  - `execution_dir`: Folder name under `execution_boxes/`
  - `timeout`: Positive integer seconds
- Optional fields:
  - `name`: Human-friendly display name (can contain spaces). If omitted, the problem_id will be used as a fallback in UIs.

After editing, restart the Problem Handler service. Keep any credentials or sensitive values out of these files; use environment variables instead.

## Run Locally

Install deps:
```
pip install -r requirements.txt
```

Migrate DB (mostly for admin/auth scaffolding):
```
python manage.py migrate
```

Start server (default port 8002):
```
python manage.py runserver 0.0.0.0:8002
```

## Integration Notes
- Orchestration points to this service via envs:
  - `BACKEND_PROBLEM_HANDLER_GET_PROBLEMS_URL=http://localhost:8002/query/programming_problems/`
  - `BACKEND_PROBLEM_HANDLER_EXECUTE_CODE_URL=http://localhost:8002/execution/execute_program/`
  - `BACKEND_PROBLEM_HANDLER_GET_EXECUTION_RESULT_URL=http://localhost:8002/execution/get_execution_result/`
- The AI Hint backend may indirectly need problem descriptions; workers use `BACKEND_ORCHESTRATION_GET_PROBLEMS_URL=http://localhost:8000/problems/programming_problems/` to go through Orchestration.

## Logs
- Timestamped logs are written to `backend_problem_handler/logs/` as configured in settings.

## Environment
- Copy `.env.example` to `.env.local` (preferred) or `.env` and adjust values.

