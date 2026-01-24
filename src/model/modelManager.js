import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * ModelManager - Handles loading, centering, and transitioning between GLB models
 */
export class ModelManager {
    constructor() {
        this.loader = new GLTFLoader();
        this.models = [];
        this.currentIndex = 0;
        this.loadedData = new Map(); // Stores Float32Arrays
    }

    /**
     * Initialize with model paths from public/models/
     * STRICT: Start with car.glb ONLY
     */
    async init() {
        // List of available models - ordered by size/reliability
        // Note: psitol.glb is 8.8MB and may load slowly
        this.models = [
            '/mechanical.glb',    // 388KB - reliable
            '/Satellite.glb',     // 174KB - reliable
            '/car.glb',           // 307KB - reliable
            '/dinosaur.glb',      // 286KB - reliable

        ];

        this.userModel = null;
        this.userObjectUrl = null;

        // Preload first model
        await this.loadModelData(this.models[0]);
    }

    /**
     * Process an uploaded GLB file
     * @param {File} file 
     * @returns {Promise<Float32Array>}
     */
    async processUploadedFile(file) {
        // 1. Validation
        if (!file.name.toLowerCase().endsWith('.glb') && !file.name.toLowerCase().endsWith('.gltf')) {
            throw new Error('Invalid file format. Please upload a .glb or .gltf model.');
        }

        // 2. Load and extract
        if (this.userObjectUrl) {
            URL.revokeObjectURL(this.userObjectUrl);
        }
        this.userObjectUrl = URL.createObjectURL(file);

        return new Promise((resolve, reject) => {
            this.loader.load(
                this.userObjectUrl,
                (gltf) => {
                    // Check vertex count before full extraction
                    let totalVertices = 0;
                    gltf.scene.traverse((child) => {
                        if (child.isMesh && child.geometry.attributes.position) {
                            totalVertices += child.geometry.attributes.position.count;
                        }
                    });

                    if (totalVertices > 150000) { // Slightly higher limit for raw count, will be downsampled
                        URL.revokeObjectURL(this.userObjectUrl);
                        this.userObjectUrl = null;
                        reject(new Error(`Model too complex (${totalVertices.toLocaleString()} vertices). Max allowed is 150,000.`));
                        return;
                    }

                    const vertices = this.extractVertices(gltf.scene);
                    this.userModel = {
                        name: file.name.split('.').shift().toUpperCase(),
                        data: vertices
                    };
                    resolve(vertices);
                },
                undefined,
                (error) => {
                    URL.revokeObjectURL(this.userObjectUrl);
                    this.userObjectUrl = null;
                    console.error('Failed to load user model:', error);
                    reject(new Error('Failed to parse 3D model.'));
                }
            );
        });
    }

    /**
     * Clear user model and revoke URL
     */
    cleanupUserModel() {
        if (this.userObjectUrl) {
            URL.revokeObjectURL(this.userObjectUrl);
            this.userObjectUrl = null;
        }
        this.userModel = null;
    }

    /**
     * Load a GLB model and extract/normalize vertex data
     */
    async loadModelData(path) {
        if (this.loadedData.has(path)) {
            return this.loadedData.get(path);
        }

        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => {
                    const vertices = this.extractVertices(gltf.scene);
                    this.loadedData.set(path, vertices);
                    resolve(vertices);
                },
                undefined,
                (error) => {
                    console.error(`Failed to load model: ${path}`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Constant pool for performance: Prevent massive allocations during model processing
     */
    static pool = {
        vA: new THREE.Vector3(),
        vB: new THREE.Vector3(),
        vC: new THREE.Vector3(),
        triangle: new THREE.Triangle()
    };

    /**
     * Extract, center, and normalize particles from model surfaces
     * Uses Surface Area Weighted Sampling for uniform density
     * Returns Float32Array of [x,y,z, x,y,z, ...]
     */
    extractVertices(scene) {
        const triangles = [];
        let totalArea = 0;

        // Use static pool to avoid 100k+ allocations per model
        const { vA, vB, vC, triangle } = ModelManager.pool;

        // 1. Collect all triangles and calculate total area
        scene.updateMatrixWorld(true);
        scene.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry;
                const posAttribute = geometry.attributes.position;
                const index = geometry.index;
                const matrix = child.matrixWorld;

                if (index) {
                    for (let i = 0; i < index.count; i += 3) {
                        vA.fromBufferAttribute(posAttribute, index.getX(i)).applyMatrix4(matrix);
                        vB.fromBufferAttribute(posAttribute, index.getX(i + 1)).applyMatrix4(matrix);
                        vC.fromBufferAttribute(posAttribute, index.getX(i + 2)).applyMatrix4(matrix);

                        triangle.set(vA, vB, vC);
                        const area = triangle.getArea();

                        if (area > 0) {
                            // Store clone for the sampling phase
                            triangles.push({ a: vA.clone(), b: vB.clone(), c: vC.clone(), area });
                            totalArea += area;
                        }
                    }
                } else {
                    for (let i = 0; i < posAttribute.count; i += 3) {
                        vA.fromBufferAttribute(posAttribute, i).applyMatrix4(matrix);
                        vB.fromBufferAttribute(posAttribute, i + 1).applyMatrix4(matrix);
                        vC.fromBufferAttribute(posAttribute, i + 2).applyMatrix4(matrix);

                        triangle.set(vA, vB, vC);
                        const area = triangle.getArea();

                        if (area > 0) {
                            triangles.push({ a: vA.clone(), b: vB.clone(), c: vC.clone(), area });
                            totalArea += area;
                        }
                    }
                }
            }
        });

        if (triangles.length === 0) return new Float32Array(0);

        // 2. Build Cumulative Distribution Function (CDF) for triangle selection
        let cumulativeArea = 0;
        const cdf = new Float32Array(triangles.length);
        for (let i = 0; i < triangles.length; i++) {
            cumulativeArea += triangles[i].area;
            cdf[i] = cumulativeArea / totalArea;
        }

        // 3. Sample particles
        const targetCount = 40000;
        const floatArray = new Float32Array(targetCount * 3);

        for (let i = 0; i < targetCount; i++) {
            // Select triangle via binary search on CDF
            const r = Math.random();
            let low = 0, high = triangles.length - 1;
            let meshIndex = high;

            while (low <= high) {
                const mid = (low + high) >>> 1;
                if (cdf[mid] < r) {
                    low = mid + 1;
                } else {
                    meshIndex = mid;
                    high = mid - 1;
                }
            }

            const tri = triangles[meshIndex];

            // Sample uniform point on triangle using barycentric coordinates
            let u = Math.random();
            let v = Math.random();
            if (u + v > 1) {
                u = 1 - u;
                v = 1 - v;
            }
            const w = 1 - u - v;

            const x = u * tri.a.x + v * tri.b.x + w * tri.c.x;
            const y = u * tri.a.y + v * tri.b.y + w * tri.c.y;
            const z = u * tri.a.z + v * tri.b.z + w * tri.c.z;

            floatArray[i * 3] = x;
            floatArray[i * 3 + 1] = y;
            floatArray[i * 3 + 2] = z;
        }

        // 4. Compute Bounding Box, Center and Normalize
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < targetCount; i++) {
            const x = floatArray[i * 3];
            const y = floatArray[i * 3 + 1];
            const z = floatArray[i * 3 + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const scale = 2.5 / (maxDim || 1);

        for (let i = 0; i < targetCount; i++) {
            floatArray[i * 3] = (floatArray[i * 3] - centerX) * scale;
            floatArray[i * 3 + 1] = (floatArray[i * 3 + 1] - centerY) * scale;
            floatArray[i * 3 + 2] = (floatArray[i * 3 + 2] - centerZ) * scale;
        }

        console.log(`Surface sampling complete: ${targetCount} points from ${triangles.length} triangles.`);
        return floatArray;
    }

    /**
     * Get current model vertex data
     */
    async getCurrentModelData() {
        const path = this.models[this.currentIndex];
        return await this.loadModelData(path);
    }

    /**
   * Get current model name
   */
    getCurrentModelName() {
        const path = this.models[this.currentIndex];
        const name = path.split('/').pop().replace('.glb', '');
        return name.toUpperCase();
    }

    /**
     * Switch to next model
     */
    async nextModel() {
        this.currentIndex = (this.currentIndex + 1) % this.models.length;
        return await this.getCurrentModelData();
    }

    /**
     * Switch to previous model
     */
    async prevModel() {
        this.currentIndex = (this.currentIndex - 1 + this.models.length) % this.models.length;
        return await this.getCurrentModelData();
    }

    getModelCount() {
        return this.models.length;
    }
}
