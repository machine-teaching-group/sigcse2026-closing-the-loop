-- Create separate databases for each Django backend on first init
-- Note: This script runs only when the Postgres data directory is empty.
CREATE DATABASE backend_orchestration;
CREATE DATABASE backend_hint;
CREATE DATABASE backend_problem_handler;
