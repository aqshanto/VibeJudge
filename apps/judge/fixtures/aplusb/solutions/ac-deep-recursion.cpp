// 2 million deep recursion: needs a large stack (fails if stack is capped at 8 MB)
#include <bits/stdc++.h>
int depth(int n) {
    volatile char frame[16];
    frame[0] = (char)n;
    if (n == 0) return 0;
    return depth(n - 1) + (frame[0] & 1) * 0;
}
int main() {
    long long a, b;
    std::cin >> a >> b;
    depth(2000000);
    std::cout << a + b << "\n";
}
