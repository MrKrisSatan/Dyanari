import { spawn } from "node:child_process";
// Fixed PowerShell programs; user text is passed only as JSON through stdin.
function speech(script, input, signal, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(
          "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; " +
            script,
          "utf16le",
        ).toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const timer = setTimeout(() => child.kill(), timeout);
    let out = "",
      err = "";
    const stop = () => child.kill();
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (code !== 0)
        return reject(Error(err || "Speech cancelled or timed out"));
      resolve(out.trim());
    });
    child.stdin.end(JSON.stringify(input));
  });
}
export async function voices(signal) {
  const text = await speech(
    "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $v=@($s.GetInstalledVoices() | ForEach-Object { @{name=$_.VoiceInfo.Name;culture=$_.VoiceInfo.Culture.Name;gender=$_.VoiceInfo.Gender.ToString()} }); ConvertTo-Json -Compress -InputObject $v } finally { $s.Dispose() }",
    {},
    signal,
  );
  return JSON.parse(text);
}
export async function synthesise(text, voice, signal) {
  if (typeof text !== "string" || !text.trim() || text.length > 6000)
    throw Error("Speech requires 1–6000 characters");
  const v = await speech(
    "$i=[Console]::In.ReadToEnd() | ConvertFrom-Json; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $m=New-Object System.IO.MemoryStream; try { if($i.voice){$s.SelectVoice($i.voice)}; $s.SetOutputToWaveStream($m); $s.Speak([string]$i.text); [Console]::Out.Write([Convert]::ToBase64String($m.ToArray())) } finally { $s.Dispose(); $m.Dispose() }",
    { text, voice },
    signal,
  );
  return Buffer.from(v, "base64");
}
export async function recognise(signal) {
  const text = await speech(
    "$engines=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers(); $chosen=$engines | Where-Object {$_.Culture.Name -eq 'en-GB'} | Select-Object -First 1; if(!$chosen){throw 'British English speech recognizer is not installed'}; $r=New-Object System.Speech.Recognition.SpeechRecognitionEngine($chosen); try {$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $r.SetInputToDefaultAudioDevice(); $r.InitialSilenceTimeout=[TimeSpan]::FromSeconds(8); $r.EndSilenceTimeout=[TimeSpan]::FromSeconds(1); $v=$r.Recognize([TimeSpan]::FromSeconds(15)); if($v){[Console]::Out.Write($v.Text)}} finally {$r.Dispose()}",
    {},
    signal,
    22000,
  );
  return { text };
}
