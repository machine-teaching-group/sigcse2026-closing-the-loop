# backend_problem_handler: user_customizable_configs

This folder lets you add and maintain programming problems without changing core code. The Problem Handler backend reads these configs at runtime to list problems and execute student code against hidden tests.

## Layout

```
user_customizable_configs/
└── programming_tasks/
    ├── task_metadata.yaml           # Canonical index of all problems
    ├── task_descriptions/           # Human-readable text (.txt)
    ├── template_code/               # Starter code files
    ├── test_templates/              # Test templates
    ├── test_cases/                  # Test cases for correctness checking
    ├── execution_boxes/             # Execution context
    └── task_loader.py               # Loader (do not modify unless extending functionality)
```

## Task metadata schema

The file `programming_tasks/task_metadata.yaml` defines all problems under the root key `tasks`. Each task is a mapping with the following required fields:

- problem_id (YAML key) – Unique identifier (string)
- task_description_file – Relative file path under `task_descriptions/`
- template_code_file – Relative file path under `template_code/`.
- test_template_file – Relative file path under `test_templates/`
- test_case_files – Glob pattern resolved under `test_cases/` (e.g., `factorial/*.py` or `sum_two_numbers.py`)
- execution_dir – Directory name under `execution_boxes/`
- timeout – Positive integer (seconds)

Example entry:

```yaml
# programming_tasks/task_metadata.yaml

tasks:
  sum_two_numbers:
    task_description_file: sum_two_numbers.txt
    template_code_file: sum_two_numbers.py
    test_template_file: test_template_1.py
    test_case_files: sum_two_numbers.py
    execution_dir: sum_two_numbers
    timeout: 1
  
  factorial:
    task_description_file: factorial.txt
    template_code_file: factorial.py
    test_template_file: test_template_1.py
    test_case_files: factorial/factorial*.py
    execution_dir: factorial
    timeout: 1
```

Notes
- Paths are relative to their respective folders shown in the layout above.
- `test_case_files` is a single glob string; it can point to one file or a pattern that expands to multiple files. Files are loaded in natural (human) order.
- `execution_dir` must exist under `execution_boxes/`.This directory is copied as-is into the execution (soft-)sandbox for the problem. It can contain any required input files or resources needed by the test template.
- `timeout` is enforced per execution.

## How files are resolved

The loader (`task_loader.py`) derives absolute paths from the configured names:
- Description → `task_descriptions/<task_description_file>`
- Template code → `template_code/<template_code_file>`
- Test template → `test_templates/<test_template_file>`
- Test cases → glob under `test_cases/<test_case_files>`
- Execution dir → `execution_boxes/<execution_dir>`

If `strict_files=True`, it validates that all referenced paths exist.

## Adding a new problem (checklist)

1. Create the human-readable description in `task_descriptions/` (e.g., `my_task.md`).
2. Add starter code to `template_code/` (e.g., `my_task.py`).
3. Provide a test template in `test_templates/` (you can reuse an existing one; see examples).
4. Create your tests in `test_cases/` (either a single file or a folder with multiple files) and decide on a glob pattern. See the given examples for reference.
5. Add an execution directory under `execution_boxes/` for any required input data/resources.
6. Register the task in `task_metadata.yaml` under `tasks:` with the required fields.
7. Validate with the loader (see below).


## Conventions & tips

- Use clear, stable `problem_id`s; they are used by other services to reference tasks.
- Keep descriptions concise and pair them with the starter code.
- Keep test case file names naturally sortable. The loader uses natural sort.
- Timeouts should reflect the worst-case expected solution time under your test inputs.
- Avoid leaking solution code into the test template or description.

## Where this is used

The Problem Handler reads this configuration to:
- List available problems to the Orchestration backend
- Prepare execution sandboxes (from `execution_boxes/`)
- Run the test harness (from `test_templates/`) against student code using the selected test cases

This directory is the single source of truth for problem content. Keep it under version control for review and reproducibility.
