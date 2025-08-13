'use client';

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// --- TYPE DEFINITIONS ---

interface BackgroundData {
  name: string;
  url: string | null;
  color?: number;
  isHDR?: boolean;
}

const backgrounds = {
  studio: { name: 'Studio', url: null, color: 0xffffff },
  forest: { name: 'Forest', url: '/textures/forest/forestbg.jpg' },
  city: { name: 'City at Night', url: '/textures/city/cyberbg.jpg' },
  venice: { name: 'Venice Sunset HDR', url: 'https://unpkg.com/three@0.160.0/examples/textures/equirectangular/venice_sunset_1k.hdr', isHDR: true },
  royal: { name: 'Royal Esplanade HDR', url: 'https://unpkg.com/three@0.160.0/examples/textures/equirectangular/royal_esplanade_1k.hdr', isHDR: true },
};

export interface ThreeCanvasHandles {
  playAudioWithLipSync: (audioBase64: string, visemes: any[]) => Promise<void>;
  playAnimation: (url: string) => Promise<void>;
}

export interface ThreeCanvasProps {
  characterModelUrl: string;
  idleAnimationUrl: string;
  introAnimationUrl?: string;
  interruptAnimationUrl?: string;
  backgroundData?: BackgroundData;
  backgroundPreset?: keyof typeof backgrounds;
  smileIntensity?: number;
}

const boneNameMap: { [key: string]: string } = {
  "mixamorigHips": "Hips", "mixamorigSpine": "Spine", "mixamorigSpine1": "Spine1", "mixamorigSpine2": "Spine2", "mixamorigNeck": "Neck", "mixamorigHead": "Head",
  "mixamorigLeftShoulder": "LeftShoulder", "mixamorigLeftArm": "LeftArm", "mixamorigLeftForeArm": "LeftForeArm", "mixamorigLeftHand": "LeftHand",
  "mixamorigLeftHandThumb1": "LeftHandThumb1", "mixamorigLeftHandThumb2": "LeftHandThumb2", "mixamorigLeftHandThumb3": "LeftHandThumb3",
  "mixamorigLeftHandIndex1": "LeftHandIndex1", "mixamorigLeftHandIndex2": "LeftHandIndex2", "mixamorigLeftHandIndex3": "LeftHandIndex3",
  "mixamorigLeftHandMiddle1": "LeftHandMiddle1", "mixamorigLeftHandMiddle2": "LeftHandMiddle2", "mixamorigLeftHandMiddle3": "LeftHandMiddle3",
  "mixamorigLeftHandRing1": "LeftHandRing1", "mixamorigLeftHandRing2": "LeftHandRing2", "mixamorigLeftHandRing3": "LeftHandRing3",
  "mixamorigLeftHandPinky1": "LeftHandPinky1", "mixamorigLeftHandPinky2": "LeftHandPinky2", "mixamorigLeftHandPinky3": "LeftHandPinky3",
  "mixamorigRightShoulder": "RightShoulder", "mixamorigRightArm": "RightArm", "mixamorigRightForeArm": "RightForeArm", "mixamorigRightHand": "RightHand",
  "mixamorigRightHandThumb1": "RightHandThumb1", "mixamorigRightHandThumb2": "RightHandThumb2", "mixamorigRightHandThumb3": "RightHandThumb3",
  "mixamorigRightHandIndex1": "RightHandIndex1", "mixamorigRightHandIndex2": "RightHandIndex2", "mixamorigRightHandIndex3": "RightHandIndex3",
  "mixamorigRightHandMiddle1": "RightHandMiddle1", "mixamorigRightHandMiddle2": "LeftHandMiddle2", "mixamorigRightHandMiddle3": "RightHandMiddle3",
  "mixamorigRightHandRing1": "RightHandRing1", "mixamorigRightHandRing2": "RightHandRing2", "mixamorigRightHandRing3": "RightHandRing3",
  "mixamorigRightHandPinky1": "RightHandPinky1", "mixamorigRightHandPinky2": "RightHandPinky2", "mixamorigRightHandPinky3": "RightHandPinky3",
  "mixamorigLeftUpLeg": "LeftUpLeg", "mixamorigLeftLeg": "LeftLeg", "mixamorigLeftFoot": "LeftFoot", "mixamorigLeftToeBase": "LeftToeBase",
  "mixamorigRightUpLeg": "RightUpLeg", "mixamorigRightLeg": "RightLeg", "mixamorigRightFoot": "RightFoot", "mixamorigRightToeBase": "RightToeBase"
};


// --- COMPONENT DEFINITION ---

const ThreeCanvas = forwardRef<ThreeCanvasHandles, ThreeCanvasProps>(({
  characterModelUrl,
  idleAnimationUrl,
  introAnimationUrl,
  interruptAnimationUrl,
  backgroundData,
  backgroundPreset = 'studio',
  smileIntensity = 0,
}, ref) => {

  const mountRef = useRef<HTMLDivElement>(null);
  const animationStateRef = useRef<'intro' | 'idle' | 'interrupt'>(introAnimationUrl ? 'intro' : 'idle');

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const faceMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const audioListenerRef = useRef<THREE.AudioListener | null>(null);

  const retargetClip = (clip: THREE.AnimationClip) => {
      clip.tracks = clip.tracks.filter(track => track.name !== 'mixamorigHips.position');
      clip.tracks.forEach(track => {
        const boneName = track.name.split('.')[0];
        if (boneNameMap[boneName]) {
            track.name = track.name.replace(boneName, boneNameMap[boneName]);
        }
      });
      return clip;
  };

  useImperativeHandle(ref, () => ({
    
    playAudioWithLipSync: async (audioBase64, visemes) => {
      const audioListener = audioListenerRef.current;
      const faceMesh = faceMeshRef.current;
      if (!audioListener || !faceMesh || !faceMesh.morphTargetDictionary) return;

      const audioBlob = await (await fetch(`data:audio/mp3;base64,${audioBase64}`)).blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new THREE.Audio(audioListener);
      
      return new Promise((resolve) => {
        new THREE.AudioLoader().load(audioUrl, (buffer) => {
          audio.setBuffer(buffer);
          audio.play();
          
          faceMesh.userData.visemes = visemes;
          faceMesh.userData.audioStartTime = performance.now();
          
          audio.onEnded = () => {
            faceMesh.userData.visemes = [];
            if (faceMesh.morphTargetDictionary) {
                Object.keys(faceMesh.morphTargetDictionary).forEach(key => {
                    if (key.startsWith('viseme_')) {
                        if (faceMesh.morphTargetDictionary) {
                            const index = faceMesh.morphTargetDictionary[key];
                            if (faceMesh.morphTargetInfluences) {
                                faceMesh.morphTargetInfluences[index] = 0;
                            }
                        }
                    }
                });
            }
            URL.revokeObjectURL(audioUrl);
            resolve();
          };
        });
      });
    },

    playAnimation: (url) => {
        const mixer = mixerRef.current;
        const idleAction = idleActionRef.current;
        if (!mixer || !idleAction) return Promise.resolve();
        
        return new Promise((resolve, reject) => {
            new FBXLoader().load(
              url, 
              (fbx) => {
                if (!fbx.animations.length) {
                    console.error("FBX file has no animations:", url);
                    return reject(new Error("FBX file has no animations"));
                }
                const clip = retargetClip(fbx.animations[0]);
                const action = mixer.clipAction(clip);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                
                idleAction.fadeOut(0.3);
                action.reset().fadeIn(0.3).play();

                const onFinished = (e: any) => {
                    if (e.action === action) {
                        mixer.removeEventListener('finished', onFinished);
                        action.fadeOut(0.3);
                        idleAction.reset().fadeIn(0.3).play();
                        resolve();
                    }
                };
                mixer.addEventListener('finished', onFinished);
              },
              undefined, 
              (error) => reject(error)
            );
        });
    }

  }));

  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    const selectedBackground: BackgroundData = backgroundData || backgrounds[backgroundPreset] || backgrounds.studio;
    const textureLoader = new THREE.TextureLoader();
    let ground: THREE.Mesh;

    switch (selectedBackground.name) {
      case 'Forest':
        textureLoader.load('/textures/forest/forestbg.jpg', (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          scene.background = texture;
          scene.environment = texture;
        });
        const forestFloorTexture = textureLoader.load('/textures/forest/Grass.jpg');
        forestFloorTexture.wrapS = THREE.RepeatWrapping;
        forestFloorTexture.wrapT = THREE.RepeatWrapping;
        forestFloorTexture.repeat.set(25, 25);
        ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: forestFloorTexture }));
        break;

      case 'City at Night':
        textureLoader.load('/textures/city/cyberbg.jpg', (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          scene.background = texture;
          scene.environment = texture;
        });
        const cityFloorTexture = textureLoader.load('/textures/city/floormetal.jpg');
        cityFloorTexture.wrapS = THREE.RepeatWrapping;
        cityFloorTexture.wrapT = THREE.RepeatWrapping;
        cityFloorTexture.repeat.set(25, 25);
        ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: cityFloorTexture }));
        break;
      
      case 'Venice Sunset HDR':
      case 'Royal Esplanade HDR':
        if (selectedBackground.url) {
            new RGBELoader().load(selectedBackground.url, (texture) => {
              texture.mapping = THREE.EquirectangularReflectionMapping;
              scene.background = texture;
              scene.environment = texture;
            });
        }
        ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false }));
        break;

      case 'Studio':
      default:
        scene.background = new THREE.Color(selectedBackground.color || 0xa0a0a0);
        ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false }));
        break;
    }
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 4);
    
    const audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    audioListenerRef.current = audioListener;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    currentMount.appendChild(renderer.domElement);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    const clock = new THREE.Clock();
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    
    let timeToNextInterrupt = 0;
    let timeToNextBlink = Math.random() * 4 + 2;
    let isBlinking = false, blinkTimer = 0;
    const blinkDuration = 0.2;
    let timeToNextSaccade = Math.random() * 3 + 1;
    let isLooking = false, saccadeTimer = 0;
    const saccadeDuration = 0.1;
    let lookTarget = { up: 0, down: 0, left: 0, right: 0 };
    
    const setNextInterrupt = () => { timeToNextInterrupt = Math.random() * 10 + 5; };

    const promises = [
        gltfLoader.loadAsync(characterModelUrl),
        fbxLoader.loadAsync(idleAnimationUrl),
    ];
    if (introAnimationUrl) promises.push(fbxLoader.loadAsync(introAnimationUrl));
    if (interruptAnimationUrl) promises.push(fbxLoader.loadAsync(interruptAnimationUrl));
    
    Promise.all(promises).then((assets) => {
        let assetIndex = 0;
        const gltf = assets[assetIndex++] as any;
        const idleFbx = assets[assetIndex++] as any;
        const introFbx = introAnimationUrl ? (assets[assetIndex++] as any) : null;
        const interruptFbx = interruptAnimationUrl ? (assets[assetIndex++] as any) : null;
        
        const characterModel = gltf.scene;
        scene.add(characterModel);
        
        mixerRef.current = new THREE.AnimationMixer(characterModel);
        
        characterModel.traverse((object: any) => {
          if (object.isMesh) object.castShadow = true;
          if (object.isSkinnedMesh && object.morphTargetDictionary) {
            if (object.name === 'Wolf3D_Head' || object.name === 'Wolf3D_Avatar') {
                 faceMeshRef.current = object;
                 console.log('Available morph targets for', object.name, ':', Object.keys(object.morphTargetDictionary));
            }
          }
        });

        const idleAction = mixerRef.current.clipAction(retargetClip(idleFbx.animations[0]));
        idleAction.play();
        idleActionRef.current = idleAction;

        let introAction: THREE.AnimationAction | null = null;
        if (introFbx) {
            introAction = mixerRef.current.clipAction(retargetClip(introFbx.animations[0]));
            introAction.setLoop(THREE.LoopOnce, 1);
            introAction.clampWhenFinished = true;
            idleAction.weight = 0;
            introAction.play();
        }

        let interruptAction: THREE.AnimationAction | null = null;
        if (interruptFbx) {
            interruptAction = mixerRef.current.clipAction(retargetClip(interruptFbx.animations[0]));
            interruptAction.setLoop(THREE.LoopOnce, 1);
            interruptAction.clampWhenFinished = true;
            setNextInterrupt();
        }

        mixerRef.current.addEventListener('finished', (e: any) => {
            const idle = idleActionRef.current;
            if (!idle) return;

            if (e.action === introAction || e.action === interruptAction) {
                animationStateRef.current = 'idle';
                e.action.fadeOut(0.5);
                idle.reset().setEffectiveWeight(1).fadeIn(0.5).play();
                if (e.action === interruptAction) {
                    setNextInterrupt();
                }
            }
        });
      }).catch(error => console.error('Error loading assets:', error));

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      
      const mixer = mixerRef.current;
      if (mixer) mixer.update(delta);
      controls.update();

      const faceMesh = faceMeshRef.current;
      if (faceMesh && faceMesh.morphTargetDictionary && faceMesh.morphTargetInfluences) {
        if (faceMesh.userData.visemes?.length > 0) {
            const now = performance.now();
            const elapsedTime = (now - faceMesh.userData.audioStartTime) / 1000;
            const currentViseme = faceMesh.userData.visemes.reduce((prev:any, curr:any) => (curr.time <= elapsedTime ? curr : prev), null);
            
            Object.keys(faceMesh.morphTargetDictionary).forEach(key => {
                if (key.startsWith('viseme_')) {
                    if (faceMesh.morphTargetDictionary) {
                        const index = faceMesh.morphTargetDictionary[key];
                        faceMesh.morphTargetInfluences![index] = 0;
                    }
                }
            });

            if (currentViseme) {
                // The viseme value from the backend already includes "viseme_", so we use it directly.
                const visemeIndex = faceMesh.morphTargetDictionary[currentViseme.value];
                if (visemeIndex !== undefined) {
                    faceMesh.morphTargetInfluences[visemeIndex] = 1;
                }
            }
        } else {
            // Idle Blinking
            const blinkLeftIndex = faceMesh.morphTargetDictionary['eyeBlinkLeft'];
            const blinkRightIndex = faceMesh.morphTargetDictionary['eyeBlinkRight'];
            if (isBlinking) {
                blinkTimer += delta;
                const blinkProgress = Math.min(blinkTimer / blinkDuration, 1);
                const blinkValue = Math.sin(blinkProgress * Math.PI);
                if (blinkLeftIndex !== undefined) faceMesh.morphTargetInfluences[blinkLeftIndex] = blinkValue;
                if (blinkRightIndex !== undefined) faceMesh.morphTargetInfluences[blinkRightIndex] = blinkValue;

                if (blinkProgress >= 1) {
                    isBlinking = false;
                    timeToNextBlink = Math.random() * 4 + 2;
                }
            } else {
                timeToNextBlink -= delta;
                if (timeToNextBlink <= 0) {
                    isBlinking = true;
                    blinkTimer = 0;
                }
            }
          
            // Idle Eye Movement
            if (!isBlinking) {
                const lookUpIndex = faceMesh.morphTargetDictionary['eyesLookUp'];
                const lookDownIndex = faceMesh.morphTargetDictionary['eyesLookDown'];
                const lookLeftIndex = faceMesh.morphTargetDictionary['eyesLookLeft'];
                const lookRightIndex = faceMesh.morphTargetDictionary['eyesLookRight'];
                if (isLooking) {
                    saccadeTimer += delta;
                    if (saccadeTimer >= saccadeDuration) {
                        isLooking = false;
                        timeToNextSaccade = Math.random() * 3 + 2;
                    }
                } else {
                    if (lookUpIndex !== undefined) faceMesh.morphTargetInfluences[lookUpIndex] = THREE.MathUtils.lerp(faceMesh.morphTargetInfluences[lookUpIndex], lookTarget.up, 0.1);
                    if (lookDownIndex !== undefined) faceMesh.morphTargetInfluences[lookDownIndex] = THREE.MathUtils.lerp(faceMesh.morphTargetInfluences[lookDownIndex], lookTarget.down, 0.1);
                    if (lookLeftIndex !== undefined) faceMesh.morphTargetInfluences[lookLeftIndex] = THREE.MathUtils.lerp(faceMesh.morphTargetInfluences[lookLeftIndex], lookTarget.left, 0.1);
                    if (lookRightIndex !== undefined) faceMesh.morphTargetInfluences[lookRightIndex] = THREE.MathUtils.lerp(faceMesh.morphTargetInfluences[lookRightIndex], lookTarget.right, 0.1);

                    timeToNextSaccade -= delta;
                    if (timeToNextSaccade <= 0) {
                        isLooking = true;
                        saccadeTimer = 0;
                        lookTarget = { up: 0, down: 0, left: 0, right: 0 };
                        const direction = Math.floor(Math.random() * 5);
                        const intensity = Math.random() * 0.5 + 0.2;
                        switch(direction) {
                            case 0: lookTarget.up = intensity; break;
                            case 1: lookTarget.down = intensity; break;
                            case 2: lookTarget.left = intensity; break;
                            case 3: lookTarget.right = intensity; break;
                            default: break;
                        }
                    }
                }
            }
        }

        const smileIndex = faceMesh.morphTargetDictionary['mouthSmile'];
        if (smileIndex !== undefined) {
            faceMesh.morphTargetInfluences[smileIndex] = THREE.MathUtils.lerp(faceMesh.morphTargetInfluences[smileIndex], smileIntensity, 0.1);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if(currentMount) {
        camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        if (currentMount && renderer.domElement) {
            currentMount.removeChild(renderer.domElement);
        }
        renderer.dispose();
        scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else if (object.material) {
                    object.material.dispose();
                }
            }
        });
    };
  }, [
      characterModelUrl,
      idleAnimationUrl,
      introAnimationUrl,
      interruptAnimationUrl,
      smileIntensity,
      backgroundPreset,
      JSON.stringify(backgroundData)
    ]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
});

ThreeCanvas.displayName = 'ThreeCanvas';
export default ThreeCanvas;