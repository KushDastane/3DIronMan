import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export class MediaPipeManager {
  constructor(videoEl) {
    this.video = videoEl;
    this.hands = null;
    this.camera = null;
    this.ready = false;
    this.onResultsCb = null;
  }

  onResults(cb) {
    this.onResultsCb = cb;
  }

  async start() {
    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    this.hands.onResults((results) => {
      if (!this.ready) return;
      if (this.onResultsCb) this.onResultsCb(results);
    });

    this.ready = true;

    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (!this.ready) return;
        try {
          await this.hands.send({ image: this.video });
        } catch {
          console.warn("🛑 MediaPipe send aborted");
          this.ready = false;
        }
      },
      width: 640,
      height: 480,
    });

    await this.camera.start();
  }

  stop() {
    this.ready = false;
    if (this.camera) this.camera.stop();
    if (this.hands) this.hands.close();
  }
}
