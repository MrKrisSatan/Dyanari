import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
const setup = () =>
  new Core(
    fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-scheduler-")),
  );
test("proactive mode is off by default and blocks model scheduling", async () => {
  const c = setup();
  await assert.rejects(
    c.tool("schedule_reminder", {
      text: "hello",
      due: new Date(Date.now() + 60000).toISOString(),
      repeat_minutes: 0,
    }),
    /OFF/,
  );
  c.db.close();
});
test("reminders persist, deliver once, acknowledge and cancel", () => {
  const c = setup();
  c.save({ proactive: true, quietStart: 0, quietEnd: 0 });
  const now = new Date(),
    r = c.scheduler.add({
      text: "Build finished",
      due: new Date(now.getTime() + 2000).toISOString(),
      repeat_minutes: 0,
    });
  assert.equal(c.scheduler.tick(now).length, 0);
  assert.deepEqual(c.scheduler.tick(new Date(now.getTime() + 3000)), [
    "Build finished",
  ]);
  assert.equal(c.scheduler.tick(new Date(now.getTime() + 4000)).length, 0);
  const n = c.scheduler.notifications()[0];
  c.scheduler.acknowledge(n.id);
  assert.equal(c.scheduler.notifications()[0].seen, 1);
  const next = c.scheduler.add({
    text: "cancel me",
    due: new Date(Date.now() + 60000).toISOString(),
    repeat_minutes: 0,
  });
  c.scheduler.cancel(next.id);
  assert.equal(c.scheduler.list().find((x) => x.id === next.id).enabled, 0);
  c.db.close();
});
test("quiet hours defer, recurrence schedules future delivery and disabling stops it", () => {
  const c = setup();
  const now = new Date(Date.now() + 3600000),
    hour = now.getHours();
  c.save({ proactive: true, quietStart: hour, quietEnd: (hour + 1) % 24 });
  c.scheduler.add({
    text: "repeat",
    due: new Date(Date.now() + 1000).toISOString(),
    repeat_minutes: 30,
  });
  assert.deepEqual(c.scheduler.tick(now), []);
  c.save({ quietStart: 0, quietEnd: 0 });
  assert.deepEqual(c.scheduler.tick(now), ["repeat"]);
  assert.equal(Date.parse(c.scheduler.list()[0].due), now.getTime() + 1800000);
  c.save({ proactive: false });
  assert.deepEqual(c.scheduler.tick(new Date(now.getTime() + 3600000)), []);
  c.db.close();
});
