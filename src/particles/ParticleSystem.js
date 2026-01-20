import * as THREE from 'three';
import { particleVertexShader, particleFragmentShader } from './particleShaders';
import { ParticleMorphController } from './ParticleMorphController';
import { audioManager } from '../audio/AudioManager';

export class ParticleSystem {
    constructor(scene, maxParticles = 40000) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.particles = null;
        this.geometry = null;
        this.material = null;
        this.morphController = new ParticleMorphController();

        // Track state for sound triggers
        this.lastState = this.morphController.state;

        // Uniforms state
        this.uniforms = {
            uTime: { value: 0 },
            uMorphProgress: { value: 0 },
            uRotation: { value: new THREE.Vector2(0, 0) },
            uScale: { value: 1.0 },
            uDensityThreshold: { value: 1.0 },
            uAdaptiveAlpha: { value: 1.0 },
            uParticleSize: { value: 1.5 } // Smaller dots for higher density
        };

        this.init();
    }

    init() {
        this.geometry = new THREE.BufferGeometry();

        // Initialize attributes
        const idlePositions = new Float32Array(this.maxParticles * 3);
        const targetPositions = new Float32Array(this.maxParticles * 3);
        const randomness = new Float32Array(this.maxParticles);

        // Fill idle positions with random noise (spherical cloud)
        const radius = 3.0;
        for (let i = 0; i < this.maxParticles; i++) {
            // Random direction
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.cbrt(Math.random()) * radius; // Uniform distribution in sphere

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            idlePositions[i * 3] = x;
            idlePositions[i * 3 + 1] = y;
            idlePositions[i * 3 + 2] = z;

            // Initial target is same as idle
            targetPositions[i * 3] = x;
            targetPositions[i * 3 + 1] = y;
            targetPositions[i * 3 + 2] = z;

            randomness[i] = Math.random();
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(idlePositions, 3)); // Required by Three.js but unused in shader
        this.geometry.attributes.position.usage = THREE.StaticDrawUsage; // Optimize for GPU
        this.geometry.setAttribute('aIdlePosition', new THREE.BufferAttribute(idlePositions, 3));
        this.geometry.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3));
        this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomness, 1));

        // Material
        this.material = new THREE.ShaderMaterial({
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false, // Important for additive blending feel
            blending: THREE.AdditiveBlending
        });

        // Create points
        this.particles = new THREE.Points(this.geometry, this.material);
        this.particles.frustumCulled = false; // Prevent culling when mesh bounds are weird

        this.scene.add(this.particles);
    }

    /**
     * Set the target shape for local morphing using vertex data
     * @param {Float32Array} vertexData - Array of x,y,z coordinates
     */
    setTargetShape(vertexData) {
        if (!vertexData || vertexData.length === 0) return; // Safeguard

        const count = Math.min(vertexData.length / 3, this.maxParticles);
        const attribute = this.geometry.attributes.aTargetPosition;
        const array = attribute.array;

        // Update target positions
        // If filtered points are fewer than maxParticles, loop them or scatter remainder
        for (let i = 0; i < this.maxParticles; i++) {
            let srcIndex = i;
            if (srcIndex >= count) {
                // Wrap around if we don't have enough target points
                srcIndex = i % count;
            }

            array[i * 3] = vertexData[srcIndex * 3];
            array[i * 3 + 1] = vertexData[srcIndex * 3 + 1];
            array[i * 3 + 2] = vertexData[srcIndex * 3 + 2];
        }

        attribute.needsUpdate = true;
    }

    /**
     * Update loop
     * @param {number} dt - Delta time
     */
    update(dt, rotation, scale) {
        this.uniforms.uTime.value += dt;

        // Update morph progress
        const progress = this.morphController.update(dt);
        this.uniforms.uMorphProgress.value = progress;

        // --- AUDIO TRIGGER LOGIC ---
        const currentState = this.morphController.state;
        if (currentState !== this.lastState) {
            if (currentState === this.morphController.states.MORPHING_TO_MODEL) {
                audioManager.playForm();
            } else if (currentState === this.morphController.states.MORPHING_TO_IDLE) {
                audioManager.playDisperse();
            } else if (currentState === this.morphController.states.MODEL_ACTIVE) {
                audioManager.playComplete();
            }
            this.lastState = currentState;
        }

        // Update transforms
        if (rotation) {
            this.uniforms.uRotation.value.set(rotation.y, rotation.x); // Map Y-rot to X-axis in shader logic
        }
        if (scale !== undefined) {
            this.uniforms.uScale.value = scale;

            // OFFLOAD MATH FROM SHADER: Calculate once per frame on CPU
            // 1. Stochastic Density Threshold (quadratic falloff)
            this.uniforms.uDensityThreshold.value = Math.pow(Math.max(0.01, scale), 2.0);

            // 2. Adaptive Opacity (linear dimming)
            this.uniforms.uAdaptiveAlpha.value = Math.max(0.1, Math.min(1.0, scale));
        }
    }

    // Expose controller methods
    toModel() { this.morphController.toModel(); }
    toIdle() { this.morphController.toIdle(); }
    reset() { this.morphController.reset(); }
}
