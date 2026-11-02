export const schedulerDefinitions = [
  [
    "schedule_reminder",
    "Schedule a local in-app reminder when Proactive Mode is ON. due is an ISO date/time with timezone; repeat_minutes is 0 for one-time reminders.",
    { text: "string", due: "string", repeat_minutes: "number" },
  ],
  ["list_reminders", "List local reminders when Proactive Mode is ON.", {}],
  [
    "cancel_reminder",
    "Cancel a scheduled reminder by its numeric id.",
    { id: "number" },
  ],
];
export class Scheduler {
  constructor(core) {
    this.core = core;
    core.db.exec(
      `CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY,text TEXT,due TEXT,repeat_minutes INTEGER DEFAULT 0,enabled INTEGER DEFAULT 1,stamp TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,text TEXT,seen INTEGER DEFAULT 0,stamp TEXT DEFAULT CURRENT_TIMESTAMP);`,
    );
  }
  enabled() {
    if (!this.core.settings.proactive) throw Error("Proactive Mode is OFF");
  }
  list() {
    return this.core.db
      .prepare("SELECT * FROM reminders ORDER BY due LIMIT 100")
      .all();
  }
  add(a) {
    this.enabled();
    if (typeof a.text !== "string" || !a.text.trim() || a.text.length > 1000)
      throw Error("Reminder text must contain 1–1000 characters");
    if (
      typeof a.due !== "string" ||
      !/(Z|[+-]\d\d:\d\d)$/.test(a.due) ||
      !Number.isFinite(Date.parse(a.due)) ||
      Date.parse(a.due) <= Date.now()
    )
      throw Error("due must be a future ISO date/time with timezone");
    if (
      !Number.isInteger(a.repeat_minutes) ||
      a.repeat_minutes < 0 ||
      a.repeat_minutes > 525600 ||
      (a.repeat_minutes > 0 && a.repeat_minutes < 1)
    )
      throw Error("Invalid repeat interval");
    const r = this.core.db
      .prepare("INSERT INTO reminders(text,due,repeat_minutes) VALUES(?,?,?)")
      .run(a.text, new Date(a.due).toISOString(), a.repeat_minutes);
    this.core.log("scheduler", "Reminder scheduled " + r.lastInsertRowid);
    return { id: Number(r.lastInsertRowid) };
  }
  cancel(id) {
    this.core.db
      .prepare("UPDATE reminders SET enabled=0 WHERE id=?")
      .run(Number(id));
    this.core.log("scheduler", "Reminder cancelled " + id);
    return { cancelled: Number(id) };
  }
  execute(name, a) {
    this.enabled();
    if (name === "schedule_reminder") return this.add(a);
    if (name === "list_reminders") return this.list();
    return this.cancel(a.id);
  }
  quiet(now) {
    const { quietStart = 22, quietEnd = 8 } = this.core.settings,
      hour = now.getHours();
    return quietStart === quietEnd
      ? false
      : quietStart < quietEnd
        ? hour >= quietStart && hour < quietEnd
        : hour >= quietStart || hour < quietEnd;
  }
  tick(now = new Date()) {
    if (!this.core.settings.proactive || this.quiet(now)) return [];
    const sent = [];
    this.core.db.exec("BEGIN IMMEDIATE");
    try {
      const due = this.core.db
        .prepare(
          "SELECT * FROM reminders WHERE enabled=1 AND due<=? ORDER BY due LIMIT 20",
        )
        .all(now.toISOString());
      for (const r of due) {
        this.core.db
          .prepare("INSERT INTO notifications(text) VALUES(?)")
          .run(r.text);
        if (r.repeat_minutes) {
          const next = new Date(
            now.getTime() + r.repeat_minutes * 60000,
          ).toISOString();
          this.core.db
            .prepare("UPDATE reminders SET due=? WHERE id=?")
            .run(next, r.id);
        } else
          this.core.db
            .prepare("UPDATE reminders SET enabled=0 WHERE id=?")
            .run(r.id);
        sent.push(r.text);
      }
      this.core.db.exec("COMMIT");
    } catch (e) {
      this.core.db.exec("ROLLBACK");
      throw e;
    }
    for (const text of sent) this.core.log("notification", text);
    return sent;
  }
  notifications() {
    return this.core.db
      .prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT 80")
      .all();
  }
  acknowledge(id) {
    this.core.db
      .prepare("UPDATE notifications SET seen=1 WHERE id=?")
      .run(Number(id));
  }
}
