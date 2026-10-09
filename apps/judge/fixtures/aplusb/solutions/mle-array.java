// 800 MB array with a 256 MB limit: OutOfMemoryError must be reported as MLE, not RE
public class Main {
    public static void main(String[] args) {
        long[] big = new long[100_000_000];
        big[1] = 1;
        System.out.println(big.length);
    }
}
