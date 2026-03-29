class AudioManager {
    constructor() {
        this.sounds = {};
        this.currentBgmKey = "";
        this.currentBgmId = null;
        this.pendingBgmKey = "";
        this.isMuted = this._readBoolean("casino_muted", false);
        this.bgmEnabled = this._readBoolean("casino_bgm_muted", false) === false;
        this.sfxVolume = this._readVolume("casino_volume", 0.5);
        this.bgmVolume = this._readVolume("casino_bgm_volume", 0.35);
        this.masterVolume = this.sfxVolume;
        this.initialized = false;
        this.loadingHowler = false;
        this.initializing = false;
        this.pendingBgmReplay = false;

        this.soundConfig = {
            click: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
            win_small: "https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3",
            win_big: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3",
            bet: "https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3",
            slot_reel: "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3",
            slot_stop: "https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3",
            crash_engine: "https://assets.mixkit.co/active_storage/sfx/2022/2022-preview.mp3",
            crash_explosion: "https://assets.mixkit.co/active_storage/sfx/2023/2023-preview.mp3",
            bgm_lobby: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            bgm_casino: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            bgm_tense: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
        };
    }

    _readBoolean(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            return raw === "true";
        } catch (error) {
            return fallback;
        }
    }

    _readVolume(key, fallback) {
        try {
            var raw = parseFloat(localStorage.getItem(key) || String(fallback));
            if (!Number.isFinite(raw)) return fallback;
            return Math.max(0, Math.min(1, raw));
        } catch (error) {
            return fallback;
        }
    }

    _isBgmKey(key) {
        return String(key || "").indexOf("bgm_") === 0;
    }

    _getSoundVolume(key) {
        return this._isBgmKey(key) ? this.bgmVolume : this.sfxVolume;
    }

    _isSoundMuted(key) {
        return this.isMuted || (this._isBgmKey(key) && !this.bgmEnabled);
    }

    _applySoundState(key) {
        var sound = this.sounds[key];
        if (!sound) return;
        sound.mute(this._isSoundMuted(key));
        sound.volume(this._getSoundVolume(key));
    }

    _applyAllSoundStates() {
        var keys = Object.keys(this.sounds);
        for (var i = 0; i < keys.length; i += 1) {
            this._applySoundState(keys[i]);
        }
    }

    _createSound(key) {
        var url = this.soundConfig[key];
        if (!url || typeof Howl === "undefined") return null;
        var sound = new Howl({
            src: [url],
            volume: this._getSoundVolume(key),
            mute: this._isSoundMuted(key),
            html5: this._isBgmKey(key),
            preload: this._isBgmKey(key) ? false : true
        });
        this.sounds[key] = sound;
        return sound;
    }

    _ensureSound(key) {
        if (!key) return null;
        if (this.sounds[key]) return this.sounds[key];
        return this._createSound(key);
    }

    _releaseSound(key) {
        var sound = this.sounds[key];
        if (!sound) return;
        try {
            sound.stop();
            if (typeof sound.unload === "function") sound.unload();
        } catch (error) {
            console.log("Failed to release sound", key);
        }
        delete this.sounds[key];
    }

    init() {
        if (this.initialized || this.initializing) return;

        if (typeof Howl === "undefined") {
            if (this.loadingHowler) return;
            this.initializing = true;
            this.loadingHowler = true;
            var script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js";
            script.onload = () => {
                this.loadingHowler = false;
                this._loadSounds();
                this.initialized = true;
                this.initializing = false;
                this._flushPendingBgmReplay();
            };
            script.onerror = () => {
                this.loadingHowler = false;
                this.initializing = false;
                console.log("Failed to load howler.js");
            };
            document.head.appendChild(script);
        } else {
            this.initializing = true;
            this._loadSounds();
            this.initialized = true;
            this.initializing = false;
            this._flushPendingBgmReplay();
        }
    }

    _loadSounds() {
        if (typeof Howler !== "undefined") {
            Howler.autoUnlock = true;
            if (typeof Howler.html5PoolSize === "number" && Howler.html5PoolSize < 12) {
                Howler.html5PoolSize = 12;
            }
        }

        var entries = Object.entries(this.soundConfig);
        for (var i = 0; i < entries.length; i += 1) {
            var key = entries[i][0];
            if (this._isBgmKey(key)) continue;
            this._ensureSound(key);
        }

        if (this.pendingBgmKey && this.bgmEnabled && !this.isMuted) {
            this.pendingBgmReplay = true;
        }
    }

    _flushPendingBgmReplay() {
        if (!this.pendingBgmReplay) return;
        if (!this.pendingBgmKey || !this.bgmEnabled || this.isMuted) {
            this.pendingBgmReplay = false;
            return;
        }
        this.pendingBgmReplay = false;
        this.playBGM(this.pendingBgmKey);
    }

    play(key, options = {}) {
        if (!this.initialized) this.init();

        var sound = this._ensureSound(key);
        if (!sound) return null;
        if (this._isSoundMuted(key)) return null;

        sound.loop(!!options.loop);
        var baseVolume = this._getSoundVolume(key);
        var nextVolume = options.volume !== undefined
            ? Math.max(0, Math.min(1, Number(options.volume) || 0)) * baseVolume
            : baseVolume;
        sound.volume(nextVolume);

        var id = sound.play();
        if (this._isBgmKey(key)) {
            this.currentBgmKey = key;
            this.currentBgmId = id;
            this.pendingBgmKey = key;
        }
        return id;
    }

    stop(key, id) {
        var sound = this.sounds[key];
        if (!sound) return;
        if (id) sound.stop(id);
        else sound.stop();

        if (this.currentBgmKey === key && (!id || this.currentBgmId === id)) {
            this.currentBgmId = null;
        }
    }

    _normalizeBgmKey(trackName) {
        var raw = String(trackName || "").trim().toLowerCase();
        if (!raw) return "bgm_lobby";
        if (this.soundConfig[raw]) return raw;
        var prefixed = raw.indexOf("bgm_") === 0 ? raw : ("bgm_" + raw);
        if (this.soundConfig[prefixed]) return prefixed;
        return "bgm_lobby";
    }

    playBGM(trackName) {
        var key = this._normalizeBgmKey(trackName);
        this.pendingBgmKey = key;
        if (!this.initialized) this.init();
        if (this.initializing) {
            this.pendingBgmReplay = true;
            return null;
        }
        if (this.isMuted || !this.bgmEnabled) return null;

        if (this.currentBgmKey && this.currentBgmKey !== key) {
            this.stop(this.currentBgmKey, this.currentBgmId);
            this._releaseSound(this.currentBgmKey);
            this.currentBgmKey = "";
            this.currentBgmId = null;
        }

        if (this.currentBgmKey === key && this.currentBgmId) {
            return this.currentBgmId;
        }

        return this.play(key, { loop: true, volume: 1 });
    }

    stopBGM() {
        if (!this.currentBgmKey) return;
        var currentKey = this.currentBgmKey;
        this.stop(currentKey, this.currentBgmId);
        this._releaseSound(currentKey);
        this.currentBgmKey = "";
        this.currentBgmId = null;
    }

    setMute(mute) {
        this.isMuted = !!mute;
        try {
            localStorage.setItem("casino_muted", this.isMuted ? "true" : "false");
        } catch (error) {
            console.log("Failed to persist mute setting");
        }
        this._applyAllSoundStates();

        if (this.isMuted) {
            this.stopBGM();
        } else if (this.pendingBgmKey && this.bgmEnabled) {
            this.playBGM(this.pendingBgmKey);
        }
    }

    setVolume(volume) {
        this.setSfxVolume(volume);
    }

    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, Number(volume) || 0));
        this.masterVolume = this.sfxVolume;
        try {
            localStorage.setItem("casino_volume", String(this.sfxVolume));
        } catch (error) {
            console.log("Failed to persist sfx volume");
        }
        this._applyAllSoundStates();
    }

    setBgmVolume(volume) {
        this.bgmVolume = Math.max(0, Math.min(1, Number(volume) || 0));
        try {
            localStorage.setItem("casino_bgm_volume", String(this.bgmVolume));
        } catch (error) {
            console.log("Failed to persist bgm volume");
        }
        this._applyAllSoundStates();
    }

    setBgmEnabled(enabled) {
        this.bgmEnabled = !!enabled;
        try {
            localStorage.setItem("casino_bgm_muted", this.bgmEnabled ? "false" : "true");
        } catch (error) {
            console.log("Failed to persist bgm toggle");
        }
        this._applyAllSoundStates();
        if (!this.bgmEnabled) {
            this.stopBGM();
        } else if (!this.isMuted && this.pendingBgmKey) {
            this.playBGM(this.pendingBgmKey);
        }
    }
}

window.audioManager = new AudioManager();

function ensureAudioReadyFromUserGesture() {
    window.audioManager.init();
    if (window.audioManager.pendingBgmKey && window.audioManager.bgmEnabled && !window.audioManager.isMuted) {
        window.audioManager.playBGM(window.audioManager.pendingBgmKey);
    }
}

document.addEventListener("click", ensureAudioReadyFromUserGesture, { once: true });
document.addEventListener("touchstart", ensureAudioReadyFromUserGesture, { once: true });
