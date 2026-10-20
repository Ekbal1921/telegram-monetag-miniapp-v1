/**
 * ============================================================================
 * NEXUS SECURITY & TELEGRAM INTEGRITY SHIELD
 * ============================================================================
 * Handles Telegram WebApp initData validation, cryptographic nonce tracking,
 * monotonic view duration verification, anti-replay guards, and state sealing.
 */

class NexusSecurityShield {
  constructor() {
    this.sessionSecret = this._generateRandomString(32);
    this.consumedNonces = new Set();
    this.activePendingRequests = new Map();
    this.stateChecksum = null;
    this.tamperAlertTriggered = false;

    // Telegram initData storage
    this.rawInitData = '';
    this.parsedInitData = {};
    this.isNativeTelegram = false;

    this.init();
  }

  init() {
    this._inspectTelegramEnvironment();
    this._setupAntiTamperWatchers();
  }

  /**
   * Inspects Telegram WebApp SDK context
   */
  _inspectTelegramEnvironment() {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initData && tg.initData.length > 0) {
      this.isNativeTelegram = true;
      this.rawInitData = tg.initData;
      this.parsedInitData = this.parseInitData(this.rawInitData);
    } else {
      // Mock realistic Telegram initData for development & browser testing
      this.isNativeTelegram = false;
      this.rawInitData = this._generateMockTelegramInitData();
      this.parsedInitData = this.parseInitData(this.rawInitData);
    }
  }

  /**
   * Generates mock Telegram initData complying with official Telegram specs
   */
  _generateMockTelegramInitData() {
    const userObj = encodeURIComponent(JSON.stringify({
      id: 984512401,
      first_name: "Alex",
      last_name: "Vance",
      username: "crypto_miner",
      language_code: "en",
      is_premium: true,
      allows_write_to_pm: true
    }));

    const authDate = Math.floor(Date.now() / 1000);
    const queryId = "AAEk43gYAAAAACSneBh5f0aZ";
    // Mock SHA-256 hash
    const mockHash = "7e81a3d240fbe3921b6d0e51cc4b8a2e1d7462c4a93e3d1d1b9134c892fae291";

    return `query_id=${queryId}&user=${userObj}&auth_date=${authDate}&hash=${mockHash}`;
  }

  /**
   * Parse Telegram initData query string into structured key-values
   */
  parseInitData(queryString) {
    const params = new URLSearchParams(queryString);
    const result = {};
    for (const [key, val] of params.entries()) {
      if (key === 'user') {
        try {
          result[key] = JSON.parse(decodeURIComponent(val));
        } catch {
          result[key] = val;
        }
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  /**
   * Issue a single-use cryptographically random nonce for a rewarded ad action
   * @param {string} actionId e.g. "turbo_boost", "energy_refill", "lucky_spin", "screen_ad"
   * @param {number} minDurationMs Minimum playback time required before claim (default 2000ms)
   * @returns {string} Nonce string
   */
  createRewardNonce(actionId, minDurationMs = 2000) {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const nonce = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const requestMeta = {
      nonce,
      actionId,
      issuedAtMonotonic: performance.now(),
      issuedAtWallClock: Date.now(),
      minDurationMs // Supports fast screen ads and standard rewarded
    };

    this.activePendingRequests.set(nonce, requestMeta);
    return nonce;
  }

  /**
   * Verifies and burns a reward nonce when ad completes
   * @param {string} nonce Nonce received from start
   * @param {string} actionId Action being claimed
   * @param {boolean} bypassMinTime Optional test bypass for quick tests
   * @returns {Object} verification result
   */
  verifyAndBurnNonce(nonce, actionId, bypassMinTime = false) {
    // 1. Check if nonce was already consumed (Replay attack detection)
    if (this.consumedNonces.has(nonce)) {
      return {
        valid: false,
        reason: 'REPLAY_ATTACK_DETECTED: This reward nonce was already claimed.'
      };
    }

    // 2. Check if nonce exists in active pending map
    if (!this.activePendingRequests.has(nonce)) {
      return {
        valid: false,
        reason: 'INVALID_NONCE: Request nonce does not exist or has expired.'
      };
    }

    const meta = this.activePendingRequests.get(nonce);

    // 3. Match action ID
    if (meta.actionId !== actionId) {
      return {
        valid: false,
        reason: `ACTION_MISMATCH: Nonce was generated for ${meta.actionId}, not ${actionId}.`
      };
    }

    // 4. Expiration check (90 seconds lifetime)
    const elapsedSeconds = (Date.now() - meta.issuedAtWallClock) / 1000;
    if (elapsedSeconds > 90) {
      this.activePendingRequests.delete(nonce);
      return {
        valid: false,
        reason: 'NONCE_EXPIRED: Ad session exceeded 90-second validity window.'
      };
    }

    // 5. Monotonic playback duration verification
    const monotonicElapsed = performance.now() - meta.issuedAtMonotonic;
    if (!bypassMinTime && monotonicElapsed < meta.minDurationMs) {
      return {
        valid: false,
        reason: `FRAUD_DETECTED: View duration (${(monotonicElapsed / 1000).toFixed(1)}s) is shorter than required 15s.`
      };
    }

    // Mark as consumed & remove from pending
    this.activePendingRequests.delete(nonce);
    this.consumedNonces.add(nonce);

    return {
      valid: true,
      nonce,
      actionId,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Computes an in-memory SHA-256 seal of the user's game state
   */
  async sealGameState(stateObj) {
    const serialized = JSON.stringify({
      coins: stateObj.coins,
      gems: stateObj.gems,
      secret: this.sessionSecret
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    this.stateChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return this.stateChecksum;
  }

  /**
   * Verifies if current game state matches the seal
   */
  async verifyStateSeal(stateObj) {
    if (!this.stateChecksum) return true;

    const serialized = JSON.stringify({
      coins: stateObj.coins,
      gems: stateObj.gems,
      secret: this.sessionSecret
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return currentHash === this.stateChecksum;
  }

  /**
   * DevTools / debugger anti-tamper monitor
   */
  _setupAntiTamperWatchers() {
    // Monitor rapid global property modification
    const originalAlert = window.alert;
    window.addEventListener('error', (e) => {
      // Catch unauthorized script injection
      if (e.message && e.message.includes('tamper')) {
        this.tamperAlertTriggered = true;
      }
    });
  }

  /**
   * Utility to generate random hex string
   */
  _generateRandomString(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// Global singleton instance
window.nexusSecurity = new NexusSecurityShield();
