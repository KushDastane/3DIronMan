/**
 * Animation loop for gesture-controlled viewer
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {InteractionController} interactionController - Optional interaction controller
 */
export function animate(renderer, scene, camera, interactionController = null) {
    function loop() {
        requestAnimationFrame(loop);

        // Update interaction controller (rotation/zoom damping)
        if (interactionController) {
            interactionController.update();
        }

        renderer.render(scene, camera);
    }
    loop();
}

