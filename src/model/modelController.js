import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * ModelController - Manages multiple 3D models and transitions
 */

export class ModelController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.loader = new GLTFLoader();

        this.models = [];
        this.currentIndex = 0;
        this.currentModel = null;
        this.isTransitioning = false;

        // Model paths from public folder
        this.modelPaths = [
            { path: "/ironman.glb", name: "Iron Man" },
            { path: "/deadpool.glb", name: "Deadpool" },
            { path: "/hulk.glb", name: "Hulk" },
            { path: "/miles_morales_rig_rigged_bone_free.glb", name: "Miles Morales" },
            { path: "/steven_strange_dr_strange.glb", name: "Dr. Strange" },
            { path: "/deadpool_miniature_model.glb", name: "Deadpool Mini" },
        ];
    }

    /**
     * Load all models
     */
    async loadAll(onProgress) {
        console.log("🔄 Loading models...");

        for (let i = 0; i < this.modelPaths.length; i++) {
            const modelInfo = this.modelPaths[i];

            try {
                const gltf = await this.loadModel(modelInfo.path);
                const model = gltf.scene;

                // Normalize and center model
                this.normalizeModel(model);

                // Hide initially
                model.visible = false;
                this.scene.add(model);

                this.models.push({
                    model,
                    name: modelInfo.name,
                    path: modelInfo.path,
                });

                if (onProgress) {
                    onProgress(i + 1, this.modelPaths.length, modelInfo.name);
                }

                console.log(`✅ Loaded: ${modelInfo.name}`);
            } catch (error) {
                console.error(`❌ Failed to load ${modelInfo.name}:`, error);
            }
        }

        // Show first model
        if (this.models.length > 0) {
            this.currentModel = this.models[0].model;
            this.currentModel.visible = true;
            this.frameCamera(this.currentModel);
        }

        console.log(`✅ All models loaded (${this.models.length})`);
    }

    /**
     * Load a single model
     */
    loadModel(path) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => resolve(gltf),
                undefined,
                (error) => reject(error)
            );
        });
    }

    /**
     * Normalize model scale and position
     */
    normalizeModel(model) {
        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale to consistent height (2 units)
        const targetHeight = 2.0;
        const scale = targetHeight / size.y;
        model.scale.setScalar(scale);

        // Recalculate after scaling
        box.setFromObject(model);
        const newCenter = box.getCenter(new THREE.Vector3());

        // Center at origin
        model.position.sub(newCenter);

        // Store original rotation for reset
        model.userData.originalRotation = model.rotation.clone();
    }

    /**
     * Frame camera to fit model
     */
    frameCamera(model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Position camera based on model size
        const distance = size.y * 1.8;
        this.camera.position.set(0, size.y * 0.6, distance);
        this.camera.lookAt(0, size.y * 0.5, 0);
    }

    /**
     * Switch to next model
     */
    next() {
        if (this.isTransitioning || this.models.length === 0) return;

        const nextIndex = (this.currentIndex + 1) % this.models.length;
        this.switchTo(nextIndex);
    }

    /**
     * Switch to previous model
     */
    previous() {
        if (this.isTransitioning || this.models.length === 0) return;

        const prevIndex = (this.currentIndex - 1 + this.models.length) % this.models.length;
        this.switchTo(prevIndex);
    }

    /**
     * Switch to specific model index with smooth transition
     */
    switchTo(index) {
        if (index === this.currentIndex || this.isTransitioning) return;

        this.isTransitioning = true;

        const oldModel = this.currentModel;
        const newModel = this.models[index].model;

        console.log(`🔄 Switching: ${this.getCurrentName()} → ${this.models[index].name}`);

        // Crossfade transition
        this.crossfade(oldModel, newModel, 500).then(() => {
            this.currentIndex = index;
            this.currentModel = newModel;
            this.isTransitioning = false;

            // Frame camera for new model
            this.frameCamera(newModel);
        });
    }

    /**
     * Crossfade between two models
     */
    async crossfade(oldModel, newModel, duration = 500) {
        const startTime = Date.now();

        // Make new model visible but transparent
        newModel.visible = true;
        this.setModelOpacity(newModel, 0);

        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease in-out
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                this.setModelOpacity(oldModel, 1 - eased);
                this.setModelOpacity(newModel, eased);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    oldModel.visible = false;
                    this.setModelOpacity(oldModel, 1); // Reset for next time
                    resolve();
                }
            };

            animate();
        });
    }

    /**
     * Set model opacity (traverse all meshes)
     */
    setModelOpacity(model, opacity) {
        model.traverse((child) => {
            if (child.isMesh) {
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                }

                // Clone material if needed
                if (child.material === child.userData.originalMaterial) {
                    child.material = child.material.clone();
                }

                child.material.transparent = true;
                child.material.opacity = opacity;
            }
        });
    }

    /**
     * Get current model name
     */
    getCurrentName() {
        return this.models[this.currentIndex]?.name || "Unknown";
    }

    /**
     * Get current model object
     */
    getCurrentModel() {
        return this.currentModel;
    }

    /**
     * Reset current model rotation
     */
    resetRotation() {
        if (this.currentModel && this.currentModel.userData.originalRotation) {
            this.currentModel.rotation.copy(this.currentModel.userData.originalRotation);
        }
    }
}
