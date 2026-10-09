import { suite, test } from "node:test";
import { equal, deepEqual, throws } from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { signal, effect, untrack } from "./signal";
import * as ns from "./signal";

const tick = () => wait(0);

/** Runs `fn` with `reportError` replaced by a collector, and returns the reported errors. */
async function collectErrors(fn: () => Promise<void>): Promise<unknown[]> {
  const errors: unknown[] = [];
  const g = globalThis as { reportError?: (e: unknown) => void };
  const prev = g.reportError;
  g.reportError = (e) => errors.push(e);
  try {
    await fn();
  } finally {
    g.reportError = prev;
  }
  return errors;
}

/** Runs `read` in an effect on `ctx` and returns a live count of its runs. */
function track(read: () => unknown, ctx?: object) {
  const runs = { count: 0 };
  effect.call(ctx, () => {
    read();
    runs.count++;
  });
  return runs;
}

suite("signal", async () => {
  await test("passes primitives through and caches wrapped objects and methods", () => {
    const s = signal<Record<string, any>>({
      x: 1,
      nested: { x: 1 },
      foo() {
        return this.x;
      },
    });
    equal(s.x, 1, "primitive property passes through");
    s.y = 2;
    equal(s.y, 2, "dynamically assigned property is readable");
    equal(s.foo === s.foo, true, "method reference is cached");
    equal(s.foo(), 1, "cached method works correctly");
    equal(s.nested === s.nested, true, "nested proxy is cached");
    s.nested = { x: 2 };
    equal(s.nested.x, 2, "replacement is re-wrapped");
  });

  await test("tracks computed properties", async () => {
    const s = signal({
      base: 5,
      get doubled() {
        return this.base * 2;
      },
    });
    const runs = track(() => s.doubled);
    s.base = 10;
    await tick();
    equal(runs.count, 2, "effect re-ran when underlying property changed");
  });

  await test("a getter that returns a function is evaluated on every read", async () => {
    const s = signal({
      mode: "a",
      get label() {
        return this.mode === "a" ? () => "A" : () => "B";
      },
    });
    equal(s.label(), "A");
    s.mode = "b";
    await tick();
    equal(s.label(), "B", "the new function is returned, not a cached one");
    let seen = "";
    track(() => (seen = s.label()));
    s.mode = "a";
    await tick();
    equal(seen, "A", "an effect re-runs with the new function");
  });

  await test("does not re-run effects for an unchanged write or a delete of a missing key", async () => {
    const s = signal<Record<string, number>>({ n: NaN, v: 1 });
    const same = track(() => s.v);
    const nan = track(() => s.n);
    const keys = track(() => Object.keys(s).length);
    const missing = track(() => s.x);
    s.v = 1;
    s.n = NaN;
    delete s.x;
    await tick();
    equal(same.count, 1, "the same value is not a change");
    equal(nan.count, 1, "NaN written over NaN is not a change");
    equal(keys.count, 1, "deleting a missing key does not change the keys");
    equal(missing.count, 1, "deleting a missing key is not a change");

    s.n = 1;
    s.x = 2;
    delete s.x;
    await tick();
    equal(nan.count, 2, "a real change still re-runs");
    equal(missing.count, 2, "deleting an existing key still re-runs");
  });

  await test("tracks nested, array element, replaced object, and deleted property changes", async () => {
    const s = signal<{
      level1: { level2: string; gone?: string };
      items: { value: number }[];
      obj: { x: number };
    }>({
      level1: { level2: "deep", gone: "x" },
      items: [{ value: 10 }],
      obj: { x: 1 },
    });
    let last;
    let gone;
    const deleted = track(() => (gone = s.level1.gone));
    const nested = track(() => (last = s.level1.level2));
    const element = track(() => s.items[0].value);
    let replaced;
    const obj = track(() => (replaced = s.obj.x));
    s.level1.level2 = "deeper";
    s.items[0].value = 99;
    s.obj = { x: 999 };
    delete s.level1.gone;
    await tick();
    equal(deleted.count, 2, "effect re-ran on property deletion");
    equal(gone, undefined, "deleted property reads as undefined");
    equal(nested.count, 2, "effect re-ran on nested change");
    equal(last, "deeper", "latest value is visible in the effect");
    equal(element.count, 2, "effect re-ran on array element change");
    equal(obj.count, 2, "effect re-ran on replaced object");
    equal(replaced, 999, "replaced object is auto-wrapped and reactive");
  });

  await test("prunes stale dependencies on conditional reads", async () => {
    const s = signal({ flag: true, a: 0, b: 0 });
    const runs = track(() => (s.flag ? s.a : s.b));

    // Writes `key`, then checks whether the effect re-ran.
    const write = async (key: "flag" | "a" | "b", val: number | boolean) => {
      const before = runs.count;
      (s as Record<string, unknown>)[key] = val;
      await tick();
      return runs.count - before;
    };

    equal(await write("flag", false), 1, "flag change triggers");
    equal(await write("a", 999), 0, "stale dep (a) does not trigger");
    equal(await write("b", 1), 1, "current dep (b) triggers");
    equal(await write("flag", true), 1, "flag change triggers again");
    equal(await write("b", 2), 0, "stale dep (b) does not trigger");
    equal(await write("a", 1), 1, "current dep (a) triggers");
  });

  await test("collapses rapid assignments into one re-run per effect", async () => {
    const s = signal({ a: 0, b: 0 });
    let last;
    const runs = track(() => ((last = s.a), s.b));
    s.a = 1;
    s.a = 2;
    s.a = 3;
    await tick();
    equal(runs.count, 2, "effect ran once for the collapsed change");
    equal(last, 3, "only the final value is seen");

    s.a = 4;
    s.b = 1;
    s.a = 5;
    await tick();
    equal(runs.count, 3, "one re-run for several changed properties");
    equal(last, 5);
  });

  await test("re-runs an effect once for a multi-element array mutation", async () => {
    const list = signal([1, 2, 3, 4, 5]);
    const runs = track(() => list.map((n) => n * 2));
    list.shift();
    await tick();
    equal(runs.count, 2, "shift writes many indexes but re-runs once");
    list.push(6);
    list.sort((a, b) => b - a);
    await tick();
    equal(runs.count, 3, "writes of one tick share one re-run");
  });

  await test("passes the getter value, or the resolved promise value, to the setter", async () => {
    const s = signal({ val: 10 });
    const sync: number[] = [];
    const resolved: number[] = [];
    effect(
      () => s.val,
      (v) => sync.push(v),
    );
    effect(
      () => Promise.resolve(s.val * 2),
      (v) => resolved.push(v),
    );
    await tick();
    s.val = 20;
    await tick();
    deepEqual(sync, [10, 20], "setter received initial and updated values");
    deepEqual(resolved, [20, 40], "resolved values reach the setter in order");
  });

  await test("drops a stale promise result when the effect re-runs", async () => {
    const s = signal({ val: 1 });
    const values: string[] = [];
    effect(
      async () => {
        const v = s.val;
        await wait(v === 1 ? 30 : 0);
        return `r${v}`;
      },
      (v) => values.push(v),
    );
    s.val = 2;
    await wait(60);
    deepEqual(values, ["r2"], "only the latest result reaches the setter");
  });

  await test("drops a pending promise result after disposal", async () => {
    const values: number[] = [];
    const dispose = effect(
      () => wait(0).then(() => 1),
      (v) => values.push(v),
    );
    dispose();
    await wait(10);
    deepEqual(values, [], "setter is not called after dispose");
  });

  await test("disposes an effect whose first run throws, without calling the setter", async () => {
    const state = signal({ n: 0 });
    let runs = 0;
    let setterCalled = false;
    try {
      effect(
        () => {
          runs++;
          void state.n;
          throw new Error("first run");
        },
        () => {
          setterCalled = true;
        },
      );
    } catch {}
    state.n = 1;
    await tick();
    equal(runs, 1, "failed effect is not re-run by later writes");
    equal(setterCalled, false, "setter was not invoked after getter threw");
  });

  await test("isolates across contexts and shares within the same context", async () => {
    const ctxA = {};
    const ctxB = {};
    const sa = signal.call(ctxA, { x: 1 });
    const sb = signal.call(ctxB, { x: 1 });
    const a = track(() => sa.x, ctxA);
    const b = track(() => sb.x, ctxB);
    sa.x = 2;
    await tick();
    equal(a.count, 2, "effect on context A re-ran for signal A");
    equal(b.count, 1, "effect on context B did not react to signal A");

    const shared = {};
    const s1 = signal.call(shared, { val: 1 });
    const s2 = signal.call(shared, { val: 10 });
    let total;
    const both = track(() => (total = s1.val + s2.val), shared);
    s1.val = 5;
    await tick();
    s2.val = 20;
    await tick();
    equal(both.count, 3, "shared-context effect reacted to both signals");
    equal(total, 25, "effect computed with latest values");
  });

  await test("prevents infinite loop when effect writes the same signal", async () => {
    const s = signal({ val: 1 });
    let last = 0;
    const runs = track(() => {
      last = s.val;
      if (last > 5) s.val = 1;
    });
    s.val = 10;
    await tick();
    equal(runs.count, 2, "effect ran once and broke the loop");
    equal(last, 10, "effect saw the value that triggered the guard");
  });

  await test("defers effects that depend on a write made by another effect", async () => {
    const s = signal({ a: 0, b: 0 });
    const source = track(() => (s.b = s.a * 10));
    const downstream = track(() => s.b);
    s.a = 5;
    await tick();
    equal(source.count, 2, "source effect re-ran");
    equal(
      downstream.count,
      1,
      "downstream effect does not run in the same update",
    );
    await tick();
    equal(downstream.count, 2, "downstream effect runs in the next update");
  });

  await test("tracks length changes and works as a root-level reactive array", async () => {
    const s = signal({ items: [1, 2] });
    let len;
    const runs = track(() => (len = s.items.length));
    s.items.push(3);
    await tick();
    s.items.shift();
    await tick();
    s.items.splice(1, 0, 4, 5);
    await tick();
    equal(runs.count, 4, "effect re-ran for each length mutation");
    equal(len, 4, "length reflects splice result");

    type Item = { text: string; checked?: boolean };
    const arr = signal<Item[]>([
      { text: "A", checked: false },
      { text: "B", checked: true },
    ]);
    let checked: Item[] = [];
    const arrRuns = track(() => (checked = arr.filter((i) => i.checked)));
    arr.push({ text: "C" });
    await tick();
    arr[2].checked = true;
    await tick();
    equal(arrRuns.count, 3, "effect re-ran when item property changed");
    deepEqual(
      checked.map((i) => i.text),
      ["B", "C"],
      "filtered result includes newly checked items",
    );
  });

  await test("tracks keys added to and removed from an object", async () => {
    const s = signal<{ o: Record<string, unknown> }>({ o: { a: 1 } });
    let keys: string[] = [];
    const reads = {
      keys: track(() => (keys = Object.keys(s.o))),
      has: track(() => "b" in s.o),
      spread: track(() => ({ ...s.o })),
      forIn: track(() => {
        for (const _ in s.o);
      }),
    };
    const counts = () => Object.values(reads).map((r) => r.count);
    deepEqual(counts(), [1, 1, 1, 1]);

    s.o.a = 2;
    await tick();
    deepEqual(counts(), [1, 1, 2, 1], "a value change skips key readers");

    s.o.b = 1;
    await tick();
    deepEqual(counts(), [2, 2, 3, 2], "adding a key");
    deepEqual(keys, ["a", "b"]);

    delete s.o.b;
    await tick();
    // The spread read both `b` and the keys, yet re-runs once.
    deepEqual(counts(), [3, 3, 4, 3], "deleting a key");
    deepEqual(keys, ["a"]);

    s.o.c = undefined;
    await tick();
    deepEqual(counts(), [4, 3, 5, 4], "adding a key with an undefined value");
    deepEqual(keys, ["a", "c"]);
  });

  await test("untrack prevents subscription inside an effect", async () => {
    const s = signal({ a: 0, b: 0 });
    const runs = track(() => {
      s.a;
      untrack(() => s.b);
    });
    s.a = 1;
    await tick();
    equal(runs.count, 2, "tracked read (a) triggers re-run");
    s.b = 99;
    await tick();
    equal(runs.count, 2, "untracked read (b) does not trigger");
    equal(
      untrack(() => s.b),
      99,
      "untrack returns the callback result",
    );
  });

  await test("an effect created inside another effect keeps the outer tracking", async () => {
    const s = signal({ a: 0, b: 0, c: 0, d: 0 });
    const log: string[] = [];
    effect(() => {
      log.push(`outer ${s.a}`);
      effect(
        () => s.b,
        () => log.push("inner"),
      );
      // Reads after the nested effect are still tracked by the outer one.
      s.c;
      try {
        effect(() => {
          throw new Error("boom");
        });
      } catch {}
      s.d;
    });
    equal(log.join(), "outer 0,inner");

    s.c++;
    await tick();
    equal(
      log.filter((l) => l.startsWith("outer")).length,
      2,
      "read after nested effect",
    );

    s.d++;
    await tick();
    equal(
      log.filter((l) => l.startsWith("outer")).length,
      3,
      "read after a throwing one",
    );
  });

  await test("a disposal function stops tracking, and repeated reads subscribe once", async () => {
    const s = signal({ val: 0 });
    let runs = 0;
    const dispose = effect(() => {
      runs++;
      for (let i = 0; i < 100; i++) s.val;
    });

    s.val = 1;
    await tick();
    equal(runs, 2, "a write re-runs the effect once");

    dispose();
    s.val = 2;
    await tick();
    equal(runs, 2, "disposing releases the repeated subscription");
  });

  await test("throwing effect is unsubscribed on re-run and its error is reported", async () => {
    const s = signal({ val: 0 });
    let count = 0;
    const boom = new Error("boom");
    let others = 0;
    const errors = await collectErrors(async () => {
      effect(() => {
        if (s.val === 1) throw boom;
        count++;
      });
      effect(() => {
        s.val;
        others++;
      });
      equal(count, 1, "effect runs immediately on creation");

      s.val = 1;
      await tick();
      s.val = 2;
      await tick();
    });
    equal(count, 1, "effect was cleaned up after throw and did not re-run");
    equal(others, 3, "other effects of the same update still ran");
    deepEqual(errors, [boom], "the error was reported once");
  });

  await test("a throwing accessor does not stop effects from re-running", async () => {
    const s = signal({
      n: 0,
      _v: 0,
      get v() {
        if (this._v === 99) throw new Error("get");
        return this._v;
      },
      set v(x: number) {
        if (x < 0) throw new Error("set");
        this._v = x;
      },
    });
    const runs = track(() => s.n);

    throws(() => (s.v = -1), /set/, "a throwing setter propagates");
    s._v = 99;
    throws(() => (s.v = 1), /get/, "a throwing getter propagates");
    s.n = 1;
    await tick();
    equal(runs.count, 2, "the existing effect still re-runs");

    const late = track(() => s.n);
    s.n = 2;
    await tick();
    equal(runs.count, 3);
    equal(late.count, 2, "a new effect tracks and re-runs");
  });

  await test("a throwing setter is reported and the effect keeps running", async () => {
    const s = signal({ val: 0 });
    const seen: number[] = [];
    const boom = new Error("setter");
    const errors = await collectErrors(async () => {
      effect(
        () => s.val,
        (v) => {
          seen.push(v);
          if (v === 1) throw boom;
        },
      );
      s.val = 1;
      await tick();
      s.val = 2;
      await tick();
    });
    deepEqual(seen, [0, 1, 2], "the effect re-runs after a setter error");
    deepEqual(errors, [boom], "the setter error was reported");
  });

  await test("a rejected promise is reported only while its run is current", async () => {
    const s = signal({ val: 0 });
    const seen: number[] = [];
    const pending: Array<(e: Error) => void> = [];
    const boom = new Error("rejected");
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    let dispose = () => {};
    const errors = await collectErrors(async () => {
      dispose = effect(
        () => {
          const v = s.val;
          return new Promise<number>((resolve, reject) => {
            if (v === 0) resolve(v);
            else pending.push(reject);
          });
        },
        (v) => seen.push(v),
      );
      await tick();
      // A rejection of the latest run is reported.
      s.val = 1;
      await tick();
      pending[0](boom);
      await tick();
      // A rejection of a run that was superseded is dropped.
      s.val = 2;
      await tick();
      s.val = 3;
      await tick();
      pending[1](new Error("stale"));
      await tick();
      // A rejection after disposal is dropped.
      dispose();
      pending[2](new Error("disposed"));
      await tick();
    });
    process.off("unhandledRejection", onUnhandled);
    deepEqual(errors, [boom], "only the rejection of the current run");
    deepEqual(seen, [0], "the setter is not called for a rejection");
    deepEqual(unhandled, [], "no unhandled rejection is left");
  });

  await test("falls back to the console where reportError is unavailable", async () => {
    const s = signal({ val: 0 });
    const g = globalThis as { reportError?: unknown };
    const prevReport = g.reportError;
    const prevConsole = console.error;
    const logged: unknown[] = [];
    g.reportError = undefined;
    console.error = (e: unknown) => logged.push(e);
    try {
      const boom = new Error("console");
      effect(
        () => s.val,
        () => {
          throw boom;
        },
      );
      deepEqual(logged, [boom], "the error went to console.error");
    } finally {
      g.reportError = prevReport;
      console.error = prevConsole;
    }
  });

  await test("an effect disposed by an earlier effect in the same trigger does not run again", async () => {
    const s = signal({ val: 0 });
    let runs = 0;
    let stop = () => {};
    effect(() => {
      s.val;
      stop();
    });
    stop = effect(() => {
      runs++;
      s.val;
    });
    equal(runs, 1, "effect runs immediately on creation");

    s.val = 1;
    await tick();
    equal(runs, 1, "disposed effect is skipped in the same trigger");
    s.val = 2;
    await tick();
    equal(runs, 1, "disposed effect did not re-subscribe");
  });

  await test("treats a module namespace `this` as the global context", async () => {
    const s = ns.signal({ a: 1 });
    const runs = track(() => s.a);
    let nsRuns = 0;
    ns.effect(() => {
      s.a;
      nsRuns++;
    });
    s.a = 2;
    await tick();
    equal(runs.count, 2, "namespace-called signal shares the global context");
    equal(nsRuns, 2, "namespace-called effect tracks the signal");
    equal(
      ns.untrack(() => s.a),
      2,
      "namespace-called untrack works",
    );
  });

  await test("keys of disposed effects do not stay allocated on a live signal", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const heap = () => {
      gc();
      return process.memoryUsage().heapUsed;
    };
    const dict = signal<Record<string, number>>({});
    const before = heap();
    for (let i = 0; i < 50_000; i++) effect(() => dict[`key${i}`])();
    const grown = heap() - before;
    // Unreleased, 50k empty subscriber sets would retain over 10 MB.
    equal(grown < 3_000_000, true, `retained ${grown} bytes`);
    equal(Object.keys(dict).length, 0, "signal data is untouched");
  });

  await test("an effect resubscribes to a key whose subscriber set was dropped", async () => {
    const s = signal({ a: 1 });
    const first = track(() => s.a);
    const second = track(() => s.a);
    s.a = 2;
    await tick();
    equal(first.count, 2);
    equal(second.count, 2);

    const dispose = effect(() => s.a);
    dispose();
    const late = track(() => s.a);
    s.a = 3;
    await tick();
    equal(first.count, 3, "earlier effects keep tracking");
    equal(late.count, 2, "a later effect tracks the same key");
  });
});
