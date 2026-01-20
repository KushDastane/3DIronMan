import * as THREE from "three";

export class PoseRetargeter {
  constructor() {
    this.restQuats = new WeakMap();
    this.debugOnce = false;
  }

  retarget(poseLandmarks, boneMap) {
    if (!poseLandmarks || poseLandmarks.length < 33) return;

    // LEFT ARM
    this.#applyArm(
      poseLandmarks,
      boneMap.left,
      11, // LEFT_SHOULDER
      13, // LEFT_ELBOW
      15  // LEFT_WRIST
    );

    // RIGHT ARM
    this.#applyArm(
      poseLandmarks,
      boneMap.right,
      12, // RIGHT_SHOULDER
      14, // RIGHT_ELBOW
      16  // RIGHT_WRIST
    );
  }

  #applyArm(landmarks, armBones, sIdx, eIdx, wIdx) {
    if (!armBones?.upperArm) return;

    const shoulder = landmarks[sIdx];
    const elbow = landmarks[eIdx];
    const wrist = landmarks[wIdx];
    if (!shoulder || !elbow || !wrist) return;

    // Vector from elbow → wrist
    const dir = new THREE.Vector3(
      wrist.x - elbow.x,
      wrist.y - elbow.y,
      wrist.z - elbow.z
    ).normalize();

    const bone = armBones.upperArm;

    // Cache rest pose quaternion ONCE
    if (!this.restQuats.has(bone)) {
      this.restQuats.set(bone, bone.quaternion.clone());
    }

    // Debug proof (runs once)
    if (!this.debugOnce) {
      console.log("🟢 PoseRetargeter active");
      console.log("Dir:", dir.toArray());
      this.debugOnce = true;
    }

    // Assume bone forward axis = +Y (common in game rigs)
    const boneForward = new THREE.Vector3(0, 1, 0);

    // Convert world direction → bone local space
const parentQuat = bone.parent.getWorldQuaternion(new THREE.Quaternion());
const localDir = dir.clone().applyQuaternion(parentQuat.invert());

// Compute rotation in local space
const targetQuat = new THREE.Quaternion().setFromUnitVectors(
  boneForward,
  localDir
);


    bone.quaternion.copy(
      this.restQuats.get(bone).clone().multiply(targetQuat)
    );
  }
}
