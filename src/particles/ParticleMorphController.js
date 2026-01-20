/**
 * ParticleMorphController - Manages state transitions for particle morphing
 * Handles: Idle <-> Model transitions, Model switching
 */
export class ParticleMorphController {
    constructor() {
        this.states = {
            IDLE: 'IDLE',
            MORPHING_TO_MODEL: 'MORPHING_TO_MODEL',
            MODEL_ACTIVE: 'MODEL_ACTIVE',
            MORPHING_TO_IDLE: 'MORPHING_TO_IDLE',
            SWITCHING_MODEL: 'SWITCHING_MODEL' // Dissolve -> Load -> Reform
        };

        this.state = this.states.IDLE;
        this.progress = 0.0; // 0.0 = Idle, 1.0 = Model
        this.morphSpeed = 1.2; // Seconds to complete morph (Snappier feel)
        this.targetProgress = 0.0;
    }

    /**
     * Update morph progress based on delta time
     * @param {number} dt - Delta time in seconds
     * @returns {number} Current progress (0.0 to 1.0)
     */
    update(dt) {
        const speed = 1.0 / this.morphSpeed;

        if (this.state === this.states.MORPHING_TO_MODEL) {
            this.progress += dt * speed;
            if (this.progress >= 1.0) {
                this.progress = 1.0;
                this.state = this.states.MODEL_ACTIVE;
            }
        } else if (this.state === this.states.MORPHING_TO_IDLE) {
            this.progress -= dt * speed;
            if (this.progress <= 0.0) {
                this.progress = 0.0;
                this.state = this.states.IDLE;
            }
        }

        return this.progress;
    }

    /**
     * Trigger morph to model shape
     */
    toModel() {
        // Allow restarting morph even if active (for model switching)
        // This ensures we animate FROM particles instead of snapping
        if (this.state === this.states.MODEL_ACTIVE) {
            this.progress = 0.0;
        }
        this.state = this.states.MORPHING_TO_MODEL;
    }

    /**
     * Trigger morph to idle floating state
     */
    toIdle() {
        if (this.state === this.states.IDLE) return;
        this.state = this.states.MORPHING_TO_IDLE;
    }

    /**
     * Prepare for model switch (instant reset to idle for now, or fast dissolve)
     */
    reset() {
        this.progress = 0.0;
        this.state = this.states.IDLE;
    }
}
