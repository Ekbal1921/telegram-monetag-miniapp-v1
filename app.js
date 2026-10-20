/**
 * ============================================================================
 * NEXUS REWARDS - TELEGRAM MINI APP CONTROLLER
 * ============================================================================
 * Main UI navigation, Telegram WebApp lifecycle, interactive tap miner,
 * canvas confetti particles, audio synthesizer, and reward handling.
 */

class NexusApp {
  constructor() {
    this.state = {
      coins: 1250,
      gems: 14,
      energy: 80,
      maxEnergy: 100,
      multiplier: 1,
      multiplierExpiresAt: 0,
      streakDay: 4
    };

    this.withdrawAdsWatched = 0;
    this.withdrawAdsRequired = 5;

    this.activeView = 'viewEarn';
    this.particleCanvas = null;
    this.particleCtx = null;
    this.particles = [];
    this.audioCtx = null;

    this.init();
  }

  async init() {
    this._initTelegramSDK();
    this._initUserContext();
    this._initAudio();
    this._initParticles();
    this._initNavigation();
    this._initMiningOrb();
    this._initAdVaultActions();
    this._initMonetagModal();
    this._initWithdrawModal();
    this._initWheelOfFortune();
    this._initSecurityView();
    this._initAdConfigUI();
    this._startPassiveEnergyLoop();

    // Seal initial state
    await window.nexusSecurity.sealGameState(this.state);
    this.updateBalanceUI();
  }

  /**
   * Telegram WebApp Initialization
   */
  _initTelegramSDK() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }

      // Sync header and theme colors
      if (tg.setHeaderColor) {
        tg.setHeaderColor('#07090e');
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor('#07090e');
      }
    }
  }

  /**
   * Initialize user avatar & name from Telegram initData
   */
  _initUserContext() {
    const user = window.nexusSecurity.parsedInitData?.user;
    const nameEl = document.getElementById('userName');
    const tagEl = document.getElementById('userTag');
    const avatarEl = document.getElementById('userAvatar');
    const premiumEl = document.getElementById('premiumBadge');

    if (user && user.first_name) {
      nameEl.textContent = `${user.first_name} ${user.last_name || ''}`.trim();
      tagEl.textContent = user.username ? `@${user.username}` : `ID: ${user.id}`;
      
      const initials = (user.first_name[0] + (user.last_name ? user.last_name[0] : '')).toUpperCase();
      avatarEl.textContent = initials;

      if (!user.is_premium) {
        premiumEl.style.display = 'none';
      }
    }
  }

  /**
   * Simple Web Audio Synthesizer (No external asset dependency)
   */
  _initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('AudioContext not supported');
    }
  }

  _playSound(type) {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'tap') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'coin') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(987.77, now); // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'fanfare') {
        // Quick 3-note victory arpeggio
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const o = this.audioCtx.createOscillator();
          const g = this.audioCtx.createGain();
          o.connect(g);
          g.connect(this.audioCtx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, now + idx * 0.09);
          g.gain.setValueAtTime(0.12, now + idx * 0.09);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.25);
          o.start(now + idx * 0.09);
          o.stop(now + idx * 0.09 + 0.25);
        });
      }
    } catch (err) {
      console.warn('Audio synthesis failed', err);
    }
  }

  /**
   * Bottom Navigation view switching
   */
  _initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        this.switchView(targetView);

        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }
      });
    });
  }

  switchView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    const activeView = document.getElementById(viewId);
    if (activeView) {
      activeView.classList.add('active');
    }

    const navBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (navBtn) {
      navBtn.classList.add('active');
    }

    this.activeView = viewId;
  }

  /**
   * Tap-To-Mine Interactive Orb
   */
  _initMiningOrb() {
    const orb = document.getElementById('tapOrbBtn');
    if (!orb) return;

    orb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handleMiningTap(e);
    });
  }

  handleMiningTap(e) {
    if (this.state.energy <= 0) {
      // Suggest watching rewarded ad for instant refill
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
      }
      this._promptEnergyRefill();
      return;
    }

    // Deduct 1 energy
    this.state.energy = Math.max(0, this.state.energy - 1);

    // Calculate gain
    const gain = 1 * this.state.multiplier;
    this.state.coins += gain;

    // Haptics & Sound
    this._playSound('tap');
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

    // Spawn floating tap text
    this._spawnTapIndicator(e.clientX, e.clientY, `+${gain}`);

    this.updateBalanceUI();
  }

  _spawnTapIndicator(x, y, text) {
    const floater = document.createElement('div');
    floater.className = 'floating-tap-text';
    floater.textContent = text;
    floater.style.left = `${x || window.innerWidth / 2}px`;
    floater.style.top = `${y || window.innerHeight / 2}px`;

    if (this.state.multiplier > 1) {
      floater.style.color = '#00e5ff';
      floater.textContent = `${text} TURBO`;
    }

    document.body.appendChild(floater);
    setTimeout(() => {
      floater.remove();
    }, 800);
  }

  _promptEnergyRefill() {
    const trigger = document.getElementById('triggerEnergyRefill');
    if (trigger) {
      trigger.style.transform = 'scale(1.05)';
      trigger.style.borderColor = '#00e5ff';
      setTimeout(() => {
        trigger.style.transform = '';
        trigger.style.borderColor = '';
      }, 500);
    }
  }

  /**
   * Rewarded & Instant Screen Ad Placement Handlers
   */
  _initAdVaultActions() {
    // 0. SPECIAL: Every Click Show Ads (প্রতি ক্লিকে স্ক্রিন এড)
    const btnEveryClick = document.getElementById('btnEveryClickAd');
    if (btnEveryClick) {
      btnEveryClick.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'every_click_ad',
            title: "Instant Screen Ad (Every Click)",
            duration: 3, // Fast 3-second ad!
            rewardLabel: "+200 Coins"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 200;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+200 Coins Claimed!", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // Extra Button 1: Instant Screen Ad 1
    const btnScreen1 = document.getElementById('btnScreenAd1');
    if (btnScreen1) {
      btnScreen1.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'screen_ad_1',
            title: "Fullscreen Video Screen Ad",
            duration: 5,
            rewardLabel: "+350 Coins Instant"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 350;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+350 Coins Claimed!", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // Extra Button 2: Fast Screen Ad 2
    const btnScreen2 = document.getElementById('btnScreenAd2');
    if (btnScreen2) {
      btnScreen2.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'screen_ad_2',
            title: "Fast 5s Screen Ad",
            duration: 5,
            rewardLabel: "+500 Coins + 2 Gems"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 500;
            this.state.gems += 2;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+500 Coins + 2 Gems!", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 1. Turbo 2x Multiplier (Direct Screen Ad)
    const btnTurbo = document.getElementById('btnWatchTurbo');
    if (btnTurbo) {
      btnTurbo.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'turbo_boost',
            title: "Unlock Turbo 2x Boost",
            duration: 5,
            rewardLabel: "+500 Coins & 2x Multiplier (10m)"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 500;
            this.state.multiplier = 2;
            this.state.multiplierExpiresAt = Date.now() + 10 * 60 * 1000;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+500 Coins & 2x Boost", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 2. Full Energy Refill (Direct Screen Ad)
    const btnEnergy = document.getElementById('btnWatchEnergy');
    if (btnEnergy) {
      btnEnergy.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'energy_refill',
            title: "Instant 100% Stamina Refill",
            duration: 5,
            rewardLabel: "100 Energy Points & +150 Coins"
          },
          (rewardMeta, nonce) => {
            this.state.energy = this.state.maxEnergy;
            this.state.coins += 150;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("Full Energy Refilled!", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 3. Mystery Chest (Direct Screen Ad)
    const btnChest = document.getElementById('btnUnlockChest');
    if (btnChest) {
      btnChest.onclick = () => {
        const now = Date.now();
        if (window.nexusAdEngine.cooldowns.chest > now) {
          const secs = Math.ceil((window.nexusAdEngine.cooldowns.chest - now) / 1000);
          alert(`Mystery Chest cooling down. Available in ${secs}s.`);
          return;
        }

        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'mystery_chest',
            title: "Unlocking Mystery Vault Chest",
            duration: 5,
            rewardLabel: "+1,000 Coins & 5 Rare Gems"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 1000;
            this.state.gems += 5;
            window.nexusAdEngine.cooldowns.chest = Date.now() + 120 * 1000; // 120s cooldown
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+1,000 Coins & 5 Gems", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 4. Streak Booster (Direct Screen Ad)
    const btnStreak = document.getElementById('btnStreakBooster');
    if (btnStreak) {
      btnStreak.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'streak_boost',
            title: "Triple Login Streak Reward",
            duration: 4,
            rewardLabel: "+750 Coins & 2 Gems"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 750;
            this.state.gems += 2;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+750 Coins & 2 Gems", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 5. Monetag Direct Rewarded Video (+1,000 Coins) - DIRECT SCREEN AD
    const btnMonetag = document.getElementById('btnMonetagRewarded');
    if (btnMonetag) {
      btnMonetag.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'monetag_rewarded',
            title: "Monetag Fullscreen Screen Ad",
            duration: 5,
            rewardLabel: "+1,000 Coins & 5 Rare Gems"
          },
          (rewardMeta, nonce) => {
            this.state.coins += 1000;
            this.state.gems += 5;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+1,000 Coins & 5 Gems", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 6. Monetag SmartLink / Direct Link Super Drop (+2,500 Coins) - DIRECT SCREEN AD
    const btnDirect = document.getElementById('btnMonetagDirectLink');
    if (btnDirect) {
      btnDirect.onclick = () => {
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'monetag_direct_link',
            title: "Monetag SmartLink Screen Task",
            duration: 4,
            rewardLabel: "+2,500 Coins (Super Drop)"
          },
          (rewardMeta, nonce) => {
            // Also trigger direct link if provided
            if (window.nexusAdEngine.monetagDirectLink) {
              const url = window.nexusAdEngine.monetagDirectLink;
              if (window.Telegram?.WebApp?.openLink) {
                window.Telegram.WebApp.openLink(url);
              } else {
                window.open(url, '_blank');
              }
            }
            this.state.coins += 2500;
            this.withdrawAdsWatched++;
            this._updateWithdrawUI();
            this._showRewardCelebration("+2,500 Coins Claimed!", nonce);
            this.updateBalanceUI();
          }
        );
      };
    }

    // 7. Native In-Page Push card action
    const btnSponsored = document.getElementById('btnSponsoredAction');
    if (btnSponsored) {
      btnSponsored.onclick = () => {
        const link = window.nexusAdEngine.monetagDirectLink || 'https://monetag.com';
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(link);
        } else {
          window.open(link, '_blank');
        }
        this.state.coins += 100;
        this.updateBalanceUI();
      };
    }

    // Dismiss celebration modal
    const btnDismiss = document.getElementById('btnDismissReward');
    if (btnDismiss) {
      btnDismiss.onclick = () => {
        document.getElementById('rewardClaimModal').classList.remove('active');
      };
    }
  }

  /**
   * Monetag Quick Setup Modal Controller
   */
  _initMonetagModal() {
    const btnOpen = document.getElementById('btnOpenMonetagSetup');
    const modal = document.getElementById('monetagSetupModal');
    const btnClose = document.getElementById('btnCloseMonetagSetup');
    const btnSave = document.getElementById('btnSaveMonetagModal');
    const inputDirect = document.getElementById('modalDirectLink');
    const inputZone = document.getElementById('modalZoneId');
    const radioLive = document.getElementById('modeLiveMonetag');
    const radioTest = document.getElementById('modeTestSim');
    const modeBadge = document.getElementById('monetagActiveModeBadge');

    const syncModalValues = () => {
      if (inputDirect) inputDirect.value = window.nexusAdEngine.monetagDirectLink || '';
      if (inputZone) inputZone.value = window.nexusAdEngine.monetagZoneId || '';
      if (window.nexusAdEngine.mode === 'monetag') {
        if (radioLive) radioLive.checked = true;
        if (modeBadge) modeBadge.textContent = 'Monetag Live Active';
      } else {
        if (radioTest) radioTest.checked = true;
        if (modeBadge) modeBadge.textContent = 'Test Simulator Mode';
      }
    };

    syncModalValues();

    if (btnOpen) {
      btnOpen.onclick = () => {
        syncModalValues();
        modal.classList.add('active');
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }
      };
    }

    if (btnClose) {
      btnClose.onclick = () => {
        modal.classList.remove('active');
      };
    }

    if (btnSave) {
      btnSave.onclick = () => {
        const directLink = inputDirect ? inputDirect.value.trim() : '';
        const zoneId = inputZone ? inputZone.value.trim() : '';
        const mode = (radioLive && radioLive.checked) ? 'monetag' : 'simulated';

        window.nexusAdEngine.saveConfig(
          mode,
          zoneId,
          window.nexusAdEngine.adsgramBlockId || '',
          directLink
        );

        if (modeBadge) {
          modeBadge.textContent = mode === 'monetag' ? 'Monetag Live Active' : 'Test Simulator Mode';
        }

        modal.classList.remove('active');
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }

        alert('Monetag Configuration Saved Successfully!\nমনিট্যাগ এড সেটআপ সফলভাবে সংরক্ষিত হয়েছে।');
      };
    }
  }

  /**
   * Withdrawal & Cashout Modal Controller
   */
  _initWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    const btnClose = document.getElementById('btnCloseWithdraw');
    const btnWatchAd = document.getElementById('btnWithdrawWatchAd');
    const btnSubmit = document.getElementById('btnSubmitWithdraw');
    const displayBalance = document.getElementById('withdrawCoinDisplay');

    // Allow user to open withdrawal by clicking user balance or pill
    const userPill = document.getElementById('userPill');
    if (userPill) {
      userPill.style.cursor = 'pointer';
      userPill.onclick = () => {
        this._updateWithdrawUI();
        modal.classList.add('active');
      };
    }

    if (btnClose) {
      btnClose.onclick = () => modal.classList.remove('active');
    }

    if (btnWatchAd) {
      btnWatchAd.onclick = () => {
        modal.classList.remove('active');
        window.nexusAdEngine.showInstantScreenAd(
          {
            actionId: 'withdraw_ad_boost',
            title: "Withdrawal Quota Unlock",
            duration: 4,
            rewardLabel: "+1 Progress towards Withdrawal"
          },
          (rewardMeta, nonce) => {
            this.withdrawAdsWatched++;
            this.state.coins += 250;
            this._updateWithdrawUI();
            this._showRewardCelebration("Withdrawal Ad Progress Added!", nonce);
            this.updateBalanceUI();
            modal.classList.add('active');
          }
        );
      };
    }

    if (btnSubmit) {
      btnSubmit.onclick = () => {
        const address = document.getElementById('withdrawTonAddress')?.value.trim();
        if (!address) {
          alert('অনুগ্রহ করে আপনার TON Wallet Address টি প্রবেশ করান। (Please enter your TON wallet address)');
          return;
        }

        if (this.state.coins < 5000) {
          alert(`অপর্যাপ্ত কয়েন! উইথড্র করতে কমপক্ষে ৫,০০০ কয়েন প্রয়োজন। আপনার ব্যালেন্স: ${this.state.coins} কয়েন।`);
          return;
        }

        if (this.withdrawAdsWatched < this.withdrawAdsRequired) {
          alert(`উইথড্র করতে আরও ${this.withdrawAdsRequired - this.withdrawAdsWatched} টি মনিট্যাগ এড দেখা প্রয়োজন।`);
          return;
        }

        // Process simulated payout
        this.state.coins -= 5000;
        modal.classList.remove('active');
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        alert(`অভিনন্দন! আপনার ৫,০০০ কয়েন ক্যাশআউট রিকোয়েস্ট সফল হয়েছে। TON Address: ${address}`);
        this.updateBalanceUI();
      };
    }
  }

  _updateWithdrawUI() {
    const displayBalance = document.getElementById('withdrawCoinDisplay');
    const adsProgress = document.getElementById('withdrawAdsProgress');
    const progressFill = document.getElementById('withdrawProgressFill');

    if (displayBalance) {
      const usdVal = (this.state.coins * 0.0005).toFixed(2);
      displayBalance.textContent = `${this.state.coins.toLocaleString()} Coins (~$${usdVal} USD)`;
    }

    if (adsProgress) {
      adsProgress.textContent = `${this.withdrawAdsWatched} / ${this.withdrawAdsRequired} Required`;
    }

    if (progressFill) {
      const pct = Math.min(100, Math.round((this.withdrawAdsWatched / this.withdrawAdsRequired) * 100));
      progressFill.style.width = `${pct}%`;
    }
  }

  /**
   * Lucky Wheel of Fortune Setup (Canvas Animation)
   */
  _initWheelOfFortune() {
    const btnOpen = document.getElementById('btnOpenSpinWheel');
    const modal = document.getElementById('spinWheelModal');
    const btnClose = document.getElementById('btnCloseSpinWheel');
    const btnSpin = document.getElementById('btnSpinNow');
    const canvas = document.getElementById('wheelCanvas');

    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const prizes = [
      { text: "1,000 COINS", color: "#1e293b", coins: 1000, gems: 0 },
      { text: "10 GEMS", color: "#0284c7", coins: 0, gems: 10 },
      { text: "500 COINS", color: "#0f172a", coins: 500, gems: 0 },
      { text: "2x TURBO", color: "#a855f7", coins: 300, gems: 0, turbo: true },
      { text: "2,500 COINS", color: "#f59e0b", coins: 2500, gems: 0 },
      { text: "25 GEMS", color: "#00e5ff", coins: 0, gems: 25 },
      { text: "750 COINS", color: "#1e293b", coins: 750, gems: 0 },
      { text: "JACKPOT", color: "#ef4444", coins: 10000, gems: 50 }
    ];

    let currentRotation = 0;
    const drawWheel = (angle) => {
      const numSlices = prizes.length;
      const sliceAngle = (2 * Math.PI) / numSlices;
      ctx.clearRect(0, 0, 280, 280);
      ctx.save();
      ctx.translate(140, 140);
      ctx.rotate(angle);

      for (let i = 0; i < numSlices; i++) {
        const item = prizes[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 135, i * sliceAngle, (i + 1) * sliceAngle);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Text
        ctx.save();
        ctx.rotate(i * sliceAngle + sliceAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px Outfit, sans-serif";
        ctx.fillText(item.text, 125, 4);
        ctx.restore();
      }

      // Center Hub
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, 2 * Math.PI);
      ctx.fillStyle = "#07090e";
      ctx.fill();
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.restore();
    };

    drawWheel(currentRotation);

    btnOpen.onclick = () => {
      modal.classList.add('active');
    };

    btnClose.onclick = () => {
      modal.classList.remove('active');
    };

    btnSpin.onclick = () => {
      // Trigger Instant Screen Ad First
      window.nexusAdEngine.showInstantScreenAd(
        {
          actionId: 'lucky_spin',
          title: "Unlocking Free Lucky Spin",
          duration: 4,
          rewardLabel: "Free Wheel Spin Ticket"
        },
        (rewardMeta, nonce) => {
          // Once ad finishes, spin the wheel!
          let spins = 5;
          let randomSlice = Math.floor(Math.random() * prizes.length);
          let targetAngle = currentRotation + (spins * 2 * Math.PI) + (randomSlice * ((2 * Math.PI) / prizes.length));
          
          let startTime = null;
          const duration = 4000;

          const animateSpin = (time) => {
            if (!startTime) startTime = time;
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const angle = currentRotation + (targetAngle - currentRotation) * easeOut;

            drawWheel(angle);

            if (progress < 1) {
              requestAnimationFrame(animateSpin);
            } else {
              currentRotation = angle % (2 * Math.PI);
              const won = prizes[randomSlice];
              this.state.coins += won.coins;
              this.state.gems += won.gems;
              modal.classList.remove('active');
              this._showRewardCelebration(`Wheel Landed on: ${won.text}!`, nonce);
              this.updateBalanceUI();
            }
          };

          requestAnimationFrame(animateSpin);
        }
      );
    };
  }

  /**
   * Security & Anti-Fraud View Setup
   */
  _initSecurityView() {
    const parsed = window.nexusSecurity.parsedInitData;
    const dUser = document.getElementById('dUser');
    const dAuth = document.getElementById('dAuthDate');
    const dQuery = document.getElementById('dQueryId');
    const dHash = document.getElementById('dHash');
    const tgInitStatus = document.getElementById('tgInitStatus');

    if (parsed) {
      if (dUser) dUser.textContent = JSON.stringify(parsed.user || {});
      if (dAuth) dAuth.textContent = parsed.auth_date || 'N/A';
      if (dQuery) dQuery.textContent = parsed.query_id || 'N/A';
      if (dHash) dHash.textContent = parsed.hash || 'N/A';
    }

    if (!window.nexusSecurity.isNativeTelegram && tgInitStatus) {
      tgInitStatus.textContent = 'Development Sandbox';
      tgInitStatus.style.background = 'rgba(245, 158, 11, 0.2)';
      tgInitStatus.style.color = '#fbbf24';
    }

    // Run Integrity Audit
    const btnAudit = document.getElementById('btnVerifySignature');
    if (btnAudit) {
      btnAudit.onclick = async () => {
        const isMatch = await window.nexusSecurity.verifyStateSeal(this.state);
        const title = document.getElementById('securityStatusTitle');
        const desc = document.getElementById('securityStatusDesc');
        const shieldWrap = document.getElementById('shieldIconWrap');

        if (isMatch) {
          shieldWrap.className = 'shield-icon-wrap shield-secure';
          title.textContent = "Integrity Audit Passed (100% Secure)";
          desc.textContent = "Client balance and state seal match cryptographic HMAC. Zero tampering detected.";
          this._playSound('coin');
        } else {
          shieldWrap.className = 'shield-icon-wrap shield-tampered';
          title.textContent = "Tamper Alert: State Mismatch";
          desc.textContent = "Memory values deviate from session HMAC seal.";
        }
      };
    }

    // Simulate Tamper Test
    const btnSimulate = document.getElementById('btnSimulateTamper');
    if (btnSimulate) {
      btnSimulate.onclick = () => {
        // Artificially inflate coins without HMAC recalculation
        this.state.coins += 9999999;
        const title = document.getElementById('securityStatusTitle');
        const desc = document.getElementById('securityStatusDesc');
        const shieldWrap = document.getElementById('shieldIconWrap');

        shieldWrap.className = 'shield-icon-wrap shield-tampered';
        title.textContent = "FRAUD DETECTED: Illegal Coin Injection";
        desc.textContent = "Direct modification of state was flagged. Account quarantined from reward payouts.";

        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }

        setTimeout(() => {
          // Revert back and reseal
          this.state.coins -= 9999999;
          window.nexusSecurity.sealGameState(this.state);
          this.updateBalanceUI();
        }, 3000);
      };
    }
  }

  /**
   * Ad Engine Config View (Switch between Simulator, Monetag, Adsgram)
   */
  _initAdConfigUI() {
    const radioSim = document.getElementById('radioModeSim');
    const radioMonetag = document.getElementById('radioModeMonetag');
    const radioAdsgram = document.getElementById('radioModeAdsgram');
    const statusTag = document.getElementById('engineStatusTag');
    const inputMonetag = document.getElementById('monetagZoneId');
    const inputAdsgram = document.getElementById('adsgramBlockId');
    const btnSave = document.getElementById('btnSaveAdConfig');

    // Populate current
    if (window.nexusAdEngine.mode === 'monetag') {
      if (radioMonetag) radioMonetag.checked = true;
      if (statusTag) statusTag.textContent = 'MONETAG LIVE';
    } else if (window.nexusAdEngine.mode === 'adsgram') {
      if (radioAdsgram) radioAdsgram.checked = true;
      if (statusTag) statusTag.textContent = 'ADSGRAM ACTIVE';
    } else {
      if (radioSim) radioSim.checked = true;
      if (statusTag) statusTag.textContent = 'SIMULATOR ACTIVE';
    }

    if (inputMonetag) inputMonetag.value = window.nexusAdEngine.monetagZoneId;
    if (inputAdsgram) inputAdsgram.value = window.nexusAdEngine.adsgramBlockId;

    if (btnSave) {
      btnSave.onclick = () => {
        let selectedMode = 'simulated';
        if (radioMonetag && radioMonetag.checked) selectedMode = 'monetag';
        if (radioAdsgram && radioAdsgram.checked) selectedMode = 'adsgram';

        window.nexusAdEngine.saveConfig(
          selectedMode,
          inputMonetag ? inputMonetag.value.trim() : '',
          inputAdsgram ? inputAdsgram.value.trim() : ''
        );

        if (statusTag) {
          statusTag.textContent = `${selectedMode.toUpperCase()} SAVED`;
        }

        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }

        alert(`Ad Engine configuration saved! Mode: ${selectedMode}`);
      };
    }
  }

  /**
   * Reward Celebration Modal & Confetti
   */
  _showRewardCelebration(rewardText, nonce) {
    const modal = document.getElementById('rewardClaimModal');
    const amountEl = document.getElementById('claimModalAmount');
    const nonceCode = document.getElementById('claimNonceCode');

    if (amountEl) amountEl.textContent = rewardText;
    if (nonceCode) nonceCode.textContent = nonce ? `${nonce.substring(0, 12)}...` : 'SECURE_NONCE';

    modal.classList.add('active');

    this._playSound('fanfare');
    this._burstParticles();

    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }

    // Reseal state with new balance
    window.nexusSecurity.sealGameState(this.state);
  }

  /**
   * Canvas Confetti & Coin Particles
   */
  _initParticles() {
    this.particleCanvas = document.getElementById('particleCanvas');
    if (!this.particleCanvas) return;
    this.particleCtx = this.particleCanvas.getContext('2d');

    const resize = () => {
      this.particleCanvas.width = window.innerWidth;
      this.particleCanvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const loop = () => {
      this._updateAndDrawParticles();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _burstParticles() {
    const colors = ['#00e5ff', '#fbbf24', '#a855f7', '#34d399', '#ffffff'];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2 - 40;

    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0.95 + Math.random() * 0.04
      });
    }
  }

  _updateAndDrawParticles() {
    if (!this.particleCtx) return;
    this.particleCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravity
      p.alpha *= 0.96;

      this.particleCtx.save();
      this.particleCtx.globalAlpha = p.alpha;
      this.particleCtx.fillStyle = p.color;
      this.particleCtx.beginPath();
      this.particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.particleCtx.fill();
      this.particleCtx.restore();

      if (p.alpha < 0.05) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Passive Energy Regeneration Loop
   */
  _startPassiveEnergyLoop() {
    setInterval(() => {
      if (this.state.energy < this.state.maxEnergy) {
        this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + 1);
        this.updateBalanceUI();
      }

      // Check multiplier expiration
      if (this.state.multiplier > 1 && Date.now() > this.state.multiplierExpiresAt) {
        this.state.multiplier = 1;
        this.updateBalanceUI();
      }
    }, 2500);
  }

  /**
   * Update UI balances & meters
   */
  updateBalanceUI() {
    const coinEl = document.getElementById('coinBalance');
    const gemEl = document.getElementById('gemBalance');
    const energyFill = document.getElementById('energyFill');
    const energyText = document.getElementById('energyText');
    const multVal = document.getElementById('multiplierValue');
    const multTimer = document.getElementById('multiplierTimer');

    if (coinEl) coinEl.textContent = this.state.coins.toLocaleString();
    if (gemEl) gemEl.textContent = this.state.gems.toLocaleString();

    if (energyFill) {
      const pct = (this.state.energy / this.state.maxEnergy) * 100;
      energyFill.style.width = `${pct}%`;
    }
    if (energyText) {
      energyText.textContent = `${this.state.energy} / ${this.state.maxEnergy}`;
    }

    if (multVal) {
      multVal.textContent = this.state.multiplier > 1 ? `${this.state.multiplier}x Turbo` : '1x Normal';
    }

    if (multTimer) {
      if (this.state.multiplier > 1) {
        const remainingSecs = Math.max(0, Math.ceil((this.state.multiplierExpiresAt - Date.now()) / 1000));
        multTimer.textContent = `${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s left`;
        multTimer.style.color = '#00e5ff';
      } else {
        multTimer.textContent = 'Boost expired';
        multTimer.style.color = '#94a3b8';
      }
    }
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.nexusApp = new NexusApp();
});
