from typing import Optional
from copy import deepcopy


prompt_template = [
    {
        "role": "system",
        "content": "You are a helpful teaching assistant. You are helping students learn to solve programming problems in a Python course. Below you are provided a student's current program for a Python programming problem.{mention_reflection_in_system} Your goal is to help the student by providing a pedagogical hint. Write a hint that can be directly presented to the student, and be socratic and friendly.",
    },
    {
        "role": "user",
        "content": """
{problem_description}
{template_code}
{program_code}
{reflection}
{output}
{reference_program}
{command_tail}
        """.strip()
    }
]

prompt_components = {
    "command_tail": {
        "plan": "(1) Detailed Explanation: Can you discuss a step by step plan to solve this problem while accounting for the student's progress based on the student's program?{mention_reflection_in_explanation}\n\n(2) Pedagogical Hint: Can you provide a hint about a plan to solve this problem while accounting for the student's progress based on the student's program? The hint should focus on helping the student with a plan, instead of helping in debugging. Do not give away the solution or write any code in the hint. Write a hint that can be directly presented to the student, and be socratic and friendly. Keep your hint concise.{mention_reflection_in_hint}\n\nOutput only the explanation for (1) and the hint for (2) in JSON format with the field names \"explanation\" and \"hint\", respectively.",
        "debug": "(1) Detailed Explanation: Can you explain the bug(s) in the student's program and the required fixes in a step by step manner?{mention_reflection_in_explanation}\n\n(2) Pedagogical Hint: Can you provide a hint about one bug in the student's program? Do not give away the solution or write any code in the hint. Write a hint that can be directly presented to the student, and be socratic and friendly. Keep your hint concise, ideally to a sentence or two at most. When there are multiple bugs, you should provide your hint based on an important bug or overarching issue.{mention_reflection_in_debugging_hint}\n\nOutput only the explanation for (1) and the hint for (2) in JSON format with the field names \"explanation\" and \"hint\", respectively.",
        "optimize": "(1) Detailed Explanation: Can you explain any issues in the student's program in terms of speed, readability, and memory usage along with possible ways to optimize in a step by step manner?{mention_reflection_in_explanation}\n\n(2) Pedagogical Hint: Can you provide a hint about optimizing the student's program in terms of speed, readability, and memory usage? The hint should focus on helping the student with optimizing the student's program, instead of helping in debugging. Do not give away the solution or write any code in the hint. Write a hint that can be directly presented to the student, and be socratic and friendly. Keep your hint concise.{mention_reflection_in_hint}\n\nOutput only the explanation for (1) and the hint for (2) in JSON format with the field names \"explanation\" and \"hint\", respectively.",
    },
    "mention_reflection": {
        "in_system": " Additionally, the student has shared their reflection about possible issues.",
        "in_explanation": " In your explanation, you should consider the student's reflection if you think it is relevant.",
        "in_hint": " In your hint, you should consider the student's reflection if you think it is relevant.",
        "in_debugging_hint": " In your hint, you should consider the student's reflection if you think it is relevant; in particular, when a student mentions a specific bug or issue, prioritize your hint based on that issue."
	},
    "reference_program": {
        "plan": "A solution program for reference:\n```\n{reference_program}\n```\n\n",
        "debug": "A solution program obtained by fixing the student's program:\n```\n{reference_program}\n```\n\n",
        "optimize": "A solution program obtained by optimizing the student's program:\n```\n{reference_program}\n```\n\n",
    }
}

def create_prompt_for_hint_generation(
    task_description: str,
    program_code: str,
    program_output: str,
    enhanced_program: Optional[str],
    hint_type: str,
    reflection: Optional[str],
    template_code: Optional[str] = None,
):
    prompt = deepcopy(prompt_template)

    # Format system message
    reflection_is_substantial = assess_reflection_substantial(reflection)
    if reflection_is_substantial:
        prompt[0]["content"] = prompt[0]["content"].format(
            mention_reflection_in_system=prompt_components["mention_reflection"]["in_system"],
        )
    else:
        prompt[0]["content"] = prompt[0]["content"].format(
            mention_reflection_in_system="",
        )
    
    # Format user message
    problem_description_component = f"Problem description:\n{task_description}\n\n"
    if template_code:
        template_code_component = f"Starter template code:\n```\n{template_code}\n```\n\n"
    else:
        template_code_component = ""
    program_code_component = f"Student's program:\n```\n{program_code}\n```\n\n"
    if reflection_is_substantial:
        reflection_component = f"Student's reflection about possible issues:\n{reflection}\n\n"
    else:
        reflection_component = ""
    if hint_type == "debug":
        output_component = f"Current output of the student program:\n{program_output}\n\n"
    else:  # Don't include output information for planning and optimization hints
        output_component = ""
    if enhanced_program:
        reference_program_component = prompt_components["reference_program"][hint_type].format(
            reference_program=enhanced_program
        )
    else:
        reference_program_component = ""
    if reflection_is_substantial:
        command_tail_component = prompt_components["command_tail"][hint_type].format(
            mention_reflection_in_explanation=prompt_components["mention_reflection"]["in_explanation"],
            mention_reflection_in_hint=prompt_components["mention_reflection"]["in_hint"],
            mention_reflection_in_debugging_hint=prompt_components["mention_reflection"]["in_debugging_hint"],
        )
    else:
        command_tail_component = prompt_components["command_tail"][hint_type].format(
            mention_reflection_in_explanation="",
            mention_reflection_in_hint="",
            mention_reflection_in_debugging_hint="",
        )
    prompt[1]["content"] = prompt[1]["content"].format(
        problem_description=problem_description_component,
        template_code=template_code_component,
        program_code=program_code_component,
        reflection=reflection_component,
        output=output_component,
        reference_program=reference_program_component,
        command_tail=command_tail_component,
    )

    return prompt


def assess_reflection_substantial(reflection_answer: str) -> bool:
    """
    Apply simple rules to estimate the usefulness of student's reflection for hint generation
    """
    if reflection_answer is None:
        return False

    if len(reflection_answer.strip().split()) < 3:  # fewer than 3 words
        return False

    return True