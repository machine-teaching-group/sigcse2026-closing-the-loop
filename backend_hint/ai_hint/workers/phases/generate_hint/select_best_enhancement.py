from pathlib import Path
from typing import Optional, Sequence

from ai_hint.models import EnhancedProgram
from ai_hint.utils.edit_distance_utils import compute_edit_distance, program_to_essential_tokens



def select_enhanced_program_by_edit_distance(
    anchor_program: str,
    correct_candidate_programs: Sequence[EnhancedProgram],  # The programs here should already be verified as correct
) -> Optional[str]:
    """
    Input a list of enhanced programs.
    Select the best enhanced program: The correct program with the shortest edit distance to the anchor program.
    """
    # Select the program with the shortest edit distance
    anchor_tokens = program_to_essential_tokens(anchor_program)
    best_enhancement, minimum_ed = None, 1e9
    for enhancement in correct_candidate_programs:
        ed = compute_edit_distance(
            anchor_tokens, program_to_essential_tokens(enhancement.enhanced_program)
        )
        if ed < minimum_ed:
            minimum_ed = ed
            best_enhancement = enhancement.enhanced_program
            # print(f"Updated new best enhancement with edit distance {minimum_ed}")

    return best_enhancement


def select_enhanced_program_by_run_time(
    correct_candidate_programs: Sequence[EnhancedProgram],  # The programs here should already be verified as correct
) -> Optional[str]:
    """
    Input a list of enhanced programs.
    Select the best solution program: The correct program with the shortest running time.
    """
    if len(correct_candidate_programs) == 0:
        return None

    # Sort the correct solutions by their running time
    correct_candidate_programs = sorted(correct_candidate_programs, key=lambda x: x.run_time)
    best_solution = correct_candidate_programs[0]

    return best_solution.enhanced_program
