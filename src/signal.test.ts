import { suite, test } from "node:test";
import { equal, deepEqual } from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { signal, effect, untrack } from "./signal";

const tick = () => wait(0);

suite("signal", async () => {
  await test("creates a reactive proxy with primitive passthrough", () => {
    const s = signal({ str: "hello", num: 42, flag: true });
    equal(s.str, "hello", "string property passes through");
    equal(s.num, 42, "number property passes through");
    equal(s.flag, true, "boolean property passes through");
  });

  await test("accepts empty default and dynamic properties", () => {
    const s = signal();
    s.x = 1;
    equal(s.x, 1, "dynamically assigned property is readable");
  });

  await test("caches methods on the proxy", () => {
    const s = signal({
      x: 1,
      foo() {
        return this.x;
      },
    });
    s.foo();
    equal(s.foo === s.foo, true, "method reference is cached");
    equal(s.foo(), 1, "cached method works correctly");
  });

  await test("tracks basic property changes", async () => {
    const s = signal({ val: 1 });
    let count = 0;
    effect(() => {
      s.val;
      count++;
    });
    s.val = 2;
    await tick();
    equal(count, 2, "effect re-ran on property change");
  });

  await test("tracks computed properties", async () => {
    const s = signal({
      base: 5,
      get doubled() {
        return this.base * 2;
      },
    });
    let count = 0;
    effect(() => {
      s.doubled;
      count++;
    });
    s.base = 10;
    await tick();
    equal(count, 2, "effect re-ran when underlying property changed");
  });

  await test("tracks deeply nested property changes", async () => {
    const s = signal({ level1: { level2: { level3: "deep" } } });
    let count = 0;
    let lastVal;
    effect(() => {
      lastVal = s.level1.level2.level3;
      count++;
    });
    s.level1.level2.level3 = "deeper";
    await tick();
    equal(count, 2, "effect re-ran on nested change");
    equal(lastVal, "deeper", "latest value is visible in the effect");
  });

  await test("tracks array element changes", async () => {
    const s = signal({ items: [{ value: 10 }, { value: 20 }] });
    let count = 0;
    effect(() => {
      s.items[0].value;
      count++;
    });
    s.items[0].value = 99;
    await tick();
    equal(count, 2, "effect re-ran on array element change");
  });

  await test("auto-wraps replaced objects", async () => {
    const s = signal({ obj: { x: 1 } });
    let count = 0;
    let lastVal;
    effect(() => {
      lastVal = s.obj.x;
      count++;
    });
    s.obj = { x: 999 };
    await tick();
    equal(count, 2, "effect re-ran on replaced object");
    equal(lastVal, 999, "replaced object is auto-wrapped and reactive");
  });

  await test("tracks property deletion", async () => {
    const s = signal<{ user: { name?: string } }>({ user: { name: "Alice" } });
    let count = 0;
    let lastVal;
    effect(() => {
      lastVal = s.user.name;
      count++;
    });
    delete s.user.name;
    await tick();
    equal(count, 2, "effect re-ran on property deletion");
    equal(lastVal, undefined, "deleted property reads as undefined");
  });

  await test("supports multiple independent effects", async () => {
    const s = signal({ a: 0, b: 0 });
    let countA = 0;
    let countB = 0;
    effect(() => {
      s.a;
      countA++;
    });
    effect(() => {
      s.b;
      countB++;
    });
    s.a = 1;
    s.b = 1;
    await tick();
    equal(countA, 2, "effect A re-ran only when a changed");
    equal(countB, 2, "effect B re-ran only when b changed");
  });

  await test("prunes stale dependencies on conditional reads", async () => {
    const s = signal({ flag: true, a: 0, b: 0 });
    let count = 0;
    effect(() => {
      if (s.flag) s.a;
      else s.b;
      count++;
    });

    s.flag = false;
    await tick();
    const afterSwitch = count;

    s.a = 999;
    await tick();
    equal(count, afterSwitch, "stale dep (a) should not trigger");

    s.b = 1;
    await tick();
    equal(count, afterSwitch + 1, "current dep (b) should trigger");

    s.flag = true;
    await tick();
    const afterToggle = count;

    s.b = 2;
    await tick();
    equal(count, afterToggle, "stale dep (b) should not trigger after toggle");

    s.a = 1;
    await tick();
    equal(
      count,
      afterToggle + 1,
      "current dep (a) should trigger after toggle",
    );
  });

  await test("skips effect when value does not change", async () => {
    const s = signal({ val: 1 });
    let count = 0;
    effect(() => {
      s.val;
      count++;
    });
    s.val = 1;
    s.val = 1;
    await tick();
    equal(count, 1, "effect did not re-run when value stayed the same");
  });

  await test("collapses rapid assignments into a single re-run", async () => {
    const s = signal({ freq: 440 });
    let count = 0;
    let lastVal;
    effect(() => {
      lastVal = s.freq;
      count++;
    });
    s.freq = 500;
    s.freq = 600;
    s.freq = 800;
    await tick();
    equal(count, 2, "effect ran once for the collapsed change");
    equal(lastVal, 800, "only the final value is seen");
  });

  await test("fires once per changed property in rapid multi-property writes", async () => {
    const s = signal({ a: 0, b: 0 });
    let count = 0;
    effect(() => {
      s.a;
      s.b;
      count++;
    });
    s.a = 1;
    s.b = 1;
    s.a = 2;
    await tick();
    equal(count, 3, "one re-run per distinct write-batch");
  });

  await test("returns a disposal function that stops tracking", async () => {
    const s = signal({ val: 0 });
    let count = 0;
    const dispose = effect(() => {
      s.val;
      count++;
    });
    s.val = 1;
    await tick();
    equal(count, 2, "effect fired before disposal");
    dispose();
    s.val = 2;
    await tick();
    equal(count, 2, "effect did not fire after disposal");
  });

  await test("passes the getter return value to the setter", async () => {
    const s = signal({ val: 10 });
    const values: number[] = [];
    effect(
      () => s.val,
      (v) => values.push(v),
    );
    s.val = 20;
    await tick();
    equal(values.length, 2, "setter received initial and updated values");
    deepEqual(values, [10, 20], "values are in order");
  });

  await test("passes resolved promise values to the setter", async () => {
    const s = signal({ val: 1 });
    const values: number[] = [];
    effect(
      () => Promise.resolve(s.val * 2),
      (v) => values.push(v),
    );
    await tick();
    equal(values[0], 2, "initial resolved value passed to setter");
    s.val = 5;
    await tick();
    equal(values[1], 10, "updated resolved value passed to setter");
  });

  await test("is not called when getter throws", () => {
    const s = signal({ val: 10 });
    let setterCalled = false;
    try {
      effect(
        () => {
          if (s.val > 5) throw new Error();
          return s.val;
        },
        () => {
          setterCalled = true;
        },
      );
    } catch {}
    equal(setterCalled, false, "setter was not invoked after getter threw");
  });

  await test("isolates across contexts and shares within the same context", async () => {
    // signals on different contexts are isolated
    const ctxA = {};
    const ctxB = {};
    const sa = signal.call(ctxA, { x: 1 });
    const sb = signal.call(ctxB, { x: 1 });
    let countA = 0;
    let countB = 0;
    effect.call(ctxA, () => {
      sa.x;
      countA++;
    });
    effect.call(ctxB, () => {
      sb.x;
      countB++;
    });
    sa.x = 2;
    await tick();
    equal(countA, 2, "effect on context A re-ran for signal A");
    equal(countB, 1, "effect on context B did not react to signal A");

    // signals sharing a context both drive effects on that context
    const shared = {};
    const s1 = signal.call(shared, { val: 1 });
    const s2 = signal.call(shared, { val: 10 });
    let countShared = 0;
    let lastTotal;
    effect.call(shared, () => {
      lastTotal = s1.val + s2.val;
      countShared++;
    });
    s1.val = 5;
    await tick();
    s2.val = 20;
    await tick();
    equal(countShared, 3, "shared-context effect reacted to both signals");
    equal(lastTotal, 25, "effect computed with latest values");
  });

  await test("keeps cross-signal effects in sync within a shared context", async () => {
    const ctx = {};
    const s1 = signal.call(ctx, { a: 0 });
    const s2 = signal.call(ctx, { b: 0 });
    const steps: string[] = [];

    effect.call(ctx, () => {
      steps.push(`A${s1.a}`);
      s2.b = s1.a;
    });
    effect.call(ctx, () => {
      steps.push(`B${s2.b}`);
    });

    s1.a = 1;
    await tick();
    s1.a = 2;
    await tick();
    await tick();

    deepEqual(steps, ["A0", "B0", "A1", "B1", "A2", "B2"], "effects ran in expected order");
  });

  await test("prevents infinite loop when effect writes the same signal", async () => {
    const s = signal({ val: 1 });
    let count = 0;
    let lastVal = 0;
    effect(() => {
      lastVal = s.val;
      if (lastVal > 5) s.val = 1;
      count++;
    });
    s.val = 10;
    await tick();
    equal(count, 2, "effect ran once and broke the loop");
    equal(lastVal, 10, "effect saw the value that triggered the guard");
  });

  await test("blocks cascade when an effect writes another signal", async () => {
    const s = signal({ a: 0, b: 0 });
    let countA = 0;
    let countB = 0;
    effect(() => {
      s.a;
      s.b = s.a * 10;
      countA++;
    });
    effect(() => {
      s.b;
      countB++;
    });
    s.a = 5;
    await tick();
    equal(countA, 2, "source effect re-ran");
    equal(countB, 1, "downstream effect did not cascade from effect write");
  });

  await test("tracks length changes and works as a root-level reactive array", async () => {
    const s = signal({ items: [1, 2] });
    let count = 0;
    let lastLen;
    effect(() => {
      lastLen = s.items.length;
      count++;
    });
    await tick();
    s.items.push(3);
    await tick();
    s.items.shift();
    await tick();
    s.items.splice(1, 0, 4, 5);
    await tick();
    equal(count, 4, "effect re-ran for each length mutation");
    equal(lastLen, 4, "length reflects splice result");

    // root-level reactive array with iteration
    type Item = { text: string; checked?: boolean };
    const arr = signal<Item[]>([
      { text: "A", checked: false },
      { text: "B", checked: true },
    ]);
    let arrCount = 0;
    let lastResult: Item[] = [];
    effect(() => {
      lastResult = arr.filter((item) => item.checked);
      arrCount++;
    });
    arr.push({ text: "C" });
    await tick();
    arr[2].checked = true;
    await tick();
    equal(arrCount, 3, "effect re-ran when item property changed");
    deepEqual(
      lastResult.map((i) => i.text),
      ["B", "C"],
      "filtered result includes newly checked items",
    );
  });

  await test("untrack prevents subscription inside an effect", async () => {
    const s = signal({ a: 0, b: 0 });
    let count = 0;

    untrack(() => {
      s.a;
      count++;
    });
    s.a = 1;
    await tick();
    equal(count, 1, "standalone untrack does not subscribe");

    effect(() => {
      s.a;
      untrack(() => {
        s.b;
      });
      count++;
    });
    s.a = 2;
    await tick();
    equal(count, 3, "tracked read (a) triggers re-run");
    s.b = 99;
    await tick();
    equal(count, 3, "untracked read (b) does not trigger");
  });

  await test("throwing effect is unsubscribed on re-run", async () => {
    const s = signal({ val: 0 });
    let count = 0;
    effect(() => {
      s.val;
      if (s.val === 1) throw new Error("boom");
      count++;
    });
    equal(count, 1, "effect runs immediately on creation");

    s.val = 1;
    await tick();
    s.val = 2;
    await tick();
    equal(count, 1, "effect was cleaned up after throw and did not re-subscribe");
  });
});
