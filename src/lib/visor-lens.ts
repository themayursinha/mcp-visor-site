import * as THREE from "three";

const GLASS_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uBrass;
  uniform vec3 uDeny;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float fresnel = pow(1.0 - abs(dot(n, v)), 2.6);
    float caustic = noise(vUv * 9.0 + vec2(uTime * 0.07, -uTime * 0.05));
    float radial = length(vUv - 0.5);
    float aperture = smoothstep(0.48, 0.22, radial);
    vec3 glass = vec3(0.07, 0.06, 0.05);
    vec3 col = mix(glass, uBrass * 0.55, fresnel * 0.85);
    col += uBrass * caustic * 0.07 * aperture;
    col += vec3(0.18, 0.05, 0.03) * pow(fresnel, 5.0);
    col = mix(col, uDeny, uPulse * (0.25 + 0.75 * (1.0 - radial * 1.6)));
    float alpha = 0.38 + fresnel * 0.62 + uPulse * 0.25;
    alpha *= smoothstep(0.52, 0.28, radial);
    gl_FragColor = vec4(col, alpha);
  }
`;

const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlong;
  uniform float uTravel;
  uniform float uKill;
  uniform vec3 uColor;
  void main() {
    float head = 1.0 - smoothstep(uTravel - 0.04, uTravel + 0.02, vAlong);
    float alive = (1.0 - uKill) * head;
    float glow = exp(-abs(vAlong - uTravel) * 22.0) * (1.0 - uKill);
    vec3 col = uColor * (0.4 * alive + glow * 1.4);
    float alpha = alive * 0.5 + glow * 0.85;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export type VisorLensHandle = {
  setHeroProgress: (t: number) => void;
  destroy: () => void;
};

export function mountVisorLens(
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean },
): VisorLensHandle | null {
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });
  renderer.setClearColor(0x12100c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x12100c, 0.032);

  function cssToken(name: string, fallback: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return raw || fallback;
  }

  function cssHex(name: string, fallback: number): number {
    const raw = cssToken(name, "");
    const hex = /^#([0-9a-f]{6})$/i.exec(raw);
    if (hex) return parseInt(hex[1], 16);
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw);
    if (rgb) return (Number(rgb[1]) << 16) + (Number(rgb[2]) << 8) + Number(rgb[3]);
    return fallback;
  }

  function isLightTheme(): boolean {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(3.6, 1.35, 6.4);
  camera.lookAt(0.15, -0.12, 0);

  const root = new THREE.Group();
  root.rotation.y = -0.62;
  root.rotation.x = 0.18;
  scene.add(root);

  const brass = new THREE.MeshStandardMaterial({
    color: 0xc39f77,
    metalness: 0.94,
    roughness: 0.26,
  });
  const brassDark = new THREE.MeshStandardMaterial({
    color: 0x8a6d4e,
    metalness: 0.9,
    roughness: 0.38,
  });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.08, 0.42, 32, 1, true), brassDark);
  barrel.rotation.x = Math.PI / 2;
  root.add(barrel);

  const frontRing = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 12, 48), brass);
  frontRing.position.z = 0.28;
  root.add(frontRing);

  const rearRing = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.045, 8, 32), brass);
  rearRing.position.z = -0.22;
  root.add(rearRing);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.032, 8, 40), brass);
  lip.position.z = 0.16;
  root.add(lip);

  const iris = new THREE.Group();
  iris.position.z = 0.08;
  root.add(iris);

  const blades: THREE.Mesh[] = [];
  const BLADE_COUNT = 12;
  const bladeGeo = new THREE.BoxGeometry(0.22, 0.78, 0.016);
  for (let i = 0; i < BLADE_COUNT; i++) {
    const pivot = new THREE.Group();
    const angle = (i / BLADE_COUNT) * Math.PI * 2;
    pivot.rotation.z = angle;
    const blade = new THREE.Mesh(bladeGeo, brass);
    blade.position.y = 0.48;
    blade.rotation.z = 0.22;
    pivot.add(blade);
    iris.add(pivot);
    blades.push(blade);
  }

  const glassMat = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uBrass: { value: new THREE.Color(0xe0c39b) },
      uDeny: { value: new THREE.Color(0xd0655a) },
    },
  });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), glassMat);
  glass.position.z = 0.02;
  root.add(glass);

  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ color: 0x070605 }),
  );
  pupil.position.z = -0.01;
  root.add(pupil);

  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 1024;
  plateCanvas.height = 192;
  const pctx = plateCanvas.getContext("2d");
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.45),
    new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, opacity: 0.0 }),
  );
  plate.position.set(0, -1.38, 0.28);
  root.add(plate);

  function drawPlate(lit: boolean): void {
    if (!pctx) return;
    pctx.fillStyle = cssToken("--bg", "#12100c");
    pctx.fillRect(0, 0, 1024, 192);
    pctx.strokeStyle = lit ? cssToken("--deny", "#d0655a") : cssToken("--rule", "#332d24");
    pctx.lineWidth = 3;
    pctx.strokeRect(10, 10, 1004, 172);
    pctx.font = "28px monospace";
    pctx.fillStyle = lit ? cssToken("--deny", "#d0655a") : cssToken("--ink-faint", "#857b6c");
    pctx.fillText("WALKTHROUGH  ·  DENY  ·  deny_path  **/.env", 40, 80);
    pctx.font = "22px monospace";
    pctx.fillStyle = lit ? cssToken("--accent", "#c39f77") : cssToken("--ink-dim", "#5c5348");
    pctx.fillText("fail closed  ·  no relay  ·  audit committed", 40, 128);
    plateTex.needsUpdate = true;
  }
  drawPlate(false);

  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTravel: { value: 0 },
      uKill: { value: 0 },
      uColor: { value: new THREE.Color(0xe0c39b) },
    },
  });
  const beamLen = 5.2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.018, beamLen, 12, 1, true), beamMat);
  {
    const from = new THREE.Vector3(-5.1, 0.06, 0.08);
    const to = new THREE.Vector3(0.02, 0.0, 0.06);
    const dir = new THREE.Vector3().subVectors(to, from);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    beam.scale.set(1, dir.length() / beamLen, 1);
  }
  root.add(beam);

  const ghost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 2.4, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x332d24,
      transparent: true,
      opacity: 0.35,
    }),
  );
  {
    const from = new THREE.Vector3(0.15, 0, -0.02);
    const to = new THREE.Vector3(2.6, 0, -0.08);
    const dir = new THREE.Vector3().subVectors(to, from);
    ghost.position.copy(from).add(to).multiplyScalar(0.5);
    ghost.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    ghost.scale.set(1, dir.length() / 2.4, 1);
  }
  root.add(ghost);

  const particleCount = window.innerWidth < 720 ? 60 : 140;
  const pPos = new Float32Array(particleCount * 3);
  const pVel: number[] = [];
  for (let i = 0; i < particleCount; i++) {
    const t = Math.random();
    const r = (1 - t) * 0.22 + Math.random() * 0.08;
    const a = Math.random() * Math.PI * 2;
    pPos[i * 3] = -5.1 + t * 4.9;
    pPos[i * 3 + 1] = Math.cos(a) * r;
    pPos[i * 3 + 2] = Math.sin(a) * r * 0.6;
    pVel.push(0.08 + Math.random() * 0.12);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0xe0c39b,
      size: 0.028,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  root.add(particles);

  scene.add(new THREE.AmbientLight(0x2a241c, 0.85));
  const key = new THREE.SpotLight(0xe0c39b, 32, 22, Math.PI / 4.5, 0.38, 1.0);
  key.position.set(3.4, 4.2, 5.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7aa7c4, 0.85);
  rim.position.set(-6, 0.6, -2.4);
  scene.add(rim);
  const fill = new THREE.PointLight(0xc39f77, 4.5, 10);
  fill.position.set(0.4, -0.2, 2.2);
  scene.add(fill);
  const denyLight = new THREE.PointLight(0xd0655a, 0, 5);
  denyLight.position.set(0, 0, 0.4);
  root.add(denyLight);

  function applySceneTheme(): void {
    const bg = cssHex("--bg", 0x12100c);
    renderer.setClearColor(bg, 1);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(bg);
      scene.fog.density = isLightTheme() ? 0.018 : 0.032;
    }
    const light = isLightTheme();
    const pMat = particles.material as THREE.PointsMaterial;
    pMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    pMat.opacity = light ? 0.5 : 0.7;
    pMat.color.setHex(cssHex("--accent-strong", 0xe0c39b));
    beamMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    (ghost.material as THREE.MeshBasicMaterial).color.setHex(cssHex("--rule", 0x332d24));
    drawPlate(plateLit);
  }

  let irisOpen = 0.72;
  let heroProgress = 0;
  let compactView = false;
  let running = true;
  let raf = 0;
  const clock = new THREE.Clock();

  function applyIris(open: number): void {
    const twist = 0.12 + (1 - open) * 0.62;
    for (const blade of blades) {
      blade.rotation.z = twist;
    }
  }
  applyIris(irisOpen);

  function sequence(t: number): { travel: number; kill: number; pulse: number; plate: number } {
    const cycle = 8.5;
    const x = t % cycle;
    if (x < 2.2) {
      return { travel: x / 2.2, kill: 0, pulse: 0, plate: 0 };
    }
    if (x < 2.7) {
      const k = (x - 2.2) / 0.5;
      return { travel: 1, kill: 0, pulse: k, plate: k };
    }
    if (x < 4.6) {
      const k = (x - 2.7) / 1.9;
      return { travel: 1, kill: k, pulse: 1 - k * 0.65, plate: 1 };
    }
    if (x < 6.2) {
      return { travel: 1, kill: 1, pulse: 0.12, plate: 0.85 };
    }
    const fade = (x - 6.2) / 2.3;
    return { travel: 0, kill: 0, pulse: 0, plate: Math.max(0, 1 - fade * 1.4) };
  }

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    compactView = w <= 920;
    if (compactView) {
      camera.fov = 33;
      camera.position.set(0.12, 0.08, 4.35);
      camera.lookAt(0, -0.02, 0);
      plate.visible = false;
    } else {
      camera.fov = 28;
      camera.position.set(3.6, 1.35, 6.4);
      camera.lookAt(0.15, -0.12, 0);
      plate.visible = true;
    }
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let plateLit = false;
  applySceneTheme();
  const themeObs = new MutationObserver(applySceneTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  let frameN = 0;
  let inView = true;

  const io = new IntersectionObserver(
    (entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      if (inView && running && raf === 0 && !opts.reducedMotion) {
        raf = requestAnimationFrame(frame);
      }
    },
    { threshold: 0.04 },
  );
  io.observe(canvas);
  const onVis = () => {
    if (!document.hidden && inView && running && raf === 0 && !opts.reducedMotion) {
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVis);

  function frame(): void {
    if (!running) return;
    if (document.hidden || !inView) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
    frameN += 1;
    const elapsed = clock.getElapsedTime();
    const open = THREE.MathUtils.lerp(0.9, 0.52, heroProgress);
    if (Math.abs(open - irisOpen) > 0.001) {
      irisOpen = open;
      applyIris(irisOpen);
    }

    const yBase = compactView ? -0.16 : -0.62;
    const xBase = compactView ? 0.08 : 0.18;
    root.rotation.y = yBase + Math.sin(elapsed * 0.12) * 0.035;
    root.rotation.x = xBase + Math.cos(elapsed * 0.09) * 0.018;

    const seq = opts.reducedMotion
      ? { travel: 1, kill: 0.15, pulse: 0.55, plate: 1 }
      : sequence(elapsed);

    beamMat.uniforms.uTravel.value = seq.travel;
    beamMat.uniforms.uKill.value = seq.kill;
    glassMat.uniforms.uTime.value = elapsed;
    glassMat.uniforms.uPulse.value = seq.pulse;
    denyLight.intensity = seq.pulse * 7.5;
    (plate.material as THREE.MeshBasicMaterial).opacity = seq.plate * 0.92;
    const lit = seq.plate > 0.4;
    if (lit !== plateLit) {
      plateLit = lit;
      drawPlate(lit);
    }

    if (frameN % 2 === 0) {
      const pos = pGeo.getAttribute("position");
      const step = 0.032 * (1 - seq.kill * 0.7);
      for (let i = 0; i < particleCount; i++) {
        let x = pos.getX(i) + pVel[i] * step;
        if (x > 0.05) x = -5.1;
        pos.setX(i, x);
      }
      pos.needsUpdate = true;
    }

    renderer.render(scene, camera);

    if (opts.reducedMotion) {
      running = false;
    }
  }

  if (opts.reducedMotion) {
    clock.elapsedTime = 2.45;
    frame();
  } else {
    frame();
  }

  return {
    setHeroProgress(t: number) {
      heroProgress = THREE.MathUtils.clamp(t, 0, 1);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      barrel.geometry.dispose();
      frontRing.geometry.dispose();
      rearRing.geometry.dispose();
      lip.geometry.dispose();
      bladeGeo.dispose();
      glass.geometry.dispose();
      glassMat.dispose();
      pupil.geometry.dispose();
      (pupil.material as THREE.Material).dispose();
      beam.geometry.dispose();
      beamMat.dispose();
      ghost.geometry.dispose();
      (ghost.material as THREE.Material).dispose();
      pGeo.dispose();
      (particles.material as THREE.Material).dispose();
      plate.geometry.dispose();
      (plate.material as THREE.Material).dispose();
      plateTex.dispose();
      brass.dispose();
      brassDark.dispose();
    },
  };
}
