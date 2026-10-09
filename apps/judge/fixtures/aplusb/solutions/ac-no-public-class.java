// no public class at all: the judge runs the class that has main()
import java.util.Scanner;

class Helper {
    static long add(long a, long b) { return a + b; }
}

class Program {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(Helper.add(sc.nextLong(), sc.nextLong()));
    }
}
