import * as THREE from "three";

/**
 * GestureDetector - Recognizes discrete gestures from MediaPipe hand landmarks
 * 
 * Gestures:
 * - SWIPE_LEFT / SWIPE_RIGHT: Horizontal hand movement
 * - PINCH_IN / PINCH_OUT: Two-hand distance change (zoom)
 * - ROTATE: One-hand horizontal movement (rotate model)
 * - OPEN_PALM: All fingers extended (reset)
 * - FIST: All fingers curled (lock)
 */

export class GestureDetector {
    constructor() {
        this.previousHandPositions = [];
        this.gestureHistory = [];
        this.lastGestureTime = 0;
        this.confidenceThreshold = 0.7;

        // Time-gating parameters
        this.swipeTimeWindow = 300; // ms
        this.gestureDebounce = 200; // ms between gestures
    }

    /**
     * Detect gestures from MediaPipe Hands results
     * @param {Object} results - MediaPipe Hands results
     * @returns {Object} Detected gesture and metadata
     */
    detect(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            this.previousHandPositions = [];
            return { type: "NONE", confidence: 0 };
        }

        const hands = results.multiHandLandmarks;
        const handedness = results.multiHandedness;

        // Check for two-hand gestures first
        if (hands.length === 2) {
            const pinchGesture = this.detectPinch(hands);
            if (pinchGesture.type !== "NONE") return pinchGesture;
        }

        // Single hand gestures
        if (hands.length >= 1) {
            const hand = hands[0];
            const handLabel = handedness[0]?.label || "Unknown";

            // Check for open palm (reset)
            const palmGesture = this.detectOpenPalm(hand);
            if (palmGesture.type !== "NONE") return palmGesture;

            // Check for fist (lock)
            const fistGesture = this.detectFist(hand);
            if (fistGesture.type !== "NONE") return fistGesture;

            // Check for swipe
            const swipeGesture = this.detectSwipe(hand, handLabel);
            if (swipeGesture.type !== "NONE") return swipeGesture;

            // Check for rotation
            const rotateGesture = this.detectRotation(hand);
            if (rotateGesture.type !== "NONE") return rotateGesture;
        }

        return { type: "IDLE", confidence: 1.0, hands: hands.length };
    }

    /**
     * Detect two-hand pinch gesture (zoom)
     */
    detectPinch(hands) {
        const leftHand = hands[0];
        const rightHand = hands[1];

        // Get index finger tips (landmark 8)
        const leftIndex = leftHand[8];
        const rightIndex = rightHand[8];

        const currentDistance = Math.sqrt(
            Math.pow(rightIndex.x - leftIndex.x, 2) +
            Math.pow(rightIndex.y - leftIndex.y, 2) +
            Math.pow(rightIndex.z - leftIndex.z, 2)
        );

        // Store previous distance
        if (!this.previousPinchDistance) {
            this.previousPinchDistance = currentDistance;
            return { type: "NONE", confidence: 0 };
        }

        const distanceChange = currentDistance - this.previousPinchDistance;
        const threshold = 0.05; // 5% change threshold

        let gestureType = "NONE";
        if (distanceChange < -threshold) {
            gestureType = "PINCH_IN";
        } else if (distanceChange > threshold) {
            gestureType = "PINCH_OUT";
        }

        this.previousPinchDistance = currentDistance;

        if (gestureType !== "NONE") {
            return {
                type: gestureType,
                confidence: Math.min(Math.abs(distanceChange) / threshold, 1.0),
                distance: currentDistance,
                delta: distanceChange,
            };
        }

        return { type: "NONE", confidence: 0 };
    }

    /**
     * Detect horizontal swipe gesture
     */
    detectSwipe(hand, handLabel) {
        const wrist = hand[0];
        const currentTime = Date.now();

        // Store position history
        this.previousHandPositions.push({
            x: wrist.x,
            y: wrist.y,
            time: currentTime,
        });

        // Keep only recent positions (within time window)
        this.previousHandPositions = this.previousHandPositions.filter(
            (pos) => currentTime - pos.time < this.swipeTimeWindow
        );

        if (this.previousHandPositions.length < 2) {
            return { type: "NONE", confidence: 0 };
        }

        // Calculate horizontal movement
        const firstPos = this.previousHandPositions[0];
        const lastPos = this.previousHandPositions[this.previousHandPositions.length - 1];
        const deltaX = lastPos.x - firstPos.x;
        const deltaY = Math.abs(lastPos.y - firstPos.y);

        // Swipe must be primarily horizontal
        const swipeThreshold = 0.15;
        const verticalThreshold = 0.1;

        if (Math.abs(deltaX) > swipeThreshold && deltaY < verticalThreshold) {
            // Debounce: prevent rapid swipes
            if (currentTime - this.lastGestureTime < this.gestureDebounce) {
                return { type: "NONE", confidence: 0 };
            }

            this.lastGestureTime = currentTime;
            this.previousHandPositions = []; // Clear history

            const gestureType = deltaX > 0 ? "SWIPE_RIGHT" : "SWIPE_LEFT";
            return {
                type: gestureType,
                confidence: Math.min(Math.abs(deltaX) / swipeThreshold, 1.0),
                hand: handLabel,
            };
        }

        return { type: "NONE", confidence: 0 };
    }

    /**
     * Detect rotation gesture (continuous hand movement)
     */
    detectRotation(hand) {
        const wrist = hand[0];

        if (!this.previousRotationPos) {
            this.previousRotationPos = { x: wrist.x, y: wrist.y };
            return { type: "NONE", confidence: 0 };
        }

        const deltaX = wrist.x - this.previousRotationPos.x;
        const deltaY = wrist.y - this.previousRotationPos.y;

        this.previousRotationPos = { x: wrist.x, y: wrist.y };

        // Only trigger if movement is significant
        const movementThreshold = 0.005;
        if (Math.abs(deltaX) > movementThreshold || Math.abs(deltaY) > movementThreshold) {
            return {
                type: "ROTATE",
                confidence: 0.8,
                deltaX,
                deltaY,
            };
        }

        return { type: "NONE", confidence: 0 };
    }

    /**
     * Detect open palm (all fingers extended)
     */
    detectOpenPalm(hand) {
        const fingerTips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
        const fingerBases = [2, 5, 9, 13, 17];

        let extendedCount = 0;

        for (let i = 0; i < fingerTips.length; i++) {
            const tip = hand[fingerTips[i]];
            const base = hand[fingerBases[i]];

            // For thumb, check X distance; for others, check Y distance
            const isExtended = i === 0
                ? Math.abs(tip.x - base.x) > 0.05
                : tip.y < base.y - 0.05;

            if (isExtended) extendedCount++;
        }

        // All 5 fingers must be extended
        if (extendedCount >= 5) {
            return {
                type: "OPEN_PALM",
                confidence: extendedCount / 5,
            };
        }

        return { type: "NONE", confidence: 0 };
    }

    /**
     * Detect fist (all fingers curled)
     */
    detectFist(hand) {
        const fingerTips = [4, 8, 12, 16, 20];
        const fingerBases = [2, 5, 9, 13, 17];

        let curledCount = 0;

        for (let i = 0; i < fingerTips.length; i++) {
            const tip = hand[fingerTips[i]];
            const base = hand[fingerBases[i]];

            // For thumb, check X distance; for others, check Y distance
            const isCurled = i === 0
                ? Math.abs(tip.x - base.x) < 0.03
                : tip.y > base.y - 0.02;

            if (isCurled) curledCount++;
        }

        // At least 4 fingers must be curled
        if (curledCount >= 4) {
            return {
                type: "FIST",
                confidence: curledCount / 5,
            };
        }

        return { type: "NONE", confidence: 0 };
    }

    /**
     * Reset detector state
     */
    reset() {
        this.previousHandPositions = [];
        this.previousPinchDistance = null;
        this.previousRotationPos = null;
        this.lastGestureTime = 0;
    }
}
