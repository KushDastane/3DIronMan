import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

/**
 * HandTracker - Manages MediaPipe Hands detection and webcam feed
 * Returns smoothed hand landmarks with confidence filtering
 */
export class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.onResultsCallback = null;
        this.smoothingWindow = 3;
        this.landmarkHistory = [];
        this.confidenceThreshold = 0.7;
    }

    /**
     * Initialize MediaPipe Hands and webcam
     * @param {HTMLVideoElement} videoElement - Video element for webcam feed
     * @param {Function} onResults - Callback for hand detection results
     */
    async init(videoElement, onResults) {
        this.videoElement = videoElement;
        this.onResultsCallback = onResults;

        // Configure MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.hands.onResults((results) => this.handleResults(results));

        // Start camera
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                await this.hands.send({ image: this.videoElement });
            },
            width: 1280,
            height: 720
        });

        await this.camera.start();
    }

    /**
     * Process MediaPipe results and apply smoothing
     */
    handleResults(results) {
        if (!this.onResultsCallback) return;

        const smoothedResults = {
            multiHandLandmarks: [],
            multiHandedness: results.multiHandedness || [],
            image: results.image
        };

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            // Apply temporal smoothing to reduce jitter
            results.multiHandLandmarks.forEach((landmarks, handIndex) => {
                const smoothed = this.smoothLandmarks(landmarks, handIndex);
                smoothedResults.multiHandLandmarks.push(smoothed);
            });
        }

        this.onResultsCallback(smoothedResults);
    }

    /**
     * Apply temporal smoothing to landmarks
     */
    smoothLandmarks(landmarks, handIndex) {
        if (!this.landmarkHistory[handIndex]) {
            this.landmarkHistory[handIndex] = [];
        }

        this.landmarkHistory[handIndex].push(landmarks);

        // Keep only recent frames
        if (this.landmarkHistory[handIndex].length > this.smoothingWindow) {
            this.landmarkHistory[handIndex].shift();
        }

        // Average across frames
        const smoothed = landmarks.map((landmark, i) => {
            let sumX = 0, sumY = 0, sumZ = 0;

            this.landmarkHistory[handIndex].forEach(frame => {
                sumX += frame[i].x;
                sumY += frame[i].y;
                sumZ += frame[i].z;
            });

            const count = this.landmarkHistory[handIndex].length;
            return {
                x: sumX / count,
                y: sumY / count,
                z: sumZ / count
            };
        });

        return smoothed;
    }

    /**
     * Stop tracking and release resources
     */
    stop() {
        if (this.camera) {
            this.camera.stop();
        }
        if (this.hands) {
            this.hands.close();
        }
    }
}
