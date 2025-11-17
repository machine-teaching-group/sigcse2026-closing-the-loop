# AI Hint Backend

Django service responsible for generating AI hints and coordinating the background pipeline that evaluates/enhances student code to produce hints. This service receives requests only from the Orchestration backend.

## Responsibilities
- Receive incoming AI hint requests and reflections
- Enqueue background jobs to:
  - Run the student's buggy program and capture output/time
  - Generate/enhance programs and evaluate correctness
  - Produce a final hint (and error if any)
- Report results back to the Orchestration backend (which then exposes them to the student frontend)

## High-level Flow
1. Orchestration calls `POST /ai_hint/add_request/` with a `request_id` and data: `{ problem_id, student_program, hint_type }`.
2. The request is saved to the local DB (`ai_hint.models.Request`), and a `run_student_buggy_program` task is published.
3. A `query_for_enhanced_programs` task is also published to search reference solutions.
4. When the student's reflection is submitted via `POST /ai_hint/add_reflection/`, an `add_reflection` task is published.
5. Workers (in `ai_hint/workers/`) consume the tasks, interact with LLMs (see `utils/openai_utils.py`), execute code (see `utils/program_execution_utils.py`), and ultimately create `Hint` records.
6. The Orchestration backend queries for hint status and results, and surfaces them to the student frontend.

## API (internal, called by Orchestration)
- `POST /ai_hint/add_request/` — body:
  ```json
  {
    "request_id": 123,
    "data": {
      "problem_id": "sum_two_numbers",
      "student_program": "def solve(...): ...",
      "hint_type": "plan|debug|optimize"
    }
  }
  ```
  Response: 200 on success.

- `POST /ai_hint/add_reflection/` — body:
  ```json
  {
    "request_id": 123,
    "data": {
      "reflection_question": "...",
      "reflection_answer": "..."
    }
  }
  ```
  Response: 200 on success.

Note: This backend does not serve the student frontend directly.

## Key Models (`ai_hint/models.py`)
- `Request`: incoming request metadata and initial program
- `Reflection`: one-to-one with Request, stores student reflection
- `ProgramEnhancementPhase`: an LLM-run phase exploring program enhancements (used in the prompt for generating hints)
- `EnhancedProgram`: candidate program from a phase and its evaluation
- `HintGenerationPhase`: LLM interaction producing a hint candidate
- `Hint`: final hint payload and status

## Utilities
- `utils/db_utils.py`: DB helpers for writing/reading request and hint artifacts
- `utils/queue_utils.py`: publish tasks to the queue system
- `utils/openai_utils.py`: LLM utilities
- `utils/program_execution_utils.py`: code execution harness

## Configuration
Environment variables (typical):
- Task priorities
  - `RUN_STUDENT_PROGRAM_PRIORITY`
  - `QUERY_FOR_ENHANCED_PROGRAMS_PRIORITY`
  - `ADD_REFLECTION_PRIORITY`
- Orchestration service URL(s) used by workers
  - `BACKEND_ORCHESTRATION_GET_PROBLEMS_URL` (e.g. `http://localhost:8000/problems/programming_problems/`)
- LLM provider keys and model names (see `utils/openai_utils.py`)
- Queueing via RabbitMQ
  - `RABBITMQ_URL` (e.g. `amqp://admin:admin@localhost:5672/`) or `RABBITMQ_HOST`
  - `TASK_QUEUE` (e.g. `task_queue`)
  - `QUEUE_MAX_PRIORITY` (e.g. `5`)
- Database (PostgreSQL): `DB_NAME`, `DB_USER` (or `DB_USERNAME`), `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

## Running Locally
Install dependencies:
```
pip install -r requirements.txt
```

Migrate DB:
```
python manage.py migrate
```

Run server:
```
python manage.py runserver 0.0.0.0:8001
```

(If using Docker, see the repo root `compose.yaml` and run `docker compose up --build`.)

Configuration
- Copy `.env.example` to `.env.local` (preferred) or `.env` and customize for your environment.

## User-customizable configs

Folder: `backend_hint/user_customizable_configs/`

- `ai_config/ai_config.yaml`: model/prompt configuration and related knobs used by the hint generation pipeline.

Update these configs to tune hint quality or provider specifics (API keys remain in env vars). Restart the backend (and workers) to apply changes.

Run worker(s):
```
python manage.py run_worker
```
In Docker Compose, a separate `backend-hint-worker` service is configured and can be scaled via replicas.

## Logs
- Runtime logs are written under `backend_hint/logs/`

## Notes
- All communication starts from the Orchestration backend; this service does not call the student frontend.
- For end-to-end flows and payload shapes, see the Orchestration backend README and the student frontend `src/lib/api.ts`.
- If RabbitMQ is not reachable, task publishing will fail (see logs for connection errors). Ensure the broker is running and `RABBITMQ_URL` is set.
