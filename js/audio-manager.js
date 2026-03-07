/**
 * 閃電賭場 - 全域音效管理器 (基於 Howler.js)
 */

class AudioManager {
    constructor() {
        this.sounds = {};
        this.isMuted = localStorage.getItem('casino_muted') === 'true';
        this.masterVolume = parseFloat(localStorage.getItem('casino_volume') || '0.5');
        this.initialized = false;
        
        // 音效定義
        this.soundConfig = {
            // 通用
            'click': 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
            'win_small': 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3',
            'win_big': 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
            'bet': 'https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3',
            
            // 老虎機
            'slot_reel': 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
            'slot_stop': 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3',
            
            // Crash
            'crash_engine': 'https://assets.mixkit.co/active_storage/sfx/2022/2022-preview.mp3',
            'crash_explosion': 'https://assets.mixkit.co/active_storage/sfx/2023/2023-preview.mp3',
            
            // 背景音樂
            'bgm_lobby': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
        };
    }

    /**
     * 初始化音效 (由使用者第一次點擊觸發，解決瀏覽器自動播放限制)
     */
    init() {
        if (this.initialized) return;
        
        // 載入 Howler.js (如果尚未載入)
        if (typeof Howl === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js';
            script.onload = () => this._loadSounds();
            document.head.appendChild(script);
        } else {
            this._loadSounds();
        }
        
        this.initialized = true;
        console.log('🎵 AudioManager Initialized');
    }

    _loadSounds() {
        for (const [key, url] of Object.entries(this.soundConfig)) {
            this.sounds[key] = new Howl({
                src: [url],
                volume: this.masterVolume,
                mute: this.isMuted,
                html5: key.startsWith('bgm_') // 背景音樂使用 HTML5 Audio 以節省記憶體
            });
        }
    }

    play(key, options = {}) {
        if (!this.initialized) this.init();
        const sound = this.sounds[key];
        if (sound) {
            if (options.loop) sound.loop(true);
            if (options.volume !== undefined) sound.volume(options.volume * this.masterVolume);
            return sound.play();
        }
        return null;
    }

    stop(key, id) {
        const sound = this.sounds[key];
        if (sound) {
            if (id) sound.stop(id);
            else sound.stop();
        }
    }

    setMute(mute) {
        this.isMuted = mute;
        localStorage.setItem('casino_muted', mute);
        for (const sound of Object.values(this.sounds)) {
            sound.mute(mute);
        }
    }

    setVolume(volume) {
        this.masterVolume = volume;
        localStorage.setItem('casino_volume', volume);
        for (const sound of Object.values(this.sounds)) {
            sound.volume(volume);
        }
    }
}

// 導出全域單例
window.audioManager = new AudioManager();

// 監聽第一次點擊以初始化
document.addEventListener('click', () => {
    window.audioManager.init();
}, { once: true });
