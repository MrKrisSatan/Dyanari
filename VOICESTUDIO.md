# Dyanari and VoiceStudio

Dyanari's voice integration uses the actual local VoiceStudio API, with the full upstream web studio for design, cloning, dubbing, transcription, narration, audiobooks, models and engine management. The advanced studio is a separate application opened in your default browser. Its features and models retain their upstream requirements; Dyanari does not claim every optional engine was tested.

## Install and use

In Local services, enable VoiceStudio and Internet for setup. The Install / repair button installs the pinned backend and full web studio in `%USERPROFILE%\.dyanari\voicestudio`. Allow several GB disk space. It uses isolated Python and frozen uv/Bun dependency locks; lifecycle scripts are disabled for web dependencies. Your system Python is unchanged. Setup progress is in `<Dyanari data>/voicestudio/setup.log`.

Tick model terms only if you have reviewed and may accept the [OmniVoice weight terms](https://huggingface.co/k2-fsa/OmniVoice/blob/c5fdb5ccb189668d56333f77ba2629f4cd7535f4/README.md) and [Higgs Audio 2 / Meta Llama 3 tokenizer terms](https://huggingface.co/k2-fsa/OmniVoice/blob/c5fdb5ccb189668d56333f77ba2629f4cd7535f4/audio_tokenizer/LICENSE). This is for authorised personal noncommercial use. Public installers never pre-accept them or redistribute the weights. The checkbox explicitly downloads the pinned model and records acceptance locally, including the tokenizer component. Other models retain their own terms and consent controls in the full studio.

Start the installed service, refresh status, then Create Dyanari's British voice and Preview saved identity. Select VoiceStudio as speech provider. Speak / Speak last reply / Read replies aloud use the selected identity. The service starts again on app launch when this provider remains enabled. Choose Windows speech to return to the previous fallback. CLI equivalent:

```powershell
.\setup-voicestudio.ps1 -DownloadVoiceModel -AcceptNoncommercialTerms
```

Use `-Data <actual Dyanari data directory>` when running manually for an installed/shared profile. The in-app setup passes this automatically. Without model consent, setup installs only the runtime/studio. Voice setup also downloads the MIT-licensed Systran/faster-whisper-base model at revision ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66 for reviewed local transcription. Installed app data normally lives in `%LOCALAPPDATA%\Dyanari\data`; portable builds use `data` beside the executable.

## Dyanari — British Velvet

The current design is a mature adult British female voice, low pitched and fully voiced, at 0.94 speed. It removes the whisper attribute, uses a new seed (424243) and saves a separate identity sample. The description aims for a warm, husky, confident British Jessica Rabbit character style; it does not clone an actor. OmniVoice accepts only a limited attribute vocabulary, so subjective timbre and acting style need audition/refinement in the full studio. The previous Velvet British whisper profile is preserved and can still be selected.

The selected profile id, engine and speed are SQLite settings independent of the chat model. VoiceStudio profiles, samples and history reside separately in `<Dyanari data>/voicestudio`; voice-runtime/model cache is separate. Memory/chat JSON backups do not include these large voice assets. Back up the voice data directory as well when moving computers.

## Runtime and privacy

The managed service binds loopback, uses CPU to avoid competing for this machine's 8 GB GPU, and starts with Hugging Face/Transformers offline flags plus an exact local checkpoint path. Enable Internet only while installing dependencies/models; it can be OFF for subsequent managed speech. CPU cold start and first rendering can take several minutes. The connector permits only fixed API operations and numeric loopback ports, rejects redirects, limits audio/text/results and times out requests. There is no cloud speech fallback.

Stop speech / Stop all terminates a service Dyanari started and its process tree. Disabling VoiceStudio does likewise; revoking Internet stops a running managed setup. Existing external VoiceStudio services are not killed: cancellation stops Dyanari's request, but upstream compute may continue. Stop those jobs in their own studio. Advanced studio actions and optional engines have their own networking/history/permissions; Dyanari's Internet switch is not an OS firewall. Do not run two independent studios against the same voice data directory.

Private-session speech is rejected for VoiceStudio because an independently managed studio may retain its own records; select Windows speech for that session. Transcription accepts only an explicitly chosen short WAV, displays the result for review and does not submit chat automatically. It does not activate the microphone. Live microphone/device selection remains a separate unfinished task.

## Sources and licensing

Upstream: [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio), AGPL-3.0-only, source revision `5bfbda36886e8555317eb2f5816784ccad28f42c` (0.5.7). The optional setup fetches an integrity-verified source archive including its licence/notices; VoiceStudio stays a separate local service. Runtime pins: uv 0.13.6, Bun 1.4.2, upstream uv.lock/bun.lock, OmniVoice revision `c5fdb5ccb189668d56333f77ba2629f4cd7535f4`. Model weights and output have their own terms. No real person's voice is cloned to create Dyanari's design.
