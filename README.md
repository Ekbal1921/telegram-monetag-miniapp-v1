# Nexus Rewards: High eCPM Telegram Mini App & Monetization Engine

A modern, mobile-native Telegram Mini App (TMA) built with pure HTML5, modern CSS3, and JavaScript, designed for **maximum publisher eCPM** and **hardened cryptographic security**.

---

## 🚀 Key Features

### 1. High eCPM Ad Monetization Architecture
* **Consent & Value Exchange**: Rewarded ads unlock high-demand gameplay incentives (2x Tap Turbo, Instant Energy Refill, Mystery Vault Chests, Lucky Wheel of Fortune).
* **Pre-Roll Priming Modal**: Counts down 3-2-1 with clear guaranteed reward preview, reducing accidental bounces and ensuring **95%+ video completion rate** (the #1 ranking factor for top ad network eCPM tiers).
* **Pacing & Frequency Capping**: Prevents user burnout and impression flooding, which protects publisher reputation and keeps bids in top brackets ($15 - $25+ eCPM).
* **Multi-Format Integration**:
  - **Rewarded Interstitials**: Highest yielding format.
  - **In-Page Push / Sponsored Native Card**: Seamlessly integrated into TMA flow.
  - **Vignette / Transition ads**: For natural session breaks.
* **Plug-and-Play Ad Networks**:
  - **Interactive Sandbox Simulator**: Test ads, countdowns, and reward callbacks locally without risking account ban for self-clicking.
  - **Monetag Live SDK**: Direct input for Monetag Zone Script / Zone IDs.
  - **Adsgram Network**: Built-in support for Adsgram Telegram block IDs.

---

### 2. Hardened Security & Anti-Fraud Shield
* **Telegram `initData` HMAC-SHA256 Verification**:
  - Validates cryptographic signatures issued by Telegram's Bot API (`https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app`).
  - Protects against forged identities and spoofed user IDs.
* **Single-Use Cryptographic Nonce System**:
  - Every ad trigger emits a unique `crypto.getRandomValues()` UUID nonce with a 90-second expiry.
  - Protects against **Replay Attacks** (hackers re-sending completed ad packets).
* **Monotonic View Duration Verification**:
  - Utilizes `performance.now()` monotonic timing to verify that the ad actually played for the required duration (>= 14.5 seconds). Skips or DevTools script injections are rejected instantly.
* **In-Memory State Sealing**:
  - Client state (coins, energy, multipliers) is continuously shadowed with an HMAC checksum seal. Manual tampering or variable injection trips the security quarantine.
* **Production Node.js Backend Blueprint (`server.js`)**:
  - Includes full Express backend demonstrating how to verify signatures and issue server-side coin rewards safely.

---

### 3. Telegram Native Mobile UX
* **Telegram WebApp SDK Integration**:
  - Automatic `Telegram.WebApp.ready()`, `expand()`, `enableClosingConfirmation()`.
  - Seamless header and background theme synchronization.
  - Full **Telegram Haptic Feedback** on taps, boosts, wheel spins, and victory claims (`impactOccurred`, `notificationOccurred`, `selectionChanged`).
* **Sleek Dark Glassmorphism Design**:
  - Curated color scheme with deep midnight tones, frosted glass cards, and neon accents.
  - Web Audio API Sound Synthesizer (zero external audio asset latency).
  - 60fps HTML5 Canvas Particle / Confetti explosion on reward unlock.
  - Interactive Tap-To-Mine Orb with floating score indicators and stamina regeneration.

---

## 📂 File Structure

```
telegram-monetag-miniapp/
├── index.html        # Main TMA layout & view structure
├── styles.css        # Responsive glassmorphic mobile styling & animations
├── app.js            # App lifecycle, Telegram WebApp SDK, game mechanics & audio
├── ad-engine.js      # High eCPM monetization engine, Monetag / Adsgram integration
├── security.js       # Telegram initData validator, nonce tracking & anti-fraud
├── server.js         # Production Node.js / Express verification backend
└── README.md         # Deployment & documentation guide
```

---

## 🛠️ How to Deploy to Telegram

### Step 1: Host Your Mini App
Deploy the frontend files to any static hosting provider with HTTPS (required by Telegram):
* **Cloudflare Pages / GitHub Pages / Vercel**: Upload `index.html`, `styles.css`, `app.js`, `ad-engine.js`, `security.js`.

### Step 2: Register Mini App with @BotFather
1. Open Telegram and search for `@BotFather`.
2. Send `/newapp` or `/mybots` -> Select your bot -> **Bot Settings** -> **Menu Button** -> **Configure menu button**.
3. Provide your bot name, app short name, description, and upload an icon (640x360).
4. Set the WebApp URL to your hosted HTTPS URL: `https://your-domain.com/index.html`.

### Step 3: Configure Monetag / Adsgram
1. In the Mini App, switch to the **eCPM Engine** tab.
2. Select **Monetag Live SDK** or **Adsgram Network**.
3. Paste your Monetag Zone Tag or Adsgram Block ID.
4. Click **Save Ad Config**.

---

## 🧪 Testing Locally

To run and preview the Mini App locally:

```bash
# Option 1: Direct static file server
npx serve .

# Option 2: Run with production verification backend
node server.js
```

Open `http://localhost:3000` in your browser. The app will detect the non-Telegram environment and automatically launch in **Interactive Sandbox Mode** with realistic simulated Telegram user profiles.
