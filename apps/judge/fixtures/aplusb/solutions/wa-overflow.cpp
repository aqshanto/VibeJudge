// 3*10^9 does not fit in int (max 2147483647), so test 3 fails.
#include <bits/stdc++.h>
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << "\n";
}
