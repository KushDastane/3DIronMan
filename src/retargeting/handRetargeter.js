import * as THREE from "three";

export class HandRetargeter {
    constructor() {
        this.boneMap = {
            // Basic mapping for fingers (DEF-*)
            "thumb": "thumb",
            "index": "index",
            "middle": "middle",
            "ring": "ring",
            "pinky": "pinky"
        };
    }

    retarget(handsResults, bones, side = "L") {
        if (!handsResults || !handsResults.multiHandLandmarks) return;

        const handLandmarks = handsResults.multiHandLandmarks[0]; // Just take first hand for now if only 1 detected
        if (!handLandmarks) return;

        // MediaPipe Hand Landmarks:
        // 0: Wrist, 4: Thumb Tip, 8: Index Tip, 12: Middle Tip, 16: Ring Tip, 20: Pinky Tip

        // Logic to detect "closing" of hand based on distance from tip to palm
        const wrist = handLandmarks[0];

        const fingerTips = [8, 12, 16, 20];
        const fingerNames = ["index", "middle", "ring", "pinky"];

        fingerTips.forEach((tipIdx, i) => {
            const tip = handLandmarks[tipIdx];
            const dist = Math.sqrt(
                Math.pow(tip.x - wrist.x, 2) +
                Math.pow(tip.y - wrist.y, 2)
            );

            // Simple rotation of finger bones based on distance (curl)
            const prefix = `DEF-f_${fingerNames[i]}01${side}`;
            const fingerBones = bones.filter(b => b.name.startsWith(prefix));
            fingerBones.forEach(bone => {
                const curlAngle = dist < 0.1 ? Math.PI / 2 : 0;
                bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, curlAngle, 0.1);
            });
        });
    }
}
