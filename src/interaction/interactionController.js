import * as THREE from "three";

/**
 * InteractionController - Translates gestures into model transformations
 * Handles rotation, zoom, and reset with smooth damping
 */

export class InteractionController {
    constructor(modelController, camera) {
        this.modelController = modelController;
        this.camera = camera;

        // Rotation state
        this.targetRotationY = 0;
        this.currentRotationY = 0;
        this.rotationSpeed = 3.0;
        this.dampingFactor = 0.1;

        // Zoom state
        this.targetZoom = 1.0;
        this.currentZoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 2.5;
        this.zoomSpeed = 0.5;

        // Camera base position
        this.baseCameraDistance = 4.0;

        // Lock state
        this.isLocked = false;
    }

    /**
     * Handle rotation gesture
     */
    rotate(deltaX, deltaY) {
        if (this.isLocked) return;

        // Horizontal movement rotates around Y-axis
        this.targetRotationY += deltaX * this.rotationSpeed;

        // Optional: vertical movement for tilt (disabled for now)
        // this.targetRotationX += deltaY * this.rotationSpeed;
    }

    /**
     * Handle zoom gesture
     */
    zoom(delta) {
        if (this.isLocked) return;

        // Adjust target zoom
        this.targetZoom += delta * this.zoomSpeed;
        this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, this.minZoom, this.maxZoom);
    }

    /**
     * Handle pinch gesture (zoom in/out)
     */
    handlePinch(gesture) {
        if (this.isLocked) return;

        const zoomDelta = gesture.delta * 2.0; // Amplify for better feel

        if (gesture.type === "PINCH_IN") {
            this.zoom(zoomDelta);
        } else if (gesture.type === "PINCH_OUT") {
            this.zoom(zoomDelta);
        }
    }

    /**
     * Reset model orientation and zoom
     */
    reset() {
        this.targetRotationY = 0;
        this.currentRotationY = 0;
        this.targetZoom = 1.0;
        this.currentZoom = 1.0;

        // Reset model rotation
        this.modelController.resetRotation();

        console.log("🔄 Reset orientation");
    }

    /**
     * Lock/unlock interaction
     */
    setLocked(locked) {
        this.isLocked = locked;
        if (locked) {
            console.log("🔒 Interaction locked");
        } else {
            console.log("🔓 Interaction unlocked");
        }
    }

    /**
     * Update transformations (call every frame)
     */
    update() {
        const model = this.modelController.getCurrentModel();
        if (!model) return;

        // Smooth rotation damping
        this.currentRotationY = THREE.MathUtils.lerp(
            this.currentRotationY,
            this.targetRotationY,
            this.dampingFactor
        );

        // Apply rotation to model
        model.rotation.y = this.currentRotationY;

        // Smooth zoom damping
        this.currentZoom = THREE.MathUtils.lerp(
            this.currentZoom,
            this.targetZoom,
            this.dampingFactor
        );

        // Apply zoom to camera position
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const distance = (size.y * 1.8) / this.currentZoom;

        this.camera.position.z = distance;
    }

    /**
     * Process gesture and update interaction
     */
    processGesture(stateInfo) {
        const { state, gesture } = stateInfo;

        switch (state) {
            case "ROTATING":
                if (gesture.deltaX !== undefined) {
                    this.rotate(gesture.deltaX, gesture.deltaY || 0);
                }
                break;

            case "ZOOMING":
                this.handlePinch(gesture);
                break;

            case "SWITCHING":
                if (gesture.type === "SWIPE_RIGHT") {
                    this.modelController.next();
                } else if (gesture.type === "SWIPE_LEFT") {
                    this.modelController.previous();
                }
                break;

            case "RESETTING":
                this.reset();
                break;

            case "LOCKED":
                this.setLocked(true);
                break;

            case "IDLE":
                this.setLocked(false);
                break;
        }
    }
}
