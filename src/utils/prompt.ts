export async function waitForEnter(): Promise<void> {
  const { createInterface } = await import("node:readline");
  return new Promise<void>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); resolve(); });
  });
}
