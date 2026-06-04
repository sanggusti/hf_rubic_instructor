import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SCENE_CONFIG from '../configs/scene-config';
import DEBUG_CONFIG from '../configs/debug-config';

export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls | null;
}

export function createScene(container: HTMLElement): SceneCtx {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);

  const sizeOf = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    return { w, h };
  };

  const { w, h } = sizeOf();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(5, 5, 7);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, SCENE_CONFIG.maxPixelRatio));
  renderer.setSize(w, h);
  renderer.domElement.classList.add('threejs-canvas');
  container.appendChild(renderer.domElement);

  let controls: OrbitControls | null = null;
  if (DEBUG_CONFIG.orbitControls) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
  }

  const resize = () => {
    const { w: nw, h: nh } = sizeOf();
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(container);
  } else {
    window.addEventListener('resize', resize);
  }

  return { scene, camera, renderer, controls };
}
