// touches ~400 MB with a 256 MB limit
#include <bits/stdc++.h>
int main() {
    std::vector<int> v(100000000, 1);
    long long s = 0;
    for (int x : v) s += x;
    std::cout << s << "\n";
}
