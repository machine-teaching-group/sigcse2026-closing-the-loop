import sys

f11 = factorial(11)
if f11 != 39916800:
    print(f"Test failed: factorial(11) should be 39916800, got {f11}", file=sys.stderr)
    exit(1)