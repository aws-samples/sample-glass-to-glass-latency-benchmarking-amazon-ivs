# Amazon IVS Glass-to-Glass Latency Benchmarking

A web tool for measuring true glass-to-glass latency — camera capture to viewer display — on an Amazon IVS Real-Time Streaming (Stages) deployment.

Most latency figures you can gather from a browser measure a network round trip or an SDK-reported statistic. This tool measures the thing users actually perceive: the publisher burns a millisecond timestamp and a QR code of the same value into every video frame, and the viewer decodes that QR out of the received video and subtracts it from its own clock. What you get back is the complete pipeline cost — capture, overlay, encode, upload, transit through IVS, download, jitter buffer, decode, and paint — reported as avg / p50 / p95 with CSV export for offline analysis.

Alongside the latency meter, the viewer exposes simulcast layer selection, manual layer pinning, and live WebRTC receive statistics, so you can correlate a latency change with the bitrate, jitter, or packet loss that caused it.

This is a benchmarking and diagnostic tool, not a production reference architecture. It was extracted from the [Amazon IVS Real-Time Streaming Web Demo](https://github.com/aws-samples/amazon-ivs-real-time-for-web-demo), with everything unrelated to latency measurement removed.

> **Disclaimer:** This tool creates AWS resources that incur cost. Amazon IVS Real-Time Streaming bills per participant-minute, so a stage with a publisher and a viewer accrues charges while connected. Review [Amazon IVS pricing](https://aws.amazon.com/ivs/pricing/) and follow the [Cleanup](#cleanup) steps when you are done.

## How the measurement works

Two files do the actual work.

**Publisher side — `src/utils/timecodeTrack.js`.** `withTimecode()` takes the raw camera track and draws each frame onto a canvas, overlaying `Date.now()` as monospace digits plus a QR encoding the same value, then re-captures the canvas with `captureStream(fps)`. The wrapped track is what gets published, so the timestamp is carried *inside the pixels* through the entire encode and delivery path. It cannot be short-circuited by a metadata channel or a clock estimate.

**Viewer side — `src/components/G2GMeter.vue`.** The meter samples the `<video>` element at 10 Hz, draws only the top-left 40% region into an offscreen canvas (the QR's location, and a large `getImageData` saving), and runs `jsqr` over it. Each newly decoded value yields one sample of `Date.now() - decoded`, gated to 0–30000 ms to discard misreads. Statistics come from a 200-sample ring buffer.

Because one machine writes the timestamp and another subtracts it, **the two system clocks are part of the instrument.** NTP drift between the machines lands directly in the result, so a negative or implausibly low reading means drift rather than low latency. See [Prerequisites](#prerequisites).

## Architecture

The tool is a frontend-only Vue 3 single-page application. It has no server of its own: it depends on the [Amazon IVS Real-Time Serverless Demo](https://github.com/aws-samples/amazon-ivs-real-time-serverless-demo) backend to create stages and mint participant tokens.

```
┌─────────────────────────────┐                      ┌─────────────────────────────┐
│  PUBLISHER  (location A)    │                      │  VIEWER  (location B)       │
│                             │                      │                             │
│  /host/:hostId              │                      │  /watch/:hostId             │
│  camera or screen capture   │                      │  G2GMeter: QR decode @10Hz  │
│  timecodeTrack: burn ts+QR  │                      │  avg / p50 / p95 + CSV      │
│  LocalStageStream           │                      │  layer pin + receive stats  │
└──────┬───────────────┬──────┘                      └──────┬───────────────┬──────┘
       │               │                                    │               │
       │ 1. token      │ 2. publish                         │ 2. subscribe  │ 1. token
       │    (HTTPS)    │    (WebRTC)                        │    (WebRTC)   │    (HTTPS)
       │               │                                    │               │
       │               ▼                                    ▼               │
       │        ┌───────────────────────────────────────────────────┐       │
       │        │      Amazon IVS Real-Time data plane              │       │
       │        │      GLOBAL — ingests near the publisher,         │       │
       │        │      viewers subscribe from anywhere              │       │
       │        └───────────────────────────────────────────────────┘       │
       │                              ▲                                     │
       ▼                              │ creates stages,                     ▼
┌──────────────────────────────┐      │ mints tokens        ┌──────────────────────────┐
│  Serverless demo backend     │      │                     │  (same backend, shared) │
│  REGIONAL                    │──────┘                     └──────────────────────────┘
│  CloudFront → API Gateway    │
│  → Lambda → DynamoDB         │
│  → IVS Real-Time API         │
└──────────────────────────────┘
```

### Control plane vs data plane

This distinction is the single most important thing to understand before trusting a number this tool reports.

| | Control plane | Data plane |
|---|---|---|
| **Carries** | Stage creation, participant tokens, stage listing | Audio and video |
| **Scope** | Regional — the region you deployed the backend to | Global |
| **Endpoint** | `https://<domainId>.cloudfront.net` → API Gateway/Lambda → regional IVS API | IVS real-time infrastructure, reached directly by the SDK |
| **In this app** | The four `axios` calls in `src/composables/useBackend.js` | `new Stage(token, strategy)` in `src/stores/stage.js` |
| **Inside the measurement?** | **No** — happens once at page load, before sampling starts | **Yes** — this is what the meter measures |

AWS documents IVS as a global data plane with a regional control plane: streaming and viewing are global, video is ingested at a location near the publisher, and whichever region a stage was created in, you can stream from anywhere and viewers can watch from anywhere. The console, API, and stage resources are regional. *(Rephrased from AWS documentation for licensing compliance.)*

The practical consequence: **your backend's region does not need to sit geographically between your two test locations.** It determines where the stage record lives and where tokens are minted, costing one HTTPS round trip at join time, outside the measurement window. Participant geography is what drives the latency figure.

Sources: [What is Amazon IVS Real-Time Streaming?](https://docs.aws.amazon.com/ivs/latest/RealTimeUserGuide/what-is.html) (see "Global Solution, Regional Control") and the [IVS Real-Time Streaming User Guide (PDF)](https://docs.aws.amazon.com/pdfs/ivs/latest/RealTimeUserGuide/ivs-real-time-ug.pdf).

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Launcher — enter a Host ID, open the host or viewer page |
| `/settings` | Backend credentials (Domain ID + API key), persisted to `localStorage` |
| `/host/:hostId` | Publisher, with a panel for source, capture resolution/fps, max bitrate, max framerate, simulcast, content hint, and the timecode overlay |
| `/watch/:hostId` | Viewer, with the latency meter, adaptive-bitrate panel, layer pinning, and live receive stats |
| `/obs` | Generates the AWS CLI commands and OBS WHIP settings for publishing from OBS instead of a browser |

`/host/:hostId` and `/watch/:hostId` require backend credentials and redirect to `/settings` without them. The original demo's `/g2g/*` URLs redirect to their equivalents here.

### Project structure

```
src/
├── components/G2GMeter.vue      # Viewer-side QR decode, latency stats, CSV export
├── utils/
│   ├── timecodeTrack.js         # Publisher-side timestamp + QR burn-in
│   ├── StageStrategy.js         # IVS Stage strategy; layer pinning hook
│   ├── stage.js                 # Participant helpers
│   └── backend.js               # Domain ID → API URL
├── stores/
│   ├── stage.js                 # Stage lifecycle, participants, connection state
│   ├── backend.js               # Credentials (persisted), tokens, stage list
│   └── usernameStore.js         # Participant identity
├── composables/useBackend.js    # The only HTTP calls in the app
├── views/
│   ├── Launcher.vue             # Host ID entry
│   ├── Host.vue                 # Publisher + encoder controls
│   ├── Watch.vue                # Viewer + meter + ABR panel + stats
│   ├── Settings.vue             # Credential entry and connection test
│   └── ObsAdmin.vue             # WHIP/OBS setup helper
└── router/index.js              # Routes + credential guard
```

### Technology

Vue 3 (Composition API), Vite, Pinia with `pinia-plugin-persistedstate`, Vue Router, Tailwind CSS, [`amazon-ivs-web-broadcast`](https://www.npmjs.com/package/amazon-ivs-web-broadcast) for Stages, `qrcode` for encoding, `jsqr` for decoding, `axios` for the backend calls.

## Prerequisites

- An AWS account with permissions to deploy IVS, Lambda, API Gateway, DynamoDB, and IAM resources
- Node.js 18 or later
- A Chromium-based browser on both ends (Chrome, Edge, Brave). Firefox does not support simulcast, and the publisher will fall back to a single layer.
- Two machines with cameras, one per location you want to measure
- **Both machines' clocks synced via NTP.** This is not optional — the measurement subtracts one machine's clock from another's. macOS syncs by default; on Linux run `sudo timedatectl set-ntp true`; on Windows confirm "Set time automatically" is enabled.

## Deployment

### Step 1: Deploy the backend

1. Open [github.com/aws-samples/amazon-ivs-real-time-serverless-demo](https://github.com/aws-samples/amazon-ivs-real-time-serverless-demo).
2. In the **One-click deploy** section, choose **Launch Stack** for a region near your publisher (for example `eu-central-1` for a Europe-based test). Any region works — see [Control plane vs data plane](#control-plane-vs-data-plane) for why the choice does not bias your results.
3. Accept the defaults, check the IAM acknowledgment, and submit. Deployment takes 5–10 minutes.
4. When the stack reaches `CREATE_COMPLETE`, open the **Outputs** tab and collect:
   - `domainName` — for example `d0abcdefghijk.cloudfront.net`. The leading segment (`d0abcdefghijk`) is your **Domain ID**.
   - `secretUrl` — open it, choose **Retrieve secret value**, and copy the **`apiKey`**.

### Step 2: Install and run locally

```bash
cd amazon-ivs-g2g-latency-benchmarking
npm install
npm run dev
```

Camera and screen capture require a secure context. `localhost` qualifies, so `npm run dev` is sufficient when you are driving both roles from one machine.

To reach the app from a second device on your network, you need real HTTPS:

```bash
npm run dev:https -- --host
```

This enables `vite-plugin-mkcert`, which installs a locally-trusted CA on first run and therefore prompts once for your sudo password. Note both URLs Vite prints: the localhost one for this machine, and the LAN one (for example `https://192.168.1.42:5173`) for the second device.

### Step 3: Connect the backend

Open `/settings`, paste the **Domain ID** and **API key** from Step 1, and choose **Save and test**. A successful test reports how many stages are currently live.

Credentials are stored in that browser's `localStorage` and are sent only to your own backend. **Every machine taking part needs them entered locally**, publisher and viewers alike.

### Step 4: Host the app for a cross-region test (optional)

For a genuine multi-region measurement, the remote viewer needs to load the app too. Either:

- **Static hosting (recommended).** Run `npm run build` and serve `dist/` from S3 + CloudFront or AWS Amplify Hosting. Configure the host to rewrite unknown paths to `/index.html`, otherwise a hard load of `/watch/:hostId` returns 404.
- **Tunnel.** `cloudflared tunnel --url https://localhost:5173` or `ngrok http 5173`. Quick for ad-hoc runs, though it adds a hop in front of the app (not in front of the media).

## Running a benchmark

### Start the publisher

1. Open `/host/<hostId>`, using any unique identifier (for example `dealer-1`).
2. Suggested starting configuration:

   | Setting | Value |
   |---|---|
   | Source | Camera |
   | Capture | 1280x720 @ 30 |
   | Max bitrate | 2500 kbps (the Stage SDK ceiling) |
   | Max framerate | 30 |
   | Simulcast | On — publishes 180p / 360p / 720p layers |
   | Content hint | Default for camera; `text` for slides or a terminal |
   | Burn timestamp + QR | On — **required** for measurement |

3. Choose **Apply**. The preview should show your camera with a green timestamp and QR in the top-left, and the header should read `stage: connected`.

Changing the source applies immediately; the other settings take effect on **Apply**. Simulcast is unavailable for screen capture, in Firefox, and below 700 kbps — the panel tells you when it falls back to a single layer.

### Open the viewer

1. Enter the same credentials at `/settings` on the viewer machine.
2. Open `/watch/<hostId>` with the matching Host ID.
3. Set the **location** field in the header (for example `lagos`). It persists, and labels the CSV rows and filename.
4. Within a few seconds you should see the video, a green latency badge over it, and the side panel populating with `mode = auto (SDK)`, a selected layer, and live stats.

### Read the numbers

| Field | What it tells you |
|------|-------------------|
| **avg / p50 / p95** (video overlay) | Glass-to-glass latency, burned in at capture and decoded at display. Requires synced clocks. |
| **Download CSV** | The raw sample buffer as `timestamp_ms,latency_ms,label` — the last 200 samples at 10 Hz. |
| **Adaptive bitrate → mode** | `auto (SDK)` means the SDK is selecting layers; `manual` means you pinned one. |
| **Adaptive bitrate → selected** | Which simulcast layer is arriving. `720p` → `360p` → `180p` transitions show ABR reacting. |
| **reason** | The SDK's reason for the last layer change, for example `BANDWIDTH_LIMITED`. |
| **Receive stats → bitrate** | Live throughput. A drop means either a layer change or encoder backoff. |
| **Receive stats → jitter / packet loss** | Network health. p95 latency tracks these closely on lossy paths. |
| **Receive stats → nack/pli** | Retransmission and full-frame request counters. Spikes indicate lost reference frames. |

Reference figures for a Europe → West Africa path (publisher in Bucharest, stage in `eu-central-1`, viewer in Lagos), both ends on stable Wi-Fi, simulcast on, 720p:

| Metric | Typical | Investigate |
|--------|---------|------|
| p50 glass-to-glass | 250–350 ms | > 600 ms |
| p95 glass-to-glass | 350–500 ms | > 1000 ms |
| Receive bitrate, top layer | 1500–2500 kbps | < 800 kbps sustained |
| Packet loss | < 1% | > 3% |
| Selected layer | `720p` | drops to `180p` and stays |

Expect this figure to read meaningfully higher than a `ping` between the two locations. It is a full pipeline measurement, not a network round trip.

### Stress-test the link (optional)

Chrome DevTools network throttling does **not** affect WebRTC traffic. To shape the link for real:

- **macOS** — Network Link Conditioner, from "Additional Tools for Xcode". Choose a profile or set a custom downlink around 500 kbps.
- **Linux** — `sudo tc qdisc add dev <iface> root netem rate 500kbit delay 80ms loss 1%`, removed with `sudo tc qdisc del dev <iface> root`.
- **Windows** — [`clumsy`](https://jagt.github.io/clumsy/).
- **Ground truth** — `chrome://webrtc-internals` for raw RTP statistics, graphs, and the selected ICE candidate pair.

ABR is reactive rather than predictive: sustained congestion over 5–15 seconds is what triggers a layer step-down.

## Publishing from OBS

`/obs` walks through creating an IVS `IngestConfiguration` for WHIP ingest and produces the OBS Server URL and Bearer Token, along with the CLI command to delete the resource afterwards.

One caveat: the browser publisher burns the timestamp overlay itself, and OBS does not. To measure latency from OBS you must supply the overlay — add a Browser Source pointing at a local HTML file that renders `Date.now()` as text plus a QR of the same value in the top-left of the canvas, so the viewer's meter can decode it. Without that overlay the viewer will show video but report no latency.

## Troubleshooting

| Symptom | Cause | Fix |
|--------|-------|-----|
| Latency badge stays at 0, no samples accumulate | The viewer cannot decode the QR — low pinned layer, overlay disabled, or QR out of frame | Pin a higher layer; confirm "Burn timestamp + QR" is on at the publisher |
| Numbers implausibly low or negative | Clock drift between the machines | Re-sync NTP: `sudo sntp -sS time.apple.com` (macOS), `sudo chronyc -a makestep` (Linux) |
| "No simulcast layers reported yet" | Publisher fell back to a single layer — screen source, Firefox, or bitrate below 700 kbps | Use the camera source at ≥ 700 kbps in a Chromium browser |
| 720p never selected on a fast link | Probing incomplete, or downlink genuinely below the top layer's bitrate | Wait 10–15 s after **Apply**; check `availableOutgoingBitrate` in `chrome://webrtc-internals` |
| Redirected to `/settings` opening host or watch | No backend credentials in this browser | Enter the Domain ID and API key; the requested page opens after a successful test |
| Stage never connects | UDP blocked at the network edge, common on corporate and hotel networks | Try a mobile hotspot. The SDK can fall back to TURN over TCP/443, at higher latency |
| Camera blocked on the LAN URL | Not a secure context | Use `npm run dev:https -- --host` and accept the mkcert certificate |

## Cleanup

Amazon IVS Real-Time Streaming bills per participant-minute, so leaving a stage connected continues to accrue cost.

1. Close the host and watch tabs, which leaves the stage and stops participant billing.
2. Stop the dev server with `Ctrl+C`.
3. Delete any IVS `IngestConfiguration` created for OBS — `/obs` generates the command.
4. Remove the static site if you deployed one (CloudFront distribution and S3 bucket, or the Amplify app).
5. Delete the backend CloudFormation stack from its region. Stages created through it are cleaned up as their backend records expire.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for information about reporting security issues.

A note on how this tool handles credentials: the Domain ID and API key are held in browser `localStorage` and attached to requests to your own backend. That is appropriate for a benchmarking tool you run yourself, and is not a pattern to carry into production. If you host the app at a public URL, anyone who reaches it can enter their own credentials, but cannot read yours — and you should not enter production credentials into a publicly hosted build.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
