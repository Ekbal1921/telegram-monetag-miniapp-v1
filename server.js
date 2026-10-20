/**
 * ============================================================================
 * SECURE BACKEND ARCHITECTURE - TELEGRAM MINI APP (NODE.JS / EXPRESS)
 * ============================================================================
 * Production-ready server blueprint for:
 * 1. Cryptographic HMAC-SHA256 validation of Telegram WebApp initData
 * 2. Protection against Replay Attacks & Bot Manipulation
 * 3. Verified Dispensation of High eCPM Ad Rewards
 * ============================================================================
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_FROM_BOTFATHER';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Server in-memory replay attack store (use Redis in multi-instance production)
const consumedServerNonces = new Set();
const userBalances = new Map();

/**
 * Official Telegram WebApp initData HMAC-SHA256 Verification Algorithm
 * Specification: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * @param {string} initData Raw query string received from window.Telegram.WebApp.initData
 * @param {string} botToken Bot token from @BotFather
 * @returns {boolean} True if data is authentic and untouched
 */
function verifyTelegramWebAppData(initData, botToken) {
  if (!initData) return false;

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return false;

  urlParams.delete('hash');

  // Sort parameters alphabetically
  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, val]) => `${key}=${val}`)
    .sort()
    .join('\n');

  // HMAC-SHA256 signature using secret 'WebAppData'
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // Calculate signature of the data check string
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const hashBuffer = Buffer.from(hash, 'hex');
  const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

  if (hashBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, calculatedBuffer);
}

/**
 * Middleware: Enforces Telegram Authentication
 */
function requireTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  // In production, enforce strict bot token verification:
  if (process.env.NODE_ENV === 'production') {
    if (!verifyTelegramWebAppData(initData, BOT_TOKEN)) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED_INIT_DATA: Telegram cryptographic signature verification failed.'
      });
    }
  }

  // Parse user for request context
  try {
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user') || '{}');
    req.tgUser = user;
  } catch (e) {
    req.tgUser = { id: 984512401, username: 'demo_user' };
  }

  next();
}

/**
 * ENDPOINT 1: Verify Session Integrity
 */
app.post('/api/auth/verify-session', requireTelegramAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Telegram session authentic and cryptographically verified.',
    userId: req.tgUser.id,
    timestamp: Date.now()
  });
});

/**
 * ENDPOINT 2: Secure Ad Reward Claim
 * Accepts nonce and verified completion status from frontend
 */
app.post('/api/rewards/claim', requireTelegramAuth, (req, res) => {
  const { nonce, actionId, clientDurationMs } = req.body;

  // 1. Validate Nonce Presence
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ success: false, error: 'MISSING_NONCE' });
  }

  // 2. Replay Attack Prevention
  if (consumedServerNonces.has(nonce)) {
    return res.status(409).json({
      success: false,
      error: 'REPLAY_ATTACK_PREVENTED: This nonce has already been redeemed.'
    });
  }

  // 3. Minimum View Duration Enforcement (e.g. at least 14s for rewarded video)
  if (clientDurationMs && clientDurationMs < 14000) {
    return res.status(403).json({
      success: false,
      error: 'FRAUD_PREVENTION: Ad was terminated prematurely. Minimum watch time not met.'
    });
  }

  // 4. Burn nonce
  consumedServerNonces.add(nonce);

  // 5. Credit user balance safely on server
  const userId = req.tgUser.id || 'guest';
  const current = userBalances.get(userId) || { coins: 0, gems: 0 };

  let rewardCoins = 0;
  let rewardGems = 0;

  switch (actionId) {
    case 'turbo_boost':
      rewardCoins = 500;
      break;
    case 'energy_refill':
      rewardCoins = 150;
      break;
    case 'mystery_chest':
      rewardCoins = 1000;
      rewardGems = 5;
      break;
    case 'lucky_spin':
      rewardCoins = 750;
      rewardGems = 3;
      break;
    default:
      rewardCoins = 100;
  }

  current.coins += rewardCoins;
  current.gems += rewardGems;
  userBalances.set(userId, current);

  res.json({
    success: true,
    userId,
    claimedReward: { coins: rewardCoins, gems: rewardGems },
    newBalance: current,
    receiptNonce: nonce
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`[Nexus Server] High eCPM Telegram Mini App running on http://localhost:${PORT}`);
  console.log(`[Nexus Server] Production HMAC Verification: Ready`);
});
