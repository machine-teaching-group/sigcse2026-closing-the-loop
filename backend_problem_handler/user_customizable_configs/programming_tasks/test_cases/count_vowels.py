import sys
text_1 = "Python and Anaconda"
if isinstance(count_vowels(text_1), int) == False:
    print("Test failed: You must return an integer.", file=sys.stderr)
    exit(1)
if count_vowels(text_1) != 6:
    print(f"Test failed: count_vowels('Python and Anaconda') should be 6, got {count_vowels(text_1)}", file=sys.stderr)
    exit(1)

text_2 = "Python is an interpreted, object-oriented, high-level programming language with dynamic semantics"
if count_vowels(text_2) != 29:
    print(f"Test failed: count_vowels('Python is an interpreted, object-oriented, high-level programming language with dynamic semantics') should be 29, got {count_vowels(text_2)}", file=sys.stderr)
    exit(1)

if count_vowels("hello") != 2:
    print(f"Test failed: count_vowels('hello') should be 2, got {count_vowels('hello')}", file=sys.stderr)
    exit(1)

if count_vowels("AEIOU") != 5:
    print(f"Test failed: count_vowels('AEIOU') should be 5, got {count_vowels('AEIOU')}", file=sys.stderr)
    exit(1)

if count_vowels("") != 0:
    print(f"Test failed: count_vowels('') should be 0, got {count_vowels('')}", file=sys.stderr)
    exit(1)