import sys
if not isinstance(read_file(), str):
    print("Test failed: read_file() did not return a string.", file=sys.stderr)
    sys.exit(1)

if read_file().strip() != "This is the data to read.":
    print("Test failed: File content does not match expected data.", file=sys.stderr)
    sys.exit(1)