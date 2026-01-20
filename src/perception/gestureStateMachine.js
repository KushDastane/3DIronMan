/**
 * GestureStateMachine - Manages gesture interaction states
 * Prevents conflicting gestures and enforces state transitions
 */

export class GestureStateMachine {
    constructor() {
        this.currentState = "IDLE";
        this.previousState = "IDLE";
        this.stateStartTime = Date.now();
        this.minStateDuration = 100; // ms - minimum time in a state
    }

    /**
     * Update state based on detected gesture
     * @param {Object} gesture - Detected gesture from GestureDetector
     * @returns {Object} State transition info
     */
    update(gesture) {
        const currentTime = Date.now();
        const timeInState = currentTime - this.stateStartTime;

        // Enforce minimum state duration (prevent jitter)
        if (timeInState < this.minStateDuration) {
            return {
                state: this.currentState,
                changed: false,
                gesture,
            };
        }

        const newState = this.mapGestureToState(gesture);

        // Check if state transition is allowed
        if (this.isTransitionAllowed(this.currentState, newState)) {
            const changed = newState !== this.currentState;

            if (changed) {
                console.log(`🔄 State: ${this.currentState} → ${newState}`);
                this.previousState = this.currentState;
                this.currentState = newState;
                this.stateStartTime = currentTime;
            }

            return {
                state: this.currentState,
                previousState: this.previousState,
                changed,
                gesture,
                timeInState,
            };
        }

        // Transition not allowed, stay in current state
        return {
            state: this.currentState,
            changed: false,
            gesture,
            blocked: true,
        };
    }

    /**
     * Map gesture type to state
     */
    mapGestureToState(gesture) {
        switch (gesture.type) {
            case "NONE":
            case "IDLE":
                return "IDLE";

            case "SWIPE_LEFT":
            case "SWIPE_RIGHT":
                return "SWITCHING";

            case "ROTATE":
                return "ROTATING";

            case "PINCH_IN":
            case "PINCH_OUT":
                return "ZOOMING";

            case "OPEN_PALM":
                return "RESETTING";

            case "FIST":
                return "LOCKED";

            default:
                return "IDLE";
        }
    }

    /**
     * Check if state transition is allowed
     */
    isTransitionAllowed(fromState, toState) {
        // LOCKED state blocks all transitions except back to IDLE
        if (fromState === "LOCKED" && toState !== "IDLE") {
            return false;
        }

        // SWITCHING is a momentary state, can transition to anything
        if (fromState === "SWITCHING") {
            return true;
        }

        // RESETTING is a momentary state
        if (fromState === "RESETTING") {
            return true;
        }

        // Can't rotate and zoom simultaneously
        if (fromState === "ROTATING" && toState === "ZOOMING") {
            return false;
        }
        if (fromState === "ZOOMING" && toState === "ROTATING") {
            return false;
        }

        // All other transitions allowed
        return true;
    }

    /**
     * Force state change (for external control)
     */
    setState(newState) {
        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateStartTime = Date.now();
    }

    /**
     * Check if currently in a specific state
     */
    isState(state) {
        return this.currentState === state;
    }

    /**
     * Check if interaction is locked
     */
    isLocked() {
        return this.currentState === "LOCKED";
    }

    /**
     * Reset to idle state
     */
    reset() {
        this.currentState = "IDLE";
        this.previousState = "IDLE";
        this.stateStartTime = Date.now();
    }
}
