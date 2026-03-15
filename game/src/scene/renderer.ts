/**
 * Three.js scene, camera, and renderer setup.
 * Phase 1B: terrain-aware fog, lighting, and shadow volumes.
 */
import * as THREE from 'three';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
}

export function createSceneContext(container: HTMLElement): SceneContext {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue

  // Fog: increased far distance to reveal more terrain landscape
  scene.fog = new THREE.Fog(0x87CEEB, 80, 280);

  // Camera — higher initial position to see terrain relief
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    600,
  );
  camera.position.set(0, 50, 100);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Directional light — positioned higher to illuminate terrain slopes
  const directionalLight = new THREE.DirectionalLight(0xfff4e6, 0.8);
  directionalLight.position.set(50, 80, 30);
  directionalLight.castShadow = true;

  // Shadow camera encompasses the 400×400 world
  directionalLight.shadow.mapSize.setScalar(2048);
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 300;
  directionalLight.shadow.camera.left = -200;
  directionalLight.shadow.camera.right = 200;
  directionalLight.shadow.camera.top = 200;
  directionalLight.shadow.camera.bottom = -200;
  scene.add(directionalLight);

  // Ground plane removed — replaced by terrain mesh in main.ts (Phase 1B)

  // Clock
  const clock = new THREE.Clock();

  // Handle resize
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, clock };
}
