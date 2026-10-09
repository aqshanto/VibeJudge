#include <bits/stdc++.h>
int main() {
    volatile int *p = nullptr;
    *p = 42;
    std::cout << *p << "\n";
}
