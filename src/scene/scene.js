import * as THREE from "three";

export function createScene(canvas) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pure black for sci-fi feel

    // CAMERA - Framed for model viewing
    const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );
    camera.position.set(0, 1.0, 4.0);
    camera.lookAt(0, 1.0, 0);

    // RENDERER
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // CINEMATIC LIGHTING
    const ambient = new THREE.AmbientLight(0x404060, 0.4);

    // Key light (main illumination)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 5, 4);

    // Fill light (cyan/blue sci-fi accent)
    const fillLight = new THREE.DirectionalLight(0x00d4ff, 1.2);
    fillLight.position.set(-3, 2, 2);

    // Rim light (orange/red accent for depth)
    const rimLight = new THREE.DirectionalLight(0xff4400, 1.8);
    rimLight.position.set(0, 3, -5);

    // Top light (soft overhead)
    const topLight = new THREE.PointLight(0xffffff, 1.0);
    topLight.position.set(0, 5, 0);

    scene.add(ambient, keyLight, fillLight, rimLight, topLight);

    // Subtle fog for depth
    scene.fog = new THREE.Fog(0x000000, 5, 15);

    // RESIZE
    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer };
}
