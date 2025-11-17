import sys

f0 = factorial(0)
if f0 != 1:
    print(f"Test failed: factorial(0) should be 1, got {f0}", file=sys.stderr)
    exit(1)

f1 = factorial(1)
if f1 != 1:
    print(f"Test failed: factorial(1) should be 1, got {f1}", file=sys.stderr)
    exit(1)

f5 = factorial(5)
if f5 != 120:
    print(f"Test failed: factorial(5) should be 120, got {f5}", file=sys.stderr)
    exit(1)

f10 = factorial(10)
if f10 != 3628800:
    print(f"Test failed: factorial(10) should be 3628800, got {f10}", file=sys.stderr)
    exit(1)