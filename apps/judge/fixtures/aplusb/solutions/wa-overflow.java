// int overflows on test 3 (3*10^9)
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = (int) sc.nextLong(), b = (int) sc.nextLong();
        System.out.println(a + b);
    }
}
