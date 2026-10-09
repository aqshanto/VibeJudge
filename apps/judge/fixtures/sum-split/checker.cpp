// Any two positive integers a, b with a + b = n are accepted.
#include "testlib.h"
int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);
    long long n = inf.readLong();
    long long a = ouf.readLong(1, n - 1, "a");
    long long b = ouf.readLong(1, n - 1, "b");
    if (a + b != n) quitf(_wa, "%lld + %lld != %lld", a, b, n);
    quitf(_ok, "%lld + %lld = %lld", a, b, n);
}
