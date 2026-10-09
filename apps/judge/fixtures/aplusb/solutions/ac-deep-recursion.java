// 1 million deep recursion: works because the judge gives Java a 64 MB stack
import java.util.Scanner;

public class Main {
    static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long a = sc.nextLong(), b = sc.nextLong();
        if (depth(1_000_000) != 1_000_000) throw new IllegalStateException();
        System.out.println(a + b);
    }
}
