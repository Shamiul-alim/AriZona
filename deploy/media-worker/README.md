# AniZora Media Worker

This folder installs the helper that finds the audio languages and subtitles
inside your video files and adds them to the player.

You set it up **once**. After that, adding an episode is:

> Admin → Episode → upload your 1080p, 720p, 480p, 360p → **Save**

Nothing else, ever, per episode. Your video files are used exactly as you
prepared them — nothing is re-encoded.

---

## What this is, in one paragraph

AniZora runs on the internet: the website, the API, the database and the video
storage are all hosted. The one thing that cannot run there is opening your
video files to look inside them — that needs a tool called FFmpeg and a few
minutes per episode, which no free hosting plan allows. So that one job runs on
a machine you already own. It has no website, no password, no port open to the
internet. It quietly asks AniZora "anything to do?", and when there is, it
reads one of your files, pulls out the audio languages and subtitles, and adds
them to the player.

---

## What you need

| | |
| --- | --- |
| A machine | Windows 10/11, or Linux. A desktop, laptop, mini PC or NAS is fine. |
| Processor | 2 cores is comfortable; 1 works. |
| Memory | 2 GB. |
| Free disk | 5 GB of spare space. |
| Internet | Ordinary broadband. No fixed IP, no router changes. |
| Docker | Free. Installed once — the instructions below say how. |

You do **not** need FFmpeg, Node.js, Git, a credit card, or any paid service.
FFmpeg is already inside the worker.

It is a light job. The machine spends most of it downloading one file; it does
not sit at full tilt for an hour the way video conversion would.

The machine does not need to be on all the time. See
[When the machine is off](#when-the-machine-is-off).

---

## Windows setup

**1. Install Docker Desktop** — <https://www.docker.com/products/docker-desktop/>

During installation leave **"Start Docker Desktop when you log in"** ticked.
That is what makes the worker come back after a reboot. If you have already
installed it, turn the setting on under **Settings → General**.

**2. Open PowerShell in the `windows` folder** — open the folder in File
Explorer, then **File → Open Windows PowerShell**.

**3. Run the installer**

```powershell
.\install-worker.ps1
```

It asks for the API address, the worker token, and three Google Drive values.
Whoever handed AniZora to you provides these. Nothing you type is shown on
screen or saved to your command history. (It also offers an optional
service-account key — press Enter to skip it unless you were given one.)

The installer then builds the worker, checks every credential actually works,
and starts it.

> If PowerShell refuses to run the script, allow it for this window only:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

That is the whole setup.

---

## Linux setup

**1. Install Docker**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out and back in
sudo systemctl enable --now docker # so it starts with the machine
```

**2. Run the installer**

```bash
cd linux
./install-worker.sh
```

Same questions, same checks, same result.

---

## Everyday commands

You will rarely need these. Run them from the `windows` or `linux` folder.

| What you want | Windows | Linux |
| --- | --- | --- |
| Is it working? | `.\status-worker.ps1` | `./status-worker.sh` |
| Watch what it's doing | `.\logs-worker.ps1` | `./logs-worker.sh` |
| Stop it | `.\stop-worker.ps1` | `./stop-worker.sh` |
| Start it | `.\start-worker.ps1` | `./start-worker.sh` |
| Update it | `.\update-worker.ps1` | `./update-worker.sh` |
| Remove it | `.\uninstall-worker.ps1` | `./uninstall-worker.sh` |

`status` prints something like:

```
AniZora Media Worker
---------------------
Container:      Running
Uptime:         3 days
Backend:        Reachable
Authentication: OK
Last activity:  12 sec ago
Current job:    None (watching the queue)
```

or, while it is busy:

```
Current job:
  Solo Leveling S1E2
  720p - encoding
```

The admin panel shows the same thing, so you do not need to be at this machine
to know whether it is running.

---

## When the machine is off

Nothing breaks, nothing is lost, and **your episodes still play**.

- Uploading the quality files still works, and viewers can watch them
  immediately.
- Only the audio and subtitle detection waits.
- The admin panel says *worker offline — processing will begin automatically
  when a worker comes online*.
- Next time this machine starts, Docker starts, the worker starts, and it picks
  up everything waiting.

No re-saving, no re-uploading, no commands.

The same is true if the worker is stopped mid-encode: it re-claims the job
later, keeps the parts it already finished and continues from there.

---

## Moving to another machine

The worker keeps nothing that matters. Everything permanent lives in AniZora's
database and Google Drive.

1. On the old machine: `.\uninstall-worker.ps1` (or `./uninstall-worker.sh`).
2. On the new machine: install Docker, run the installer, give it the same
   answers.

Anything queued is picked up by the new machine. No export, no import, no
rebuilding the library.

---

## Security

The worker makes outbound connections to two places: the AniZora API and Google
APIs. Nothing connects **to** it. No port forwarding, no public address, no
firewall rule.

Its token authorises exactly five things — list jobs, claim one, report
progress, register the result, finish. It cannot read users, change the
catalogue or delete anything.

`.env.worker` holds live credentials. The installer restricts it to your
account. Do not copy it into a shared folder, email it, or commit it anywhere.

---

## If something is wrong

Run `status` first — it usually names the problem.

**"Docker is not running"** — start Docker Desktop and wait for the whale icon
in the system tray to stop animating.

**"Authentication: Rejected"** — the token here does not match the one in the
AniZora backend. Re-run the installer to re-enter it.

**"Backend: Unreachable"** — check this machine's internet. The worker keeps
retrying on its own; nothing is lost.

**"Container: exited"** — `logs` shows why. The most common cause is running out
of disk space, which the worker refuses to start a job without.

**A job says FAILED** — the admin panel shows the reason. Fixing the cause is
enough; the worker retries on its own.

Deeper detail, including how the pipeline works, is in
[`docs/MEDIA_WORKER_DEPLOYMENT.md`](../../docs/MEDIA_WORKER_DEPLOYMENT.md).
