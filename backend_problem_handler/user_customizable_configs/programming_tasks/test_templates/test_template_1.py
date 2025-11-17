import sys


# Using Audit hooks to block the code from harmful actions
def block_filesystem_events(event, args):
    # Block the code from writing to files
    if event in ("open", "os.open", "builtins.open"):
        if args[1] is None or "w" in args[1] or "a" in args[1]:
            raise PermissionError(
                f"Writing or modifying files is not allowed. Event: {event}. Args: {args}"
            )

    # Block the code from making any changes to the file systems
    if event in ("os.remove", "os.rename", "os.mkdir", "os.rmdir", "os.chmod"):
        raise PermissionError(
            f"Modifying file systems is not allowed. Event: {event}. Args: {args}"
        )

    # Block the code from making any network actions
    if event.startswith("socket."):
        raise PermissionError(
            f"Network actions are not allowed. Event: {event}. Args: {args}"
        )


sys.addaudithook(block_filesystem_events)

# The student's program ===


###{{{ INPUT_PROGRAM }}}###


# =========================


# The test cases ===


###{{{ TEST_CASES }}}###