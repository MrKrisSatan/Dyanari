import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { inspectImage } from "./vision.mjs";
test("vision rejects invalid input before inference", async () => {
  await assert.rejects(inspectImage("not-an-image", "describe"), /Expected/);
  await assert.rejects(
    inspectImage(Buffer.from("plain text").toString("base64"), "describe"),
    /JPEG/,
  );
});
test("real local vision identifies a generated test image", async () => {
  const script =
    "Add-Type -AssemblyName System.Drawing; $b=New-Object System.Drawing.Bitmap(400,240);$g=[System.Drawing.Graphics]::FromImage($b);$g.Clear([System.Drawing.Color]::White);$g.FillRectangle([System.Drawing.Brushes]::Red,30,40,130,150);$g.FillEllipse([System.Drawing.Brushes]::Blue,220,50,130,130);$m=New-Object System.IO.MemoryStream;$b.Save($m,[System.Drawing.Imaging.ImageFormat]::Jpeg);[Console]::Write([Convert]::ToBase64String($m.ToArray()));$m.Dispose();$g.Dispose();$b.Dispose()";
  const image = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { windowsHide: true, encoding: "utf8", timeout: 10000 },
  ).trim();
  const result = await inspectImage(
    image,
    "Name the two shapes and their colors in one short sentence.",
    AbortSignal.timeout(120000),
  );
  assert.match(result.text, /red/i);
  assert.match(result.text, /blue/i);
  assert.equal(result.local, true);
  console.log(result.text);
});
