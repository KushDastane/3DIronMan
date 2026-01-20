/**
 * GestureEngine - Converts hand landmarks into high-level gesture events
 * Implements state machine with time-gating for reliable gesture recognition
 */
export class GestureEngine {
    constructor() {
        this.state = 'idle'; // idle, tracking, swipe_left, swipe_right, pinching, rotating, locked
        this.gestureStartTime = null;
        this.swipeTimeWindow = 500; // ms
        this.swipeThreshold = 0.3; // normalized distance
        this.lastHandPosition = null;
        this.pinchStartDistance = null;
        this.rotationDamping = 0.05;
        this.zoomDamping = 0.02;
        this.eventCallbacks = {};
    }

    /**
     * Register event callbacks
     * Events: nextModel, prevModel, zoom, rotate, reset, lock, unlock
     */
    on(event, callback) {
        this.eventCallbacks[event] = callback;
    }

    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event](data);
        }
    }

    /**
     * Process hand landmarks and detect gestures
     * @param {Object} results - MediaPipe results with multiHandLandmarks
     */
    processFrame(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            this.resetState();
            return;
        }

        const hands = results.multiHandLandmarks;
        const handedness = results.multiHandedness || [];

        // Two-hand detection filter
        if (hands.length >= 2) {
            const hand1Center = this.getHandCenter(hands[0]);
            const hand2Center = this.getHandCenter(hands[1]);

            // PROXIMITY CHECK: If "hands" are too close, it's likely a ghosting glitch
            // from a single hand (e.g. a fist seen as two detections)
            const dist = Math.hypot(hand1Center.x - hand2Center.x, hand1Center.y - hand2Center.y);

            if (dist < 0.12) {
                // Ignore the ghost, treat as single hand
                this.handleSingleHandGestures(hands[0], handedness[0]);
                return;
            }

            // HANDEDNESS CHECK: Zoom requires a Left and a Right hand
            const labels = handedness.map(h => h.label);
            const hasLeft = labels.includes('Left') || labels.includes('left');
            const hasRight = labels.includes('Right') || labels.includes('right');

            if (hasLeft && hasRight) {
                this.handleTwoHandGestures(hands);
                return;
            }

            // Fallback: If same-hand ghosting, use the first one
            this.handleSingleHandGestures(hands[0], handedness[0]);
            return;
        }

        // Single-hand gestures
        if (hands.length === 1) {
            this.handleSingleHandGestures(hands[0], handedness[0]);
        }
    }

    /**
     * Handle two-hand gestures (pinch zoom)
     */
    handleTwoHandGestures(hands) {
        const hand1Center = this.getHandCenter(hands[0]);
        const hand2Center = this.getHandCenter(hands[1]);

        const distance = Math.hypot(
            hand1Center.x - hand2Center.x,
            hand1Center.y - hand2Center.y
        );

        if (this.pinchStartDistance === null) {
            this.pinchStartDistance = distance;
            this.state = 'pinching';
        } else {
            // Use ratio for Natural Zoom (Multiplicative)
            const prevDistance = this.pinchStartDistance;
            if (prevDistance > 0) {
                let rawFactor = distance / prevDistance;

                // Anti-Glitch: Clamp the change per frame
                // Prevents model form "disappearing" or shrinking instantly if tracking fails
                rawFactor = Math.max(0.85, Math.min(1.15, rawFactor));

                const scaleFactor = 1 + (rawFactor - 1) * 1.5;

                if (Math.abs(scaleFactor - 1.0) > 0.0005) {
                    this.emit('zoom', { scaleFactor });
                }
            }
            this.pinchStartDistance = distance;
        }
    }

    /**
     * Handle single-hand gestures
     */
    handleSingleHandGestures(landmarks, handedness) {
        // Global Cooldown (Swipe)
        if (this.swipeCooldownTimestamp && Date.now() < this.swipeCooldownTimestamp) {
            return;
        }

        const gesture = this.detectGesture(landmarks);
        const indexTip = landmarks[8];

        // 1. Reset / Safety Hold (Palm)
        if (gesture === 'palm') {
            if (!this.palmStartTime) this.palmStartTime = Date.now();
            // Increased to 1.2 seconds to prevent accidental resets
            if (Date.now() - this.palmStartTime > 1200) {
                if (this.state !== 'idle') {
                    this.emit('reset');
                    this.resetState();
                    this.palmStartTime = null;
                }
            }
            return;
        } else {
            this.palmStartTime = null;
        }

        // 2. Switch Model: Point Left/Right (👈 / 👉)
        if (gesture === 'point') {
            const mcp = landmarks[5]; // Index Knuckle
            const tip = landmarks[8]; // Index Tip

            const dx = tip.x - mcp.x;
            const dy = tip.y - mcp.y;

            // Check if Horizontal (Relaxed: 0.8 ratio) and significant length
            if (Math.abs(dx) > Math.abs(dy) * 0.8 && Math.abs(dx) > 0.04) {
                // Cooldown check
                if (!this.switchCooldown || Date.now() - this.switchCooldown > 1200) {
                    // Note: MediaPipe X increases to Right.
                    // If dx > 0 (Tip is Right of Knuckle) -> Pointing Right -> Next
                    // If dx < 0 (Tip is Left of Knuckle) -> Pointing Left -> Prev

                    const direction = dx > 0 ? 'RIGHT' : 'LEFT';
                    this.emit('swipe', { direction });

                    this.switchCooldown = Date.now();
                    this.state = 'switching';
                }
                return; // Stop processing (no rotation while switching)
            }
        }

        // 3. Interaction (Fist/Point) -> Rotate Only
        if (gesture === 'fist' || gesture === 'point') {
            if (this.lastHandPosition === null) {
                this.lastHandPosition = { x: indexTip.x, y: indexTip.y, startX: indexTip.x, startY: indexTip.y };
                this.gestureStartTime = Date.now();
                this.state = 'tracking';
                return;
            }

            const currentX = indexTip.x;
            const currentY = indexTip.y;
            const startX = this.lastHandPosition.startX;
            const startY = this.lastHandPosition.startY;

            const totalDeltaX = currentX - startX;
            const totalDeltaY = currentY - startY;
            const elapsed = Date.now() - this.gestureStartTime;

            // 2. Rotation
            if (elapsed > 50) {
                this.state = 'rotating';

                const deltaX = currentX - this.lastHandPosition.x;
                const deltaY = currentY - this.lastHandPosition.y;

                this.emit('rotate', {
                    deltaX: deltaX * 2.5,
                    deltaY: deltaY * 2.5
                });
            }

            // Check stationarity for Auto-Reset (Fix for "Stuck in Rotation")
            const instantDist = Math.hypot(currentX - this.lastHandPosition.x, currentY - this.lastHandPosition.y);
            if (instantDist > 0.002) {
                this.lastMoveTime = Date.now();
            } else if (this.lastMoveTime && Date.now() - this.lastMoveTime > 300) {
                this.resetState();
                this.lastMoveTime = null;
                return; // Exit
            }

            // Update last position for continuous rotation delta
            this.lastHandPosition.x = currentX;
            this.lastHandPosition.y = currentY;
            // Keep startX/startY stable for total delta calculation
        } else {
            this.resetState();
        }
    }

    /**
     * Detect hand gesture type
     */
    detectGesture(landmarks) {
        const fingerStates = this.getFingerStates(landmarks);
        const extendedCount = fingerStates.filter(s => s).length;

        // Palm: 4 or 5 fingers
        if (extendedCount >= 4) return 'palm';

        // Victory: Index (1) & Middle (2) OPEN. Ring (3) & Pinky (4) CLOSED.
        // Thumb (0) is ignored (can be open or closed).
        if (fingerStates[1] && fingerStates[2] && !fingerStates[3] && !fingerStates[4]) {
            return 'victory';
        }

        // Fist: 0 fingers (or just thumb)
        if (extendedCount === 0 || (extendedCount === 1 && fingerStates[0])) return 'fist';

        // Point: 1 finger (Index) or Index+Thumb
        // If Index is open, and we didn't match Victory (so Middle is closed)
        if (fingerStates[1]) return 'point';

        // Fallback for strict counts if pattern fails
        if (extendedCount === 1) return 'point';

        return 'unknown';
    }

    /**
     * Get finger extension states [thumb, index, middle, ring, pinky]
     */
    getFingerStates(landmarks) {
        const fingerTips = [4, 8, 12, 16, 20];
        const fingerPips = [3, 6, 10, 14, 18];
        const tolerance = 0.02; // Add tolerance for slightly bent fingers

        return fingerTips.map((tipIdx, i) => {
            const tip = landmarks[tipIdx];
            const pip = landmarks[fingerPips[i]];

            // Finger is extended if tip is higher than pip (lower y value)
            // Add tolerance to prevent false negatives
            return tip.y < (pip.y + tolerance);
        });
    }

    /**
     * Get center point of hand
     */
    getHandCenter(landmarks) {
        let sumX = 0, sumY = 0;
        landmarks.forEach(lm => {
            sumX += lm.x;
            sumY += lm.y;
        });
        return {
            x: sumX / landmarks.length,
            y: sumY / landmarks.length
        };
    }

    /**
     * Reset gesture state
     */
    resetState() {
        if (this.state === 'locked') {
            this.emit('unlock');
        }
        this.state = 'idle';
        this.lastHandPosition = null;
        this.pinchStartDistance = null;
        this.gestureStartTime = null;
    }
}
