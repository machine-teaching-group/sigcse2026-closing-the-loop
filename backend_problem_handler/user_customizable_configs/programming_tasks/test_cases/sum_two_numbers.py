import sys
if foo(1, 2) != 3:
    print(f"Test failed: foo(1, 2) should be 3, got {foo(1, 2)}", file=sys.stderr)
    exit(1)

if foo(-5, 5) != 0:
    print(f"Test failed: foo(-5, 5) should be 0, got {foo(-5, 5)}", file=sys.stderr)
    exit(1)