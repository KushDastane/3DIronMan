import * as THREE from 'three';
import { ParticleSystem } from '../particles/ParticleSystem';

/**
 * SceneRenderer - Three.js scene setup optimized for particles
 */
export class SceneRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.particleSystem = null;
        this.clock = new THREE.Clock();

        this.init();
    }

    init() {
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false, // Opaque for dark background
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance

        // Setup camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 6); // Further back for particles
        this.camera.lookAt(0, 0, 0);

        // Setup scene - Dark minimal background
        this.scene.background = new THREE.Color(0x050505);

        // Initialize Particle System
        this.particleSystem = new ParticleSystem(this.scene);

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * Set the model data for the particle system
     * @param {Float32Array} vertexData 
     */
    setModel(vertexData) {
        if (!vertexData) return;

        // Update target shape
        this.particleSystem.setTargetShape(vertexData);

        // Trigger morph to model
        this.particleSystem.toModel();
    }

    /**
     * Apply transformation to particle system
     * Note: We don't apply it here immediately, but we can if we want to expose immediate control
     */
    applyTransform() {
        // Logic handled in render loop via passed state from App
    }

    /**
     * Reset particle system state
     */
    resetTransform() {
        this.particleSystem.reset();
        this.particleSystem.toIdle(); // Force to idle
    }

    /**
     * Trigger morph back to idle
     */
    morphToIdle() {
        this.particleSystem.toIdle();
    }

    /**
     * Render the scene
     * @param {Object} transform Current transform state {rotation, scale}
     */
    render(transform = { rotation: { x: 0, y: 0 }, scale: 1 }) {
        // Strict delta time capping to eliminate jitter during load/lag spikes
        let dt = Math.min(this.clock.getDelta(), 0.033);

        // Safety for first frame or massive hangs
        if (dt === 0) dt = 1 / 60;

        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.update(dt, transform.rotation, transform.scale);
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     */
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Cleanup
     */
    dispose() {
        this.renderer.dispose();
        window.removeEventListener('resize', this.onResize);
    }
}
