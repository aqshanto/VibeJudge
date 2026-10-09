# 200000 deep recursion after raising the recursion limit
import sys

sys.setrecursionlimit(1_000_000)


def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)


a, b = map(int, input().split())
assert depth(200_000) == 200_000
print(a + b)
