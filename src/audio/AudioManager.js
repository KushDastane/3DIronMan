/**
 * AudioManager - Single source of truth for project sound design
 * Manages background ambient music and interaction SFX
 */
class AudioManager {
    constructor() {
        // --- CENTRAL CONFIGURATION ---
        this.config = {
            bgAmbient: {
                path: '/bg-ambient.mp3',
                volume: 0.2, // Increased from 0.15
                loop: true,
                fadeInTime: 2000 // ms
            },
            sfxDisperse: {
                path: '/sfx-disperse.mp3',
                volume: 0.4
            },
            sfxForm: {
                path: '/sfx-form.wav',
                volume: 0.5
            },
            sfxComplete: {
                path: '/sfx-complete.wav',
                volume: 0.3
            },
            sfxZoom: {
                path: '/zoom.wav',
                volume: 0.4
            }
        };

        this.sounds = {};
        this.isInitialized = false;
        this.bgMusic = null;
    }

    /**
     * Initialize audio context and load sounds
     * Must be called after user interaction to comply with browser policies
     */
    init() {
        if (this.isInitialized) return;

        // Load Background Music
        this.bgMusic = new Audio(this.config.bgAmbient.path);
        this.bgMusic.loop = this.config.bgAmbient.loop;
        this.bgMusic.volume = 0; // Start at 0 for fade-in

        // Preload SFX
        this.sounds.disperse = new Audio(this.config.sfxDisperse.path);
        this.sounds.disperse.volume = this.config.sfxDisperse.volume;

        this.sounds.form = new Audio(this.config.sfxForm.path);
        this.sounds.form.volume = this.config.sfxForm.volume;

        this.sounds.complete = new Audio(this.config.sfxComplete.path);
        this.sounds.complete.volume = this.config.sfxComplete.volume;

        this.sounds.zoom = new Audio(this.config.sfxZoom.path);
        this.sounds.zoom.volume = this.config.sfxZoom.volume;

        this.isInitialized = true;
    }

    /**
     * Smoothly starts the background ambient track
     */
    startBackground() {
        if (!this.bgMusic) this.init();

        console.log("Audio: Attempting to start background music...", this.config.bgAmbient.path);

        this.bgMusic.play()
            .then(() => {
                console.log("Audio: Background music playing successfully.");
                this._fadeInBackground();
            })
            .catch(e => {
                console.warn("Audio: Background music play blocked by browser. Awaiting hardware interaction.", e);
            });
    }

    /**
     * Internal fade-in logic
     */
    _fadeInBackground() {
        const targetVol = this.config.bgAmbient.volume;
        const duration = this.config.bgAmbient.fadeInTime;
        const interval = 50;
        const steps = duration / interval;
        const volStep = targetVol / steps;

        this.bgMusic.volume = 0;

        let currentVol = 0;
        const fadeInterval = setInterval(() => {
            currentVol += volStep;
            if (currentVol >= targetVol) {
                this.bgMusic.volume = targetVol;
                clearInterval(fadeInterval);
            } else {
                this.bgMusic.volume = currentVol;
            }
        }, interval);
    }

    playDisperse() {
        this._playSFX('disperse');
    }

    playForm() {
        this._playSFX('form');
    }

    playComplete() {
        this._playSFX('complete');
    }

    playZoom() {
        this._playSFX('zoom');
    }

    /**
     * Internal helper to play SFX with overlap prevention if needed
     */
    _playSFX(key) {
        if (!this.isInitialized) this.init();
        const sound = this.sounds[key];
        if (sound) {
            sound.currentTime = 0; // Restart from beginning
            sound.play().catch(e => { });
        }
    }

    muteAll() {
        if (this.bgMusic) this.bgMusic.muted = true;
        Object.values(this.sounds).forEach(s => s.muted = true);
    }

    unmuteAll() {
        if (this.bgMusic) this.bgMusic.muted = false;
        Object.values(this.sounds).forEach(s => s.muted = false);
    }
}

// Export a singleton instance
export const audioManager = new AudioManager();
