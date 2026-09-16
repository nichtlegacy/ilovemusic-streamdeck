import assert from "node:assert/strict";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

export { assert };

export function test(name: string, run: () => void | Promise<void>): void {
  tests.push({ name, run });
}

export async function runTests(): Promise<void> {
  let passed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      throw error;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}
