# Student frontend JupyterLab Extension

A JupyterLab extension that serves as an alternative frontend.


## Illustrative screenshots

0. Student programming environment.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_environment.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_environment.png" width="800" ></a>

1. Consent the use of the system.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_consent.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_consent.png" width="800" ></a>

2. (Optional) View description of the three hint types.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_hint_description.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_hint_description.png" width="800" ></a>

3. Click one of the type buttons to request hint. Reflect on the problem.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_reflection.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_reflection.png" width="800" ></a>

4. Retrieve AI-generated hints based on the buggy code and reflection

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_hint.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_hint.png" width="800" ></a>

5. Optional to escalate the request to instructors if the hint is rated as unhelpful.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_escalation.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_escalation.png" width="800" ></a>
6. Retrieve instructor feedback if escalated.

<a href="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_feedback.png"><img src="https://raw.githubusercontent.com/machine-teaching-group/sigcse2026-closing-the-loop/master/frontend_student_jx/screenshots/student_frontend_jx_feedback.png" width="800" ></a>


## Requirements

- JupyterLab >= 4.0.0


## Development 

Note: You will need NodeJS to build the extension package.


```bash
# Clone the repo to your local environment
# Change directory to the frontend_student_jx directory
# Install package in development mode
source .venv/bin/activate
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable hintbot
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.
```bash
# In one terminal:
jlpm run watch          # rebuilds on source changes
# In another terminal:
jupyter lab             # run Jupyterlab
```	

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

## Packaging and Publish to PyPI

This project is already configured for Python packaging with Hatch and the JupyterLab builder (prebuilt extension for JupyterLab 4). To rebuild and publish a release on PyPI:


1) Clean everything
`jlpm clean:all`

2) Rebuild the labextension (production)
`jlpm build:prod`


3) Build wheel
`hatch build`

4) Sanity check the build
- Test-install in a clean virtualenv: `pip install dist/*.whl`, start JupyterLab, and confirm the extension is active.

5) Upload to PyPI
- Create a PyPI account and an API token (Settings → API tokens).
- Install `twine`: `pip install twine`.
- Upload: `TWINE_USERNAME=__token__ TWINE_PASSWORD=<pypi-token> twine upload dist/*`.

6) Install as a user
- Users can then install with: `pip install jx-loop-hint`.
- Because this is a prebuilt extension, no `jupyter lab build` step is required for JupyterLab 4.

---

### Notes on Backend URL and Student ID configuration
The extension uses the environment variables `HOST_URL` and `VOC_USERID` to configure the orchestration backend URL and student identifier, respectively. If `HOST_URL` is not set, it defaults to localhost:8000. If `VOC_USERID` is not set, it falls back to a default, fixed identifier.
Tips: run JupyterLab from the terminal with the environment variables set, e.g.,

```bash
export HOST_URL="https://your-orchestration-backend-url.com" && export VOC_USERID="student-unique-id-123" && jupyter lab
```

### Notes on Student ID for budget tracking

The extension uses the environment variable `VOC_USERID` to identify the student when making requests to the backend for hint budget tracking. If this environment variable is not set, it falls back to a default, fixed identifier.


### Notes on the student program for a question is extracted from a notebook

The extension extracts a student's program for a particular question by scanning notebook cells starting from the question's markdown cell and concatenating subsequent code cells until it reaches a configured end-marker cell. This extracted program is sent along with other context (e.g., notebook JSON) to the backend when creating an AI hint request.

Key rules implemented by the extension (behavior mirrors `src/requestHint.ts`):

- Question start detection
	- If a `questions.json` configuration is present under `user_customizable_configs/notebook_questions/`, the extension treats any markdown cell whose `nbgrader.grade_id` equals a `question_start_grade_id` in that config as the start of a question.

- Program extraction (end marker)
	- The matching question entry in `questions.json` should provide a `question_end_grade_id`. The extractor will stop concatenating code cells when it encounters a cell whose `nbgrader.grade_id` equals that `question_end_grade_id`.

- What is concatenated
	- Only code cells are appended, in document order, starting from the cell immediately after the question-start markdown cell up to (but not including) the end-marker cell.
	- Cell boundaries are preserved by inserting a single newline between appended cells so the backend can reason about cell separation.

- Robust reading across JupyterLab versions
	- The extractor tries multiple ways to read a cell's text to be resilient across JupyterLab versions and widget/model shapes:
		1. `cell.value.text` (common for ICellModel)
		2. `cell.model.value.text` (widget wrappers)
		3. `sharedModel.getSource()` (some collaborative/shared models)
		4. `cell.input.model.value.text` (widget-level input model)


Example config entry (`user_customizable_configs/notebook_questions/questions.json`):

```json
[
	{
		"question_id": "q1",
		"question_start_grade_id": "cell-abc123",
		"question_end_grade_id": "cell-abc123_assert"
	}
]
```

This will cause the extractor to use `q1` as the `problem_id` sent to the backend and to stop assembling the program when a cell with grade id `cell-abc123_assert` is encountered.

