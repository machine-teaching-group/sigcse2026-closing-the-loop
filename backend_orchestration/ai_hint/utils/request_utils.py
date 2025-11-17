import json


def extract_request(request):
    payload = json.loads(request.body)
    student_id = payload["student_id"]
    problem_id = payload["problem_id"]
    student_program =  payload["student_program"]
    student_notebook = payload.get("student_notebook", None)
    hint_type = payload["hint_type"]
    assert hint_type in ["plan", "debug", "optimize"], f"Invalid hint type `{hint_type}`"
    other_data = {
        key: value for key, value in request.POST.items() if key not in ["student_id", "problem_id", "student_program", 'student_notebook', "hint_type"]
    }

    return (
        student_id,
        problem_id,
        student_program,
        student_notebook,
        hint_type,
        other_data,
    )
