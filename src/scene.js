// Three.js renderer, lighting, camera controls and model display.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Studio lighting: a soft room for reflections on the metal, a key light that casts
  // a soft shadow, and a cool rim light from behind to separate the instrument from the background.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 0.35));
  const sun = new THREE.DirectionalLight(0xfff4e5, 1.6);
  sun.position.set(1.5, 4, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 0.9);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  // Floor that only shows the shadow.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Free movement: drag to rotate, right-drag / two-finger drag (or shift-drag) to move,
  // scroll / pinch to zoom toward the pointer.
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.keys = { LEFT: 'KeyA', UP: 'KeyW', RIGHT: 'KeyD', BOTTOM: 'KeyS' };
  controls.listenToKeyEvents(window); // WASD moves the view too
  const home = { position: new THREE.Vector3(), target: new THREE.Vector3() };

  const stage = new THREE.Group();
  scene.add(stage);

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  /** Swap in a model and frame it, viewed slightly from the player's side. */
  function show(object) {
    stage.clear();
    stage.add(object);
    object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Put the shadow floor just under the instrument and fit the shadow camera to it.
    floor.position.y = box.min.y - 0.02;
    const reach = size.length() * 0.75;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: 20 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.copy(center);
    sun.position.copy(center).add(new THREE.Vector3(1.5, 4, 3));
    // Distance at which both the height and the width fit, with a little margin.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const span = Math.max(size.x, size.z);
    const dist = Math.max(size.y / 2 / tan, span / 2 / (tan * camera.aspect)) * 1.15 + span / 2;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0.35, 0.15, 1).normalize().multiplyScalar(dist));
    controls.minDistance = dist * 0.05;
    controls.maxDistance = dist * 6;
    controls.update();
    home.position.copy(camera.position);
    home.target.copy(controls.target);
  }

  // Hover / tap a part to see its name.
  const raycaster = new THREE.Raycaster();
  function hits(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(stage, true);
  }
  function partAt(clientX, clientY) {
    for (const hit of hits(clientX, clientY)) {
      if (!hit.object.visible || hit.object.material?.opacity === 0) continue;
      for (let o = hit.object; o; o = o.parent) if (o.userData.pressable) return o.name;
    }
    return null;
  }
  /** First surface hit on the model itself (ignores markers), with a world-space normal. */
  function surfaceAt(clientX, clientY) {
    for (const hit of hits(clientX, clientY)) {
      let o = hit.object;
      while (o && !o.userData.marker) o = o.parent;
      if (o || !hit.face) continue;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
      return { point: hit.point.clone(), normal };
    }
    return null;
  }

  const clock = new THREE.Clock();
  const onFrame = new Set();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const fn of onFrame) fn(dt, clock.elapsedTime);
    controls.update();
    renderer.render(scene, camera);
  });

  /** Put the camera back where show() framed the model. */
  function resetView() {
    // Use up any leftover drag momentum first, or damping keeps nudging the camera afterwards.
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    controls.update();
    controls.enableDamping = true;
  }

  return { show, resetView, partAt, surfaceAt, onFrame, camera, controls, canvas: renderer.domElement };
}
