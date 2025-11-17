import logging
from typing import Optional
from copy import deepcopy

logger = logging.getLogger(__name__)


prompt_template = [
    {
        "role": "system", 
        "content": None,
    },
    {
        "role": "user", 
        "content": """
{problem_description}
{template_code}
{buggy_program}
{command_tail}
        """.strip()}
]

prompt_components = {
    "system": {
        "repair": "You are a helpful teaching assistant. You are helping students learn to solve programming problems in a Python course. Below you are provided a student's current program for a Python programming problem. Your goal is to help the student by fixing their program.",
        "optimize": "You are a helpful teaching assistant. You are helping students learn to solve programming problems in a Python course. Below you are provided a student's current program for a Python programming problem. Your goal is to help the student by optimizing their program.",
    },
    "command_tail": {
        "repair": "Can you help the student fix the program? Make sure that you make minimal changes needed to fix the program.\n\nOutput only the fixed program in JSON format with the field name \"fixed_program\".",
        "optimize": "Can you help the student optimize the program to enhance speed, readability, and memory usage?\n\nOutput only the optimized program in JSON format with the field name \"optimized_program\".",
    }
}


def create_prompt_for_enhanced_programs(
    modification_type: str,
    program_code: str,
    task_description: str,
    template_code: Optional[str] = None,
):
    """
    Create a prompt for generating enhanced programs.
    """
    prompt = deepcopy(prompt_template)

    # Format system message
    prompt[0]["content"] = prompt_components["system"][modification_type]

    # Format user message
    problem_description_component = f"Problem description:\n{task_description}\n\n"
    if template_code:
        template_code_component = f"Starter template code:\n```\n{template_code}\n```\n\n"
    else:
        template_code_component = ""
    buggy_program_component = f"Student's program:\n```\n{program_code}\n```\n\n"
    prompt[1]["content"] = prompt[1]["content"].format(
        problem_description=problem_description_component,
        template_code=template_code_component,
        buggy_program=buggy_program_component,
        command_tail=prompt_components["command_tail"][modification_type],
    )
    
    logger.debug(f"Prompt for program repair:")
    logger.debug(f"System: {prompt[0]['content']}")
    logger.debug(f"User: {prompt[1]['content']}")

    return prompt