"use client";

import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as THREE from "three";
// Replace addon imports with examples/jsm imports for npm usage
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// Removed unused bvhPlayer import to revert
// import { bvhPlayer } from "./BVHAnimationPlayer";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useState as reactUseState } from "react";

// --- TYPE DEFINITIONS ---
interface BackgroundData {
  name: string;
  url: string | null;
  color?: number;
  isHDR?: boolean;
}

const backgrounds = {
  studio: { name: "Studio", url: null, color: 0xffffff },
  forest: { name: "Forest", url: "/textures/forest/forestbg.jpg" },
  city: { name: "City at Night", url: "/textures/city/cyberbg.jpg" },
  venice: {
    name: "Venice Sunset HDR",
    url: "https://unpkg.com/three@0.160.0/examples/textures/equirectangular/venice_sunset_1k.hdr",
    isHDR: true,
  },
  royal: {
    name: "Royal Esplanade HDR",
    url: "https://unpkg.com/three@0.160.0/examples/textures/equirectangular/royal_esplanade_1k.hdr",
    isHDR: true,
  },
};

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "excited"
  | "thinking"
  | "confused"
  | "annoyed"
  | "flirty";

export interface ThreeCanvasHandles {
  playAudioWithEmotionAndLipSync: (
    audioUrl: string,
    visemes: { time: number; value: string; jaw: number }[],
    emotion: Emotion
  ) => Promise<void>;
  playAnimation: (url: string) => Promise<void>;
  setStaticEmotion: (emotion: Emotion) => void;
  getAnimationObjects: () => {
    mixer: THREE.AnimationMixer | null;
    model: THREE.Object3D | null;
    idleAction: THREE.AnimationAction | null;
  };
}

export interface ThreeCanvasProps {
  characterModelUrl: string;
  idleAnimationUrl: string;
  introAnimationUrl?: string;
  interruptAnimationUrl?: string;
  talkingAnimationUrl1?: string;
  talkingAnimationUrl2?: string;
  backgroundData?: BackgroundData;
  backgroundPreset?: keyof typeof backgrounds;
}

const boneNameMap: { [key: string]: string } = {
  mixamorigHips: "Hips",
  mixamorigSpine: "Spine",
  mixamorigSpine1: "Spine1",
  mixamorigSpine2: "Spine2",
  mixamorigNeck: "Neck",
  mixamorigHead: "Head",
  mixamorigLeftShoulder: "LeftShoulder",
  mixamorigLeftArm: "LeftArm",
  mixamorigLeftForeArm: "LeftForeArm",
  mixamorigLeftHand: "LeftHand",
  mixamorigLeftHandThumb1: "LeftHandThumb1",
  mixamorigLeftHandThumb2: "LeftHandThumb2",
  mixamorigLeftHandThumb3: "LeftHandThumb3",
  mixamorigLeftHandIndex1: "LeftHandIndex1",
  mixamorigLeftHandIndex2: "LeftHandIndex2",
  mixamorigLeftHandIndex3: "LeftHandIndex3",
  mixamorigLeftHandMiddle1: "LeftHandMiddle1",
  mixamorigLeftHandMiddle2: "LeftHandMiddle2",
  mixamorigLeftHandMiddle3: "LeftHandMiddle3",
  mixamorigLeftHandRing1: "LeftHandRing1",
  mixamorigLeftHandRing2: "LeftHandRing2",
  mixamorigLeftHandRing3: "LeftHandRing3",
  mixamorigLeftHandPinky1: "LeftHandPinky1",
  mixamorigLeftHandPinky2: "LeftHandPinky2",
  mixamorigLeftHandPinky3: "LeftHandPinky3",
  mixamorigRightShoulder: "RightShoulder",
  mixamorigRightArm: "RightArm",
  mixamorigRightForeArm: "RightForeArm",
  mixamorigRightHand: "RightHand",
  mixamorigRightHandThumb1: "RightHandThumb1",
  mixamorigRightHandThumb2: "RightHandThumb2",
  mixamorigRightHandThumb3: "RightHandThumb3",
  mixamorigRightHandIndex1: "RightHandIndex1",
  mixamorigRightHandIndex2: "RightHandIndex2",
  mixamorigRightHandIndex3: "RightHandIndex3",
  mixamorigRightHandMiddle1: "RightHandMiddle1",
  // Fixed typo: map to RightHandMiddle2 (was LeftHandMiddle2)
  mixamorigRightHandMiddle2: "RightHandMiddle2",
  mixamorigRightHandMiddle3: "RightHandMiddle3",
  mixamorigRightHandRing1: "RightHandRing1",
  mixamorigRightHandRing2: "RightHandRing2",
  mixamorigRightHandRing3: "RightHandRing3",
  mixamorigRightHandPinky1: "RightHandPinky1",
  mixamorigRightHandPinky2: "RightHandPinky2",
  mixamorigRightHandPinky3: "RightHandPinky3",
  mixamorigLeftUpLeg: "LeftUpLeg",
  mixamorigLeftLeg: "LeftLeg",
  mixamorigLeftFoot: "LeftFoot",
  mixamorigLeftToeBase: "LeftToeBase",
  mixamorigRightUpLeg: "RightUpLeg",
  mixamorigRightLeg: "RightLeg",
  mixamorigRightFoot: "RightFoot",
  mixamorigRightToeBase: "RightToeBase",
};

// Retarget options to match the debug.html behavior closely
const RPM_TPOSE_RETARGET_OPTIONS = {
  preservePosition: false,
  useFirstFrameAsBindPose: false,
  hip: "Hips",
  names: {
    Hips: "Hips",
    Spine: "Spine",
    Spine1: "Spine1",
    Spine2: "Spine2",
    Neck: "Neck",
    Head: "Head",
    LeftShoulder: "LeftShoulder",
    LeftArm: "LeftArm",
    LeftForeArm: "LeftForeArm",
    LeftHand: "LeftHand",
    RightShoulder: "RightShoulder",
    RightArm: "RightArm",
    RightForeArm: "RightForeArm",
    RightHand: "RightHand",
    LeftUpLeg: "LeftUpLeg",
    LeftLeg: "LeftLeg",
    LeftFoot: "LeftFoot",
    LeftToe: "LeftToeBase",
    RightUpLeg: "RightUpLeg",
    RightLeg: "RightLeg",
    RightFoot: "RightFoot",
    RightToe: "RightToeBase",
    // IMPORTANT: intentionally omit finger mappings to avoid over-rotating wrists
    // when BVH contains finger joints. This prevents fist-like poses.
  },
};

const bvhRetargetMap = {

  preservePosition: false,
  useFirstFrameAsBindPose: true,
  hip: "Hips",
  names: {
    Spine: "Spine",
    Spine1: "Spine1",
    Spine2: "Spine2",
    Neck: "Neck",
    Head: "Head",
    LeftShoulder: "LeftShoulder",
    LeftArm: "LeftArm",
    LeftForeArm: "LeftForeArm",
    LeftHand: "LeftHand",
    RightShoulder: "RightShoulder",
    RightArm: "RightArm",
    RightForeArm: "RightForeArm",
    RightHand: "RightHand",
    LeftUpLeg: "LeftUpLeg",
    LeftLeg: "LeftLeg",
    LeftFoot: "LeftFoot",
    LeftToeBase: "LeftToe",
    RightUpLeg: "RightUpLeg",
    RightLeg: "RightLeg",
    RightFoot: "RightFoot",
    RightToeBase: "RightToe",
    LeftHandThumb1: "LeftHand",
    LeftHandThumb2: "LeftHand",
    LeftHandThumb3: "LeftHand",
    LeftHandIndex1: "LeftHand",
    LeftHandIndex2: "LeftHand",
    LeftHandIndex3: "LeftHand",
    LeftHandMiddle1: "LeftHand",
    LeftHandMiddle2: "LeftHand",
    LeftHandMiddle3: "LeftHand",
    LeftHandRing1: "LeftHand",
    LeftHandRing2: "LeftHand",
    LeftHandRing3: "LeftHand",
    LeftHandPinky1: "LeftHand",
    LeftHandPinky2: "LeftHand",
    LeftHandPinky3: "LeftHand",
    RightHandThumb1: "RightHand",
    RightHandThumb2: "RightHand",
    RightHandThumb3: "RightHand",
    RightHandIndex1: "RightHand",
    RightHandIndex2: "RightHand",
    RightHandIndex3: "RightHand",
    RightHandMiddle1: "RightHand",
    RightHandMiddle2: "RightHand",
    RightHandMiddle3: "RightHand",
    RightHandRing1: "RightHand",
    RightHandRing2: "RightHand",
    RightHandRing3: "RightHand",
    RightHandPinky1: "RightHand",
    RightHandPinky2: "RightHand",
    RightHandPinky3: "RightHand",
  },
};
const LERP_SPEED = 10;
// Fade timings (seconds). Increase FADE_DURATION to make animation crossfades
// and fade-to-idle longer so transient T-poses are not visible on reset.
const FADE_DURATION = 1.5;
const OPACITY_FADE = 0.6;

const ThreeCanvas = forwardRef<ThreeCanvasHandles, ThreeCanvasProps>(
  (
    {
      characterModelUrl,
      idleAnimationUrl,
      introAnimationUrl,
      interruptAnimationUrl,
      talkingAnimationUrl1,
      talkingAnimationUrl2,
      backgroundData,
      backgroundPreset = "studio",
    },
    ref
  ) => {
    const emotions: { [key in Emotion]: { [key: string]: number } } = {
      neutral: {},
      happy: {
        mouthSmile: 0.6,
        cheekSquintLeft: 0.5,
        cheekSquintRight: 0.5,
        browInnerUp: 0.1,
      },
      sad: { browInnerUp: 0.8, mouthFrownLeft: 0.5, mouthFrownRight: 0.5 },
      excited: {
        eyeWideLeft: 0.7,
        eyeWideRight: 0.7,
        browInnerUp: 0.6,
        jawOpen: 0.3,
      },
      thinking: {
        browDownLeft: 0.8,
        browDownRight: 0.8,
        mouthPressLeft: 0.5,
        mouthPressRight: 0.5,
      },
      confused: { browOuterUpLeft: 1.0, mouthPucker: 0.3 },
      annoyed: {
        browDownLeft: 1.0,
        browDownRight: 1.0,
        mouthFrownLeft: 0.7,
        mouthFrownRight: 0.7,
        noseSneerLeft: 0.4,
      },
      flirty: {
        mouthSmileLeft: 0.6,
        eyeSquintLeft: 0.8,
        browOuterUpRight: 0.5,
      },
    };

    const targetVisemeWeights = useRef<{ [key: string]: number }>({}).current;
    const targetJawOpen = useRef(0);
    const targetEmotionWeights = useRef<{ [key: string]: number }>({}).current;
    const mountRef = useRef<HTMLDivElement>(null);
  const [cameraPosition, setCameraPosition] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});
    const animationStateRef = useRef<
      "intro" | "idle" | "interrupt" | "talking"
    >(introAnimationUrl ? "intro" : "idle");
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const faceMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const bodyMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const idleActionRef = useRef<THREE.AnimationAction | null>(null);
    const currentlyPlayingTalkingActionRef =
      useRef<THREE.AnimationAction | null>(null);
    const isWaitingAfterTalkRef = useRef<boolean>(false);
    const currentVisemeIndexRef = useRef(0);
    const audioRef = useRef<THREE.Audio | null>(null);
    const currentSpeechEmotionRef = useRef<Emotion>("neutral");
    const speechEmotionIntensityRef = useRef(0);

    // Camera/model follow & reset helpers
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const isFollowingRef = useRef(false);
    const cameraStartPosRef = useRef(new THREE.Vector3());
    const controlsStartTargetRef = useRef(new THREE.Vector3());
    const cameraOffsetRef = useRef(new THREE.Vector3());
    const controlsOffsetRef = useRef(new THREE.Vector3());
    const modelRootRef = useRef<THREE.Object3D | null>(null);
    const modelStartPosRef = useRef(new THREE.Vector3());
    const modelStartQuatRef = useRef(new THREE.Quaternion());
    const followAnchorRef = useRef<THREE.Object3D | null>(null); // usually the Hips bone
    // Store original OrbitControls settings so we can restore after follow
    const prevControlsStateRef = useRef<{
      enablePan: boolean;
      enableRotate: boolean;
      enableDamping: boolean;
      dampingFactor: number;
    } | null>(null);
  // Desired front-view camera settings during follow (tweak to taste)
  // Use a small distance and zero side to stay centered and closer to the character.
  // Lowered height so follow view isn't too high above the character.
  const followViewRef = useRef({ distance: 3, height: 0, side: 1.2 });

    const playAudioWithEmotionAndLipSync = async (
      audioUrl: string,
      visemes: { time: number; value: string; jaw: number }[],
      emotion: Emotion,
      onEndedCallback?: () => void
    ) => {
      const audio = audioRef.current;
      const faceMesh = faceMeshRef.current;
      if (!audio || !faceMesh) {
        return;
      }
      if (audio.isPlaying) {
        audio.stop();
      }

      isWaitingAfterTalkRef.current = false;
      currentVisemeIndexRef.current = 0;
      Object.keys(targetVisemeWeights).forEach((key) => {
        if (key.startsWith("viseme_")) targetVisemeWeights[key] = 0;
      });
      targetJawOpen.current = 0;
      currentSpeechEmotionRef.current = emotion;

      return new Promise<void>((resolve) => {
        new THREE.AudioLoader().load(
          audioUrl,
          (buffer) => {
            audio.setBuffer(buffer);
            audio.onEnded = () => {
              isWaitingAfterTalkRef.current = true;
              audio.onEnded = () => {};
              setTimeout(() => {
                if (faceMesh) {
                  faceMesh.userData.visemes = [];
                }
                isWaitingAfterTalkRef.current = false;
                currentSpeechEmotionRef.current = "neutral";
                if (onEndedCallback) onEndedCallback();
                resolve();
              }, 2000);
            };
            audio.play();
            faceMesh.userData.visemes = visemes;
            faceMesh.userData.audioStartTime = performance.now();
          },
          undefined,
          (err) => {
            console.error(err);
            resolve();
          }
        );
      });
    };

    const retargetClip = (clip: THREE.AnimationClip) => {
      clip.tracks = clip.tracks.filter(
        (track) => track.name !== "mixamorigHips.position"
      );
      clip.tracks.forEach((track) => {
        const boneName = track.name.split(".")[0];
        if (boneNameMap[boneName]) {
          track.name = track.name.replace(boneName, boneNameMap[boneName]);
        }
      });
      return clip;
    };

    // Try to find a pelvis/hips bone on the target model for camera follow
    const findPelvisBone = (mesh: THREE.SkinnedMesh): THREE.Bone | null => {
      if (!mesh?.skeleton) return null;
      const candidates = mesh.skeleton.bones;
      const preferred = [
        /^Hips$/i,
        /mixamorig[:]?Hips/i,
        /Pelvis/i,
        /Root$/i,
        /Spine$/i,
      ];
      for (const pattern of preferred) {
        const bone = candidates.find((b) => pattern.test(b.name));
        if (bone) return bone;
      }
      // Fallback to the shortest-named bone near root
      const sorted = [...candidates].sort((a, b) => a.name.length - b.name.length);
      return sorted[0] || null;
    };

    // Smoothly fade all mesh materials' opacity on an object
    const fadeObjectOpacity = (
      obj: THREE.Object3D,
      targetOpacity: number,
      duration: number
    ): Promise<void> => {
      return new Promise((resolve) => {
        if (!obj || duration <= 0) {
          obj?.traverse((child: any) => {
            if (child.isMesh && child.material) {
              const mats = Array.isArray(child.material)
                ? child.material
                : [child.material];
              mats.forEach((m: any) => {
                if (m && typeof m.opacity === "number") {
                  m.transparent = true;
                  m.opacity = targetOpacity;
                  m.needsUpdate = true;
                }
              });
            }
          });
          resolve();
          return;
        }

        const materials: { mat: any; start: number }[] = [];
        obj.traverse((child: any) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m: any) => {
              if (m && typeof m.opacity === "number") {
                m.transparent = true;
                materials.push({ mat: m, start: m.opacity ?? 1 });
              }
            });
          }
        });

        const startTime = performance.now();
        const tick = () => {
          const now = performance.now();
          const t = Math.min(1, (now - startTime) / (duration * 1000));
          materials.forEach(({ mat, start }) => {
            mat.opacity = start + (targetOpacity - start) * t;
            mat.needsUpdate = true;
          });
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    };

    useImperativeHandle(ref, () => ({
      playAudioWithEmotionAndLipSync: async (
        audioBase64OrUrl,
        visemes,
        emotion
      ) => {
        const isBase64 = audioBase64OrUrl.startsWith("data:audio");
        if (isBase64) {
          const audioBlob = await (await fetch(audioBase64OrUrl)).blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          await playAudioWithEmotionAndLipSync(
            audioUrl,
            visemes,
            emotion,
            () => {
              URL.revokeObjectURL(audioUrl);
            }
          );
        } else {
          await playAudioWithEmotionAndLipSync(
            audioBase64OrUrl,
            visemes,
            emotion
          );
        }
      },
      playAnimation: (url) => {
        const mixer = mixerRef.current;
        const idleAction = idleActionRef.current;
        const bodyMesh = bodyMeshRef.current;
        if (!mixer || !idleAction || !bodyMesh) {
          return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
          const bvhLoader = new BVHLoader();
          bvhLoader.load(
            url,
            (bvh) => {
              if (!bvh.clip) {
                return reject(new Error("BVH file has no animation data"));
              }

              // Clean reset like debug.html
              mixer.stopAllAction();
              bodyMesh.skeleton.pose();

              // Optional: strip root translation if needed
              // const stripped = bvh.clip.clone();
              // stripped.tracks = stripped.tracks.filter(t => !t.name.endsWith('Hips.position'));

              const clip = SkeletonUtils.retargetClip(
                bodyMesh,
                bvh.skeleton,
                bvh.clip,
                RPM_TPOSE_RETARGET_OPTIONS
              );

              // Dedupe wrist quaternion tracks to avoid over-rotation
              const seenQuat = new Set<string>();
              const deduped: THREE.KeyframeTrack[] = [];
              for (const track of clip.tracks) {
                if (
                  track.name.endsWith(".quaternion") &&
                  (track.name.startsWith("LeftHand.") ||
                    track.name.startsWith("RightHand."))
                ) {
                  if (seenQuat.has(track.name)) {
                    continue; // drop duplicates
                  }
                  seenQuat.add(track.name);
                }
                deduped.push(track);
              }
              clip.tracks = deduped;

              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;

              // Setup camera follow offsets relative to the model root
              const camera = cameraRef.current;
              const controls = controlsRef.current;
              // Prefer following the pelvis/hips bone if available
              const hipsBone = findPelvisBone(bodyMesh) as unknown as THREE.Object3D | null;
              followAnchorRef.current = hipsBone || (bodyMesh as unknown as THREE.Object3D);
              const anchor = followAnchorRef.current;
              if (camera && controls && anchor) {
                anchor.updateMatrixWorld?.(true);
                const anchorPos = new THREE.Vector3();
                anchor.getWorldPosition(anchorPos);
                cameraStartPosRef.current.copy(camera.position);
                controlsStartTargetRef.current.copy(controls.target);
                // Front-of-character offset: in front (opposite forward), a bit above hips
                const q = new THREE.Quaternion();
                anchor.getWorldQuaternion(q);
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
                const { distance, height, side } = followViewRef.current;
                cameraOffsetRef.current
                  .copy(right).multiplyScalar(side)
                  .addScaledVector(up, height)
                  .addScaledVector(forward, -distance);
                // Debug log so we can verify the follow anchor and offset
                console.log("follow enabled: anchor=", anchor.name || '(root)', "anchorPos=", anchorPos.toArray(), "offset=", cameraOffsetRef.current.toArray());
                // Force the controls target to be exactly the anchor (center the character)
                controlsOffsetRef.current.set(0, 0, 0);

                // Disable user interactions that can push the target off-center during follow
                prevControlsStateRef.current = {
                  enablePan: controls.enablePan,
                  enableRotate: controls.enableRotate,
                  enableDamping: controls.enableDamping,
                  dampingFactor: controls.dampingFactor,
                };
                controls.enablePan = false;
                controls.enableRotate = false; // ensure perfect centering
                controls.enableDamping = false; // avoid damping-induced drift
                controls.update();

                isFollowingRef.current = true;
              }

              idleAction.fadeOut(FADE_DURATION);
              action.reset().fadeIn(FADE_DURATION).play();

              const onFinished = (e: any) => {
                if (e.action === action) {
                  mixer.removeEventListener("finished", onFinished);

                  // Async finish flow: fade out, reset pose and camera, fade in idle
                  (async () => {
                    try {
                      isFollowingRef.current = false;
                      const modelRootFinish = modelRootRef.current || bodyMesh.parent;
                      if (modelRootFinish) {
                        await fadeObjectOpacity(modelRootFinish, 0, OPACITY_FADE);
                      }

                      // Reset camera back to start
                      const cam = cameraRef.current;
                      const ctrls = controlsRef.current;
                      if (cam && ctrls) {
                        cam.position.copy(cameraStartPosRef.current);
                        ctrls.target.copy(controlsStartTargetRef.current);
                        // Restore controls settings
                        const prev = prevControlsStateRef.current;
                        if (prev) {
                          ctrls.enablePan = prev.enablePan;
                          ctrls.enableRotate = prev.enableRotate;
                          ctrls.enableDamping = prev.enableDamping;
                          ctrls.dampingFactor = prev.dampingFactor;
                        } else {
                          // Reasonable defaults if prev state missing
                          ctrls.enablePan = true;
                          ctrls.enableRotate = true;
                          ctrls.enableDamping = true;
                          ctrls.dampingFactor = 0.08;
                        }
                        ctrls.update();
                      }

                      // Reset skeleton/model and return to idle
                      mixer.stopAllAction();
                      action.stop();
                      bodyMesh.skeleton.pose();
                      const modelRootReset = modelRootRef.current || bodyMesh.parent;
                      if (modelRootReset) {
                        modelRootReset.position.copy(modelStartPosRef.current);
                        modelRootReset.quaternion.copy(modelStartQuatRef.current);
                        (modelRootReset as any).updateMatrixWorld?.(true);
                      }

                        idleAction.reset().setEffectiveWeight(1).fadeIn(FADE_DURATION).play();

                      if (modelRootFinish) {
                        await fadeObjectOpacity(modelRootFinish, 1, OPACITY_FADE);
                      }
                    } catch (err) {
                      console.error(err);
                      // Fallback to simple fade to idle
                      idleAction.reset().setEffectiveWeight(1).fadeIn(1).play();
                    } finally {
                      resolve();
                    }
                  })();
                }
              };
              mixer.addEventListener("finished", onFinished);
            },
            undefined,
            (error) => {
              reject(error);
            }
          );
        });
      },
      setStaticEmotion: (emotion) => {
        currentSpeechEmotionRef.current = emotion;
      },
      getAnimationObjects: () => {
        return {
          mixer: mixerRef.current,
          model: bodyMeshRef.current ? bodyMeshRef.current.parent : null,
          idleAction: idleActionRef.current,
        };
      },
    }));

    // Handle assets after Promise.all resolves. Pulled out as a helper to keep
    // the main effect body short and easier to read.
    const handleAssetsLoaded = (
      assets: any[],
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      controls: OrbitControls,
      renderer: THREE.WebGLRenderer
    ) => {
      let assetIndex = 0;
      const gltf = assets[assetIndex++] as any;
      const idleFbx = assets[assetIndex++] as any;
      const introFbx = introAnimationUrl ? (assets[assetIndex++] as any) : null;
      const interruptFbx = interruptAnimationUrl ? (assets[assetIndex++] as any) : null;
      const talkingFbx1 = talkingAnimationUrl1 ? (assets[assetIndex++] as any) : null;
      const talkingFbx2 = talkingAnimationUrl2 ? (assets[assetIndex++] as any) : null;
      const characterModel = gltf.scene;
      scene.add(characterModel);
      bodyMeshRef.current = characterModel.getObjectByProperty(
        "isSkinnedMesh",
        true
      ) as THREE.SkinnedMesh;

      // Store model root and its starting transform for reset
      modelRootRef.current = characterModel;
      modelStartPosRef.current.copy(characterModel.position);
      modelStartQuatRef.current.copy(characterModel.quaternion);

      // Log bone list for debugging
      const modelBones = bodyMeshRef.current.skeleton.bones.map((bone) => bone.name);
      console.log("--- CHARACTER MODEL BONES (TARGET) ---", modelBones);

      // Initialize mixer using the skinned mesh
      mixerRef.current = new THREE.AnimationMixer(bodyMeshRef.current);
      characterModel.traverse((object: any) => {
        if (object.isMesh) object.castShadow = true;
        if (object.isSkinnedMesh && object.morphTargetDictionary) {
          if (
            object.name === "Wolf3D_Head" ||
            object.name === "Wolf3D_Avatar" ||
            object.name === "head"
          ) {
            faceMeshRef.current = object;
          }
        }
      });

      const idleAction = mixerRef.current.clipAction(
        retargetClip(idleFbx.animations[0])
      );
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      idleActionRef.current = idleAction;

      let introAction: THREE.AnimationAction | null = null;
      let interruptAction: THREE.AnimationAction | null = null;
      let talkingAction1: THREE.AnimationAction | null = null;
      let talkingAction2: THREE.AnimationAction | null = null;

      if (introFbx) {
        introAction = mixerRef.current.clipAction(
          retargetClip(introFbx.animations[0])
        );
        introAction.setLoop(THREE.LoopOnce, 1);
        introAction.clampWhenFinished = true;
        idleAction.weight = 0;
        introAction.play();
      }
      if (interruptFbx) {
        interruptAction = mixerRef.current.clipAction(
          retargetClip(interruptFbx.animations[0])
        );
        interruptAction.setLoop(THREE.LoopOnce, 1);
        interruptAction.clampWhenFinished = true;
      }
      if (talkingFbx1) {
        talkingAction1 = mixerRef.current.clipAction(
          retargetClip(talkingFbx1.animations[0])
        );
        talkingAction1.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (talkingFbx2) {
        talkingAction2 = mixerRef.current.clipAction(
          retargetClip(talkingFbx2.animations[0])
        );
        talkingAction2.setLoop(THREE.LoopRepeat, Infinity);
      }

      mixerRef.current.addEventListener("finished", (e: any) => {
        const idle = idleActionRef.current;
        if (!idle) return;
        if (e.action === introAction || e.action === interruptAction) {
          animationStateRef.current = "idle";
          e.action.fadeOut(0.5);
          idle.reset().setEffectiveWeight(1).fadeIn(0.5).play();
          if (e.action === interruptAction) {
            /* outer scope manages scheduling next interrupt */
          }
        }
      });
    };

    useEffect(() => {
      if (!mountRef.current) return;
      const currentMount = mountRef.current;
      const scene = new THREE.Scene();
      const selectedBackground: BackgroundData =
        backgroundData || backgrounds[backgroundPreset] || backgrounds.studio;
      const textureLoader = new THREE.TextureLoader();
      let ground: THREE.Mesh;
      switch (selectedBackground.name) {
        case "Forest":
          textureLoader.load("/textures/forest/forestbg.jpg", (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            scene.environment = texture;
          });
          const forestFloorTexture = textureLoader.load(
            "/textures/forest/Grass.jpg"
          );
          forestFloorTexture.wrapS = THREE.RepeatWrapping;
          forestFloorTexture.wrapT = THREE.RepeatWrapping;
          forestFloorTexture.repeat.set(25, 25);
          ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ map: forestFloorTexture })
          );
          break;
        case "City at Night":
          textureLoader.load("/textures/city/cyberbg.jpg", (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            scene.environment = texture;
          });
          const cityFloorTexture = textureLoader.load(
            "/textures/city/floormetal.jpg"
          );
          cityFloorTexture.wrapS = THREE.RepeatWrapping;
          cityFloorTexture.wrapT = THREE.RepeatWrapping;
          cityFloorTexture.repeat.set(25, 25);
          ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ map: cityFloorTexture })
          );
          break;
        case "Venice Sunset HDR":
        case "Royal Esplanade HDR":
          if (selectedBackground.url) {
            new RGBELoader().load(selectedBackground.url, (texture) => {
              texture.mapping = THREE.EquirectangularReflectionMapping;
              scene.background = texture;
              scene.environment = texture;
            });
          }
          ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })
          );
          break;
        case "Studio":
        default:
          scene.background = new THREE.Color(
            selectedBackground.color || 0xa0a0a0
          );
          ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })
          );
          break;
      }
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const camera = new THREE.PerspectiveCamera(
        45,
        currentMount.clientWidth / currentMount.clientHeight,
        0.1,
        1000
      );
  // Lowered initial camera Y and moved closer (smaller Z) so follow preserves a lower view.
  camera.position.set(-0.13, 1.0, 2.61);
  setCameraPosition({x: camera.position.x, y: camera.position.y, z: camera.position.z});
      const audioListener = new THREE.AudioListener();
      camera.add(audioListener);
      audioRef.current = new THREE.Audio(audioListener);
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
  // Align control target Y with camera Y so initial view height matches camera position
  controls.target.set(0, camera.position.y, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.update();

      // Save camera/controls refs
      cameraRef.current = camera;
      controlsRef.current = controls;

      const clock = new THREE.Clock();
      const gltfLoader = new GLTFLoader();
      const fbxLoader = new FBXLoader();
      let timeToNextInterrupt = 0;
      let timeUntilBlink = Math.random() * 4 + 2;
      let isBlinking = false,
        blinkProgress = 0;
      const blinkDuration = 0.15;
      let timeToNextSaccade = Math.random() * 3 + 1;
      let isLooking = false,
        saccadeTimer = 0;
      const saccadeDuration = 0.1;
      let lookTarget = { up: 0, down: 0 };
      const setNextInterrupt = () => {
        timeToNextInterrupt = Math.random() * 10 + 5;
      };
      const promises = [
        gltfLoader.loadAsync(characterModelUrl),
        fbxLoader.loadAsync(idleAnimationUrl),
      ];
      if (introAnimationUrl)
        promises.push(fbxLoader.loadAsync(introAnimationUrl));
      if (interruptAnimationUrl)
        promises.push(fbxLoader.loadAsync(interruptAnimationUrl));
      if (talkingAnimationUrl1)
        promises.push(fbxLoader.loadAsync(talkingAnimationUrl1));
      if (talkingAnimationUrl2)
        promises.push(fbxLoader.loadAsync(talkingAnimationUrl2));
      let introAction: THREE.AnimationAction | null = null;
      let interruptAction: THREE.AnimationAction | null = null;
      let talkingAction1: THREE.AnimationAction | null = null;
      let talkingAction2: THREE.AnimationAction | null = null;
      Promise.all(promises)
        .then((assets) => {
          let assetIndex = 0;
          const gltf = assets[assetIndex++] as any;
          const idleFbx = assets[assetIndex++] as any;
          const introFbx = introAnimationUrl
            ? (assets[assetIndex++] as any)
            : null;
          const interruptFbx = interruptAnimationUrl
            ? (assets[assetIndex++] as any)
            : null;
          const talkingFbx1 = talkingAnimationUrl1
            ? (assets[assetIndex++] as any)
            : null;
          const talkingFbx2 = talkingAnimationUrl2
            ? (assets[assetIndex++] as any)
            : null;
          const characterModel = gltf.scene;
          scene.add(characterModel);
          bodyMeshRef.current = characterModel.getObjectByProperty(
            "isSkinnedMesh",
            true
          ) as THREE.SkinnedMesh;

          // Store model root and its starting transform for reset
          modelRootRef.current = characterModel;
          modelStartPosRef.current.copy(characterModel.position);
          modelStartQuatRef.current.copy(characterModel.quaternion);

          // --- ADD THIS LOG ---
          // This will print an array of all bone names in your character model.
          const modelBones = bodyMeshRef.current.skeleton.bones.map(bone => bone.name);
          console.log("--- CHARACTER MODEL BONES (TARGET) ---", modelBones);
          // --- END OF ADDED LOG ---

          // 3. Initialize the mixer with the CORRECT object (the SkinnedMesh)
          mixerRef.current = new THREE.AnimationMixer(bodyMeshRef.current);
          characterModel.traverse((object: any) => {
            if (object.isMesh) object.castShadow = true;
            if (object.isSkinnedMesh && object.morphTargetDictionary) {
              if (
                object.name === "Wolf3D_Head" ||
                object.name === "Wolf3D_Avatar" ||
                object.name === "head"
              ) {
                faceMeshRef.current = object;
              }
            }
          });
          const idleAction = mixerRef.current.clipAction(
            retargetClip(idleFbx.animations[0])
          );
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleAction.play();
          idleActionRef.current = idleAction;
          if (introFbx) {
            introAction = mixerRef.current.clipAction(
              retargetClip(introFbx.animations[0])
            );
            introAction.setLoop(THREE.LoopOnce, 1);
            introAction.clampWhenFinished = true;
            idleAction.weight = 0;
            introAction.play();
          }
          if (interruptFbx) {
            interruptAction = mixerRef.current.clipAction(
              retargetClip(interruptFbx.animations[0])
            );
            interruptAction.setLoop(THREE.LoopOnce, 1);
            interruptAction.clampWhenFinished = true;
            setNextInterrupt();
          }
          if (talkingFbx1) {
            talkingAction1 = mixerRef.current.clipAction(
              retargetClip(talkingFbx1.animations[0])
            );
            talkingAction1.setLoop(THREE.LoopRepeat, Infinity);
          }
          if (talkingFbx2) {
            talkingAction2 = mixerRef.current.clipAction(
              retargetClip(talkingFbx2.animations[0])
            );
            talkingAction2.setLoop(THREE.LoopRepeat, Infinity);
          }
          mixerRef.current.addEventListener("finished", (e: any) => {
            const idle = idleActionRef.current;
            if (!idle) return;
            if (e.action === introAction || e.action === interruptAction) {
              animationStateRef.current = "idle";
              e.action.fadeOut(0.5);
              idle.reset().setEffectiveWeight(1).fadeIn(0.5).play();
              if (e.action === interruptAction) setNextInterrupt();
            }
          });
        })
        .catch((error) => console.error("Error loading assets:", error));

      let animationFrameId: number;
      const animate = () => {
        if (cameraRef.current) {
          const pos = cameraRef.current.position;
          setCameraPosition({x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2))});
        }
        // ...existing animation code...
        animationFrameId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const elapsedTime = clock.getElapsedTime();
        if (mixerRef.current) mixerRef.current.update(delta);
        controls.update();

        // Camera follow while BVH is playing
        if (
          isFollowingRef.current &&
          followAnchorRef.current &&
          cameraRef.current &&
          controlsRef.current
        ) {
          followAnchorRef.current.updateMatrixWorld?.(true);
          const anchorPos = new THREE.Vector3();
          followAnchorRef.current.getWorldPosition(anchorPos);

          // Compute orientation vectors
          const q = new THREE.Quaternion();
          followAnchorRef.current.getWorldQuaternion(q);
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
          const { distance, height, side } = followViewRef.current;

          // Horizontal-only offset (zero Y) so camera doesn't follow vertical motion
          const horizontalOffset = new THREE.Vector3()
            .addScaledVector(right, side)
            .addScaledVector(forward, -distance);
          horizontalOffset.y = 0;

          // Preserve camera Y (do not move vertically)
          const camY = cameraRef.current.position.y;

          // New camera position: anchor X/Z + horizontal offset, keep original camera Y
          const targetPos = new THREE.Vector3(anchorPos.x, camY, anchorPos.z).add(horizontalOffset);
          cameraRef.current.position.copy(targetPos);

          // Update controls target X/Z to follow anchor, but keep target Y unchanged to avoid tilting
          const currentTarget = controlsRef.current.target;
          controlsRef.current.target.set(anchorPos.x, currentTarget.y, anchorPos.z);
          controlsRef.current.update();
        }

        const faceMesh = faceMeshRef.current;
        const idle = idleActionRef.current;
        const isCurrentlyTalking = !!(faceMesh?.userData?.visemes?.length > 0);

        // Animation State Machine
        if (
          isCurrentlyTalking &&
          animationStateRef.current !== "talking" &&
          !isWaitingAfterTalkRef.current
        ) {
          const previousState = animationStateRef.current; // Store the state BEFORE changing it.
          animationStateRef.current = "talking"; // Now change the state.

          const talkingActions = [talkingAction1, talkingAction2].filter(
            (a) => a
          );
          if (talkingActions.length > 0) {
            // Check the PREVIOUS state to decide which animation to fade out.
            if (previousState === "interrupt" && interruptAction?.isRunning()) {
              interruptAction.fadeOut(0.5);
            } else if (previousState === "idle" && idle?.isRunning()) {
              idle.fadeOut(0.5);
            }

            const nextAction =
              talkingActions[Math.floor(Math.random() * talkingActions.length)];
            if (nextAction) {
              nextAction.reset().setEffectiveWeight(1).fadeIn(0.5).play();
              currentlyPlayingTalkingActionRef.current = nextAction;
            }
          }
        } else if (
          animationStateRef.current === "talking" &&
          isWaitingAfterTalkRef.current
        ) {
          animationStateRef.current = "idle";
          const currentTalkingAction = currentlyPlayingTalkingActionRef.current;
          if (currentTalkingAction?.isRunning())
            currentTalkingAction.fadeOut(0.5);
          if (idle) idle.reset().setEffectiveWeight(1).fadeIn(0.5).play();
          currentlyPlayingTalkingActionRef.current = null;
        }

        // Interrupt Logic
        if (animationStateRef.current === "idle" && interruptAction) {
          timeToNextInterrupt -= delta;
          if (timeToNextInterrupt <= 0) {
            animationStateRef.current = "interrupt";
            if (idle?.isRunning()) idle.fadeOut(0.5);
            interruptAction.reset().setEffectiveWeight(1).fadeIn(0.5).play();
          }
        }

        // Blinking Logic
        if (faceMesh?.morphTargetDictionary && faceMesh.morphTargetInfluences) {
          const leftBlink = faceMesh.morphTargetDictionary["eyeBlinkLeft"];
          const rightBlink = faceMesh.morphTargetDictionary["eyeBlinkRight"];
          if (leftBlink !== undefined && rightBlink !== undefined) {
            if (isBlinking) {
              blinkProgress += delta;
              if (blinkProgress >= blinkDuration) {
                isBlinking = false;
                blinkProgress = 0;
                timeUntilBlink = Math.random() * 2 + 2;
                faceMesh.morphTargetInfluences[leftBlink] = 0;
                faceMesh.morphTargetInfluences[rightBlink] = 0;
              }
            } else {
              timeUntilBlink -= delta;
              if (timeUntilBlink <= 0) {
                isBlinking = true;
                blinkProgress = 0;
                faceMesh.morphTargetInfluences[leftBlink] = 1;
                faceMesh.morphTargetInfluences[rightBlink] = 1;
              }
            }
          }
        }

        // Saccade Logic
        if (faceMesh?.morphTargetDictionary && faceMesh.morphTargetInfluences) {
          saccadeTimer += delta;
          if (isLooking) {
            if (saccadeTimer > saccadeDuration) {
              isLooking = false;
              saccadeTimer = 0;
              lookTarget = { up: 0, down: 0 };
            }
          } else if (saccadeTimer > timeToNextSaccade) {
            isLooking = true;
            saccadeTimer = 0;
            timeToNextSaccade = Math.random() * 3 + 1;
            const direction = Math.random();
            lookTarget = { up: 0, down: 0 };
            if (direction < 0.5) lookTarget.up = Math.random() * 0.5 + 0.2;
            else lookTarget.down = Math.random() * 0.5 + 0.2;
          }
          const morphDict = faceMesh.morphTargetDictionary;
          const influences = faceMesh.morphTargetInfluences;
          const applyLook = (key: "Up" | "Down", target: number) => {
            const index = morphDict["eyesLook" + key];
            if (index !== undefined) {
              influences[index] = THREE.MathUtils.lerp(
                influences[index] ?? 0,
                target,
                LERP_SPEED * delta
              );
            }
          };
          applyLook("Up", lookTarget.up);
          applyLook("Down", lookTarget.down);
        }

        // Lip Sync Data Update
        if (isCurrentlyTalking && faceMesh) {
          const audioElapsedTime =
            (performance.now() - faceMesh.userData.audioStartTime) / 1000;
          let nextViseme = null;
          while (
            currentVisemeIndexRef.current < faceMesh.userData.visemes.length &&
            audioElapsedTime >=
              faceMesh.userData.visemes[currentVisemeIndexRef.current].time
          ) {
            nextViseme =
              faceMesh.userData.visemes[currentVisemeIndexRef.current];
            currentVisemeIndexRef.current++;
          }
          if (nextViseme) {
            Object.keys(targetVisemeWeights).forEach((key) => {
              if (key.startsWith("viseme_")) targetVisemeWeights[key] = 0;
            });
            targetVisemeWeights[nextViseme.value] = 1;
            targetJawOpen.current = nextViseme.jaw;
          }
        }

        // Dynamic Emotion Logic
        const targetIntensity =
          isCurrentlyTalking || currentSpeechEmotionRef.current !== "neutral"
            ? 1
            : 0;
        speechEmotionIntensityRef.current = THREE.MathUtils.lerp(
          speechEmotionIntensityRef.current,
          targetIntensity,
          LERP_SPEED * delta * 0.5
        );
        Object.keys(targetEmotionWeights).forEach((key) => {
          targetEmotionWeights[key] = 0;
        });
        const currentEmotion = emotions[currentSpeechEmotionRef.current];
        if (currentEmotion && currentSpeechEmotionRef.current !== "neutral") {
          Object.entries(currentEmotion).forEach(([key, baseValue]) => {
            const proceduralModulation =
              0.85 + 0.15 * Math.sin(elapsedTime * 1.5);
            const finalValue =
              baseValue *
              speechEmotionIntensityRef.current *
              proceduralModulation;
            targetEmotionWeights[key] = finalValue;
          });
        }

        // Morph Target Application
        if (faceMesh?.morphTargetDictionary && faceMesh.morphTargetInfluences) {
          const morphDict = faceMesh.morphTargetDictionary;
          const influences = faceMesh.morphTargetInfluences;
          Object.keys(targetVisemeWeights).forEach((key) => {
            const index = morphDict[key];
            if (index !== undefined) {
              influences[index] = THREE.MathUtils.lerp(
                influences[index] ?? 0,
                targetVisemeWeights[key],
                LERP_SPEED * delta
              );
            }
          });
          const jawIndex = morphDict["jawOpen"];
          if (jawIndex !== undefined) {
            influences[jawIndex] = THREE.MathUtils.lerp(
              influences[jawIndex] ?? 0,
              targetJawOpen.current,
              LERP_SPEED * delta
            );
          }
          Object.keys(targetEmotionWeights).forEach((key) => {
            const index = morphDict[key];
            if (index !== undefined) {
              if (!key.startsWith("viseme_") && key !== "jawOpen") {
                influences[index] = THREE.MathUtils.lerp(
                  influences[index] ?? 0,
                  targetEmotionWeights[key],
                  LERP_SPEED * delta
                );
              }
            }
          });
        }

        renderer.render(scene, camera);
      };

      const handleResize = () => {
        const currentMount = mountRef.current;
        if (!currentMount) return;
        camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      };

      window.addEventListener("resize", handleResize);
      animate();

      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationFrameId);
        if (audioRef.current && audioRef.current.isPlaying)
          audioRef.current.stop();
        if (mountRef.current && renderer.domElement) {
          currentMount.removeChild(renderer.domElement);
        }
      };
    }, [
      characterModelUrl,
      idleAnimationUrl,
      introAnimationUrl,
      interruptAnimationUrl,
      talkingAnimationUrl1,
      talkingAnimationUrl2,
      backgroundData,
      backgroundPreset,
    ]);

    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 18,
            background: "rgba(30,30,30,0.7)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          Camera: x={cameraPosition.x}, y={cameraPosition.y}, z={cameraPosition.z}
        </div>
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }
);

ThreeCanvas.displayName = "ThreeCanvas";
export default ThreeCanvas;
function useState<T>(initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  return reactUseState(initialValue);
}

