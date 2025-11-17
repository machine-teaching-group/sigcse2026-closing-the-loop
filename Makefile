# Convenience targets for local development

.PHONY: help setup-backends run-orch run-hint run-hint-worker run-problem run-problem-worker run-workers run-frontends docker-up lint format

help:
	@echo "Available targets:"
	@echo "  setup-backends   Install Python deps and run migrations for all backends"
	@echo "  run-orch         Run orchestration backend on :8000"
	@echo "  run-hint         Run AI hint backend on :8001"
	@echo "  run-hint-worker  Run AI hint worker"
	@echo "  run-problem      Run problem handler on :8002"
	@echo "  run-problem-worker Run problem handler worker"
	@echo "  run-workers     Run both workers (hint + problem)"
	@echo "  run-frontends    Run both frontends (student :5173, instructor :5174)"
	@echo "  docker-up        docker compose up --build"
	@echo "  lint             Lint frontends"
	@echo "  format           Prettier format frontends"

setup-backends:
	cd backend_orchestration && pip install -r requirements.txt && python manage.py migrate
	cd backend_hint && pip install -r requirements.txt && python manage.py migrate
	cd backend_problem_handler && pip install -r requirements.txt && python manage.py migrate

run-orch:
	cd backend_orchestration && python manage.py runserver 0.0.0.0:8000

run-hint:
	cd backend_hint && python manage.py runserver 0.0.0.0:8001

run-hint-worker:
	cd backend_hint && python manage.py run_worker

run-problem:
	cd backend_problem_handler && python manage.py runserver 0.0.0.0:8002

run-problem-worker:
	cd backend_problem_handler && python manage.py run_worker

run-workers:
	cd backend_hint && python manage.py run_worker &
	cd backend_problem_handler && python manage.py run_worker

run-frontends:
	cd frontend_student && npm run dev &
	cd frontend_instructor && npm run dev

docker-up:
	docker compose up --build

lint:
	cd frontend_student && npm run lint || true
	cd frontend_instructor && npm run lint || true

format:
	cd frontend_student && npm run format || true
	cd frontend_instructor && npm run format || true
