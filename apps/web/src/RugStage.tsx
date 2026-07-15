import { useEffect, useRef } from "react";
import * as THREE from "three";

export function RugStage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 3.15, 7.6);
    camera.lookAt(0, -0.65, -0.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "rug-stage-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.prepend(renderer.domElement);

    const renderScene = () => renderer.render(scene, camera);
    const loader = new THREE.TextureLoader();
    let rugMaterial: THREE.MeshBasicMaterial;
    let rollerMaterial: THREE.MeshBasicMaterial;
    const rugTexture = loader.load("/assets/rug-texture.jpg", () => {
      rugMaterial.visible = true;
      rollerMaterial.visible = true;
      renderScene();
    });
    rugTexture.colorSpace = THREE.SRGBColorSpace;
    rugTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const peopleTexture = loader.load("/assets/speculator-group.png", renderScene);
    peopleTexture.colorSpace = THREE.SRGBColorSpace;

    const founderTexture = loader.load("/assets/founder-lever.png", renderScene);
    founderTexture.colorSpace = THREE.SRGBColorSpace;

    const rugWidth = 5.8;
    const rugDepth = 4.1;
    const rugLaid = 0.78;
    const visibleDepth = rugDepth * rugLaid;
    const backEdge = -1.55;
    rugMaterial = new THREE.MeshBasicMaterial({ map: rugTexture, side: THREE.DoubleSide, visible: false });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(rugWidth, rugDepth), rugMaterial);
    rug.rotation.x = -Math.PI / 2;
    rug.scale.y = rugLaid;
    rug.position.set(-0.35, -1.25, backEdge + visibleDepth / 2);
    scene.add(rug);

    rollerMaterial = new THREE.MeshBasicMaterial({ map: rugTexture, visible: false });
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, rugWidth, 30, 1), rollerMaterial);
    roller.rotation.set(-rugLaid * Math.PI * 2.4, 0, Math.PI / 2);
    roller.position.set(-0.35, -1.02, backEdge + visibleDepth);
    scene.add(roller);

    const peopleMaterial = new THREE.SpriteMaterial({ map: peopleTexture, transparent: true, alphaTest: 0.02, depthTest: false, depthWrite: false });
    const people = new THREE.Sprite(peopleMaterial);
    people.scale.set(2.55, 2.55, 1);
    people.position.set(-0.35, -0.82, -0.22 + visibleDepth * 0.07);
    people.renderOrder = 4;
    scene.add(people);

    const founderMaterial = new THREE.SpriteMaterial({ map: founderTexture, transparent: true, alphaTest: 0.02, depthTest: false, depthWrite: false });
    const founder = new THREE.Sprite(founderMaterial);
    founder.scale.set(1.4, 1.4, 1);
    founder.position.set(2.15, -0.72, -0.42);
    founder.renderOrder = 5;
    scene.add(founder);

    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x27130d, transparent: true, opacity: 0.25 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), shadowMaterial);
    shadow.scale.set(1.5, 0.35, 1);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(-0.35, -1.23, people.position.z + 0.18);
    scene.add(shadow);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = camera.aspect < 0.72 ? 10.5 : camera.aspect < 1 ? 9 : 7.6;
      camera.updateProjectionMatrix();
      renderScene();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      && !window.matchMedia("(pointer: coarse)").matches;
    let frame = 0;
    if (motionAllowed) {
      const renderFrame = (time: number) => {
        people.position.y = -0.82 + Math.sin(time * 0.0015) * 0.012;
        peopleMaterial.rotation = Math.sin(time * 0.0012) * 0.004;
        founder.position.y = -0.72 + Math.sin(time * 0.0017 + 1) * 0.008;
        founderMaterial.rotation = Math.sin(time * 0.001 + 1) * 0.003;
        renderScene();
        frame = window.requestAnimationFrame(renderFrame);
      };
      frame = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      rug.geometry.dispose();
      rugMaterial.dispose();
      roller.geometry.dispose();
      rollerMaterial.dispose();
      peopleMaterial.dispose();
      founderMaterial.dispose();
      shadow.geometry.dispose();
      shadowMaterial.dispose();
      rugTexture.dispose();
      peopleTexture.dispose();
      founderTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="rug-stage" ref={mountRef} aria-hidden="true" />;
}
