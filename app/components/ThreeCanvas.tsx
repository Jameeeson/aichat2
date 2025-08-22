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

// ===== Editable mappings =====
// Map backend animation names to FBX URLs served from /public
// Edit these to match the filenames on disk (case-sensitive on Linux).

// Map logical idle names to idle FBX urls for easy customization.
// Use the 'default' key for a fallback idle animation.
export const idleAnimationMap: Record<string, string> = {
  default: "/idleanimations/StandIdle.fbx",
  harry: "/idleanimations/harryuniqueidle.fbx",
  Joy: "/idleanimations/Joyuniqueidle.fbx",
  Surf: "/idleanimations/Surfuniqueidle.fbx",
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
  // Control a typing/waiting pose
  setTyping: (isTyping: boolean) => void;
  getAnimationObjects: () => {
    mixer: THREE.AnimationMixer | null;
    model: THREE.Object3D | null;
    idleAction: THREE.AnimationAction | null;
  };
  // Play a Mixamo gesture/animation by name (maps to /gesturesanimation/<name>.fbx)
  // playMixamoAnimation was removed; gesture playback is no longer supported.
  // Backwards-compatible alias used elsewhere
  playAudioWithLipSync?: (audioBase64OrUrl: string, visemes: any[]) => Promise<void>;
  // Play one or more Mixamo FBX gestures (paths served from /public)
  playGestures?: (urls: string[] | string) => Promise<void>;
  // Reset skeleton, stop all actions, and return to idle loop
  resetToIdle?: () => void;
}

export interface ThreeCanvasProps {
  characterModelUrl: string;
  idleAnimationUrl: string;
  introAnimationUrl?: string;
  interruptAnimationUrl?: string;
  // New: an additional ambient/idle variant animation to include in the idle cycle
  animationUrl?: string;
  talkingAnimationUrl1?: string;
  talkingAnimationUrl2?: string;
  // Play once and hold final frame while user types
  typingAnimationUrl?: string;
  backgroundData?: BackgroundData;
  backgroundPreset?: keyof typeof backgrounds;
  // compatibility: optional UI tweak used by other pages
  smileIntensity?: number;
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

// Explicit retarget map for Mixamo FBX clips (source bone names use "mixamorig:" prefix)
const MIXAMO_RETARGET_OPTIONS = {
  preservePosition: false,
  useFirstFrameAsBindPose: false,
  hip: "Hips",
  names: {
  Hips: "mixamorigHips",
  Spine: "mixamorigSpine",
  Spine1: "mixamorigSpine1",
  Spine2: "mixamorigSpine2",
  Neck: "mixamorigNeck",
  Head: "mixamorigHead",
  LeftShoulder: "mixamorigLeftShoulder",
  LeftArm: "mixamorigLeftArm",
  LeftForeArm: "mixamorigLeftForeArm",
  LeftHand: "mixamorigLeftHand",
  RightShoulder: "mixamorigRightShoulder",
  RightArm: "mixamorigRightArm",
  RightForeArm: "mixamorigRightForeArm",
  RightHand: "mixamorigRightHand",
  LeftUpLeg: "mixamorigLeftUpLeg",
  LeftLeg: "mixamorigLeftLeg",
  LeftFoot: "mixamorigLeftFoot",
  LeftToe: "mixamorigLeftToeBase",
  RightUpLeg: "mixamorigRightUpLeg",
  RightLeg: "mixamorigRightLeg",
  RightFoot: "mixamorigRightFoot",
  RightToe: "mixamorigRightToeBase",
    // Fingers intentionally omitted to avoid over-rotation artifacts
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
  animationUrl,
      talkingAnimationUrl1,
      talkingAnimationUrl2,
  typingAnimationUrl,
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

    // Helper: find the primary SkinnedMesh (with the largest number of bones)
    const findBestSkinnedMesh = (root: THREE.Object3D): THREE.SkinnedMesh | null => {
      let best: THREE.SkinnedMesh | null = null;
      root.traverse((o: any) => {
        if (o?.isSkinnedMesh && o.skeleton && Array.isArray(o.skeleton.bones)) {
          if (!best || o.skeleton.bones.length > (best.skeleton?.bones?.length || 0)) {
            best = o as THREE.SkinnedMesh;
          }
        }
      });
      return best;
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
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const currentSpeechEmotionRef = useRef<Emotion>("neutral");
    const speechEmotionIntensityRef = useRef(0);

  // (Mixamo/gesture support removed) no-op queue removed

  // Idle-cycle state: we will loop idle -> interrupt -> animationUrl -> ...
  const loopActionsRef = useRef<THREE.AnimationAction[]>([]);
  const currentLoopIndexRef = useRef<number>(-1);
  const currentLoopActionRef = useRef<THREE.AnimationAction | null>(null);
  const loopEnabledRef = useRef<boolean>(false);

  // Typing pose/action
  const typingActionRef = useRef<THREE.AnimationAction | null>(null);
  const typingActiveRef = useRef<boolean>(false);
  // Frozen typing pose quaternions captured at the end of the typing action
  const typingHeadQuatRef = useRef<THREE.Quaternion | null>(null);
  const typingNeckQuatRef = useRef<THREE.Quaternion | null>(null);
  const typingHoldTimeoutRef = useRef<number | null>(null);

  const clearTypingHoldTimeout = () => {
    if (typingHoldTimeoutRef.current) {
      window.clearTimeout(typingHoldTimeoutRef.current);
      typingHoldTimeoutRef.current = null;
    }
  };

  const releaseTypingPose = (holdMs = 1600) => {
    // Clear any previous timer and set a new one to release the frozen typing pose
    clearTypingHoldTimeout();
    typingHoldTimeoutRef.current = window.setTimeout(() => {
      typingHoldTimeoutRef.current = null;
      // Only proceed if typing is still considered active (we captured a pose)
      typingActiveRef.current = false;
      try {
        const playlist = loopActionsRef.current;
        if (playlist.length > 0) {
          const prev = currentLoopActionRef.current;
          if (prev?.isRunning()) prev.fadeOut(0.25);
          currentLoopIndexRef.current = (currentLoopIndexRef.current + 1) % playlist.length;
          const next = playlist[currentLoopIndexRef.current];
          next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
          currentLoopActionRef.current = next;
        } else if (idleActionRef.current) {
          idleActionRef.current.reset().setEffectiveWeight(1).fadeIn(0.25).play();
        }
      } catch (err) {
        // ignore
      }
      // clear frozen quaternions so subsequent animations are not clobbered
      typingHeadQuatRef.current = null;
      typingNeckQuatRef.current = null;
    }, holdMs);
  };

  // Bone refs for subtle procedural motion during interrupt animation
  const neckBoneRef = useRef<THREE.Bone | null>(null);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const neckBaseQuatRef = useRef(new THREE.Quaternion());
  const headBaseQuatRef = useRef(new THREE.Quaternion());
  const hasCapturedBasePoseRef = useRef(false);

    // Additional bones for idle micro-motions
    const hipsBoneRef = useRef<THREE.Bone | null>(null);
    const spineRef = useRef<THREE.Bone | null>(null);
    const spine1Ref = useRef<THREE.Bone | null>(null);
    const spine2Ref = useRef<THREE.Bone | null>(null);
    const leftShoulderRef = useRef<THREE.Bone | null>(null);
    const rightShoulderRef = useRef<THREE.Bone | null>(null);
    // Randomized phases to desynchronize motions
    const motionPhase = useRef({
      breath: Math.random() * Math.PI * 2,
      sway: Math.random() * Math.PI * 2,
      shoulder: Math.random() * Math.PI * 2,
      head: Math.random() * Math.PI * 2,
    }).current;

    // Camera/model follow & reset helpers
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const isFollowingRef = useRef(false);
    const cameraStartPosRef = useRef(new THREE.Vector3());
    const controlsStartTargetRef = useRef(new THREE.Vector3());
    const cameraOffsetRef = useRef(new THREE.Vector3());
    const controlsOffsetRef = useRef(new THREE.Vector3());
  // Last known good finite camera transform (for recovering from NaN/Infinity)
  const lastGoodCameraPosRef = useRef(new THREE.Vector3(0, 1, 3));
  const lastGoodCameraQuatRef = useRef(new THREE.Quaternion());
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
  const followViewRef = useRef({ distance: 2, height: 0, side: 1.2 });

      const playAudioWithEmotionAndLipSync = async (
      audioUrl: string,
      visemes: { time: number; value: string; jaw: number }[],
      emotion: Emotion,
      onEndedCallback?: () => void
    ) => {
      const faceMesh = faceMeshRef.current;
      if (!faceMesh) return;

      // Stop any previous scheduled source
      try {
        if (audioSourceRef.current) {
          try { audioSourceRef.current.onended = null; } catch {}
          try { audioSourceRef.current.stop(); } catch {}
          audioSourceRef.current.disconnect();
          audioSourceRef.current = null;
        }
      } catch (e) {}

      isWaitingAfterTalkRef.current = false;
      currentVisemeIndexRef.current = 0;
      Object.keys(targetVisemeWeights).forEach((key) => {
        if (key.startsWith("viseme_")) targetVisemeWeights[key] = 0;
      });
      targetJawOpen.current = 0;
      currentSpeechEmotionRef.current = emotion;

      // Ensure AudioContext
      const AudioCtor: any = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current && AudioCtor) audioContextRef.current = new AudioCtor();
      const audioCtx = audioContextRef.current;
      if (!audioCtx) {
        // Fallback: no WebAudio available; keep previous behavior using THREE.AudioLoader
        console.warn('No AudioContext available; cannot schedule audio precisely.');
        return Promise.resolve();
      }

      return new Promise<void>(async (resolve) => {
        try {
          // Fetch and decode audio (works for data: URIs and remote urls)
          const resp = await fetch(audioUrl);
          const arrayBuffer = await resp.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          audioSourceRef.current = source;

          source.onended = () => {
            isWaitingAfterTalkRef.current = true;
            source.onended = null;
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

          // Small scheduling delay to ensure decode/time alignment
          const startTime = audioCtx.currentTime + 0.06;
          faceMesh.userData.visemes = visemes;
          // store audio start time as AudioContext time (seconds)
          faceMesh.userData.audioStartTime = startTime;

          source.start(startTime);
        } catch (err) {
          console.error('playAudioWithEmotionAndLipSync scheduling error', err);
          resolve();
        }
      });
    };

    const retargetClip = (clip: THREE.AnimationClip) => {
      try {
        // Debug: show original track names (first few)
        console.log(
          "ThreeCanvas: FBX clip original tracks:",
          clip.tracks.slice(0, 8).map((t) => t.name)
        );
      } catch {}

      // Helper to canonicalize FBX bone names like "mixamorig:Hips" -> "mixamorigHips"
      const canonicalize = (name: string) => name.replace(/mixamorig:/gi, "mixamorig");

      // Drop root translation tracks that can yank the model around
      clip.tracks = clip.tracks.filter((track) => {
        const bone = track.name.split(".")[0];
        const canon = canonicalize(bone);
        const isRootPos =
          track.name.endsWith(".position") &&
          (canon === "mixamorigHips" || canon === "Hips");
        return !isRootPos;
      });

      clip.tracks.forEach((track) => {
        const parts = track.name.split(".");
        const boneRaw = parts[0];
        const canon = canonicalize(boneRaw);
        let targetBone = boneNameMap[canon];
        if (!targetBone) {
          // If it's already a target-style bone name (e.g., "Hips", "Spine1"), keep it
          if (/^(Hips|Spine|Spine1|Spine2|Neck|Head|Left|Right)/.test(canon)) {
            targetBone = canon; // already correct
          } else if (/^mixamorig/i.test(canon)) {
            // Strip the mixamorig prefix and try the remainder (e.g., mixamorigLeftArm -> LeftArm)
            const stripped = canon.replace(/^mixamorig/i, "");
            if (boneNameMap[stripped]) targetBone = boneNameMap[stripped];
            else targetBone = stripped; // best effort
          } else {
            targetBone = canon; // fallback
          }
        }
        if (targetBone && targetBone !== boneRaw) {
          track.name = track.name.replace(boneRaw, targetBone);
        }
      });

      try {
        console.log(
          "ThreeCanvas: FBX clip retargeted tracks:",
          clip.tracks.slice(0, 8).map((t) => t.name)
        );
      } catch {}
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
        // Ensure typing pose is cleared before speech
        if (typingActiveRef.current) {
          typingActiveRef.current = false;
          const idle = idleActionRef.current;
          const playlist = loopActionsRef.current;
          // Resume loop or idle
          if (playlist.length > 0) {
            const prev = currentLoopActionRef.current;
            if (prev?.isRunning()) prev.fadeOut(0.3);
            currentLoopIndexRef.current = (currentLoopIndexRef.current + 1) % playlist.length;
            const next = playlist[currentLoopIndexRef.current];
            next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
            currentLoopActionRef.current = next;
          } else if (idle) {
            idle.reset().setEffectiveWeight(1).fadeIn(0.3).play();
          }
        }
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
      // Backwards-compatible wrapper some pages use
      playAudioWithLipSync: async (audioBase64OrUrl: string, visemes: any[]) => {
        // Default to neutral emotion
        return playAudioWithEmotionAndLipSync(audioBase64OrUrl, visemes || [], "neutral");
      },
      // Play one or more Mixamo-style gesture FBX files as one-shot overlays.
      playGestures: async (urls) => {
        // Ensure typing pose is released so gestures do not inherit a frozen look-down pose
        clearTypingHoldTimeout();
        typingActiveRef.current = false;
        typingHeadQuatRef.current = null;
        typingNeckQuatRef.current = null;
        // If we captured a neutral base pose for head/neck, restore it now so gestures start from neutral
        try {
          if (hasCapturedBasePoseRef.current) {
            if (headBoneRef.current) headBoneRef.current.quaternion.copy(headBaseQuatRef.current);
            if (neckBoneRef.current) neckBoneRef.current.quaternion.copy(neckBaseQuatRef.current);
            // Also reset the model root transform so gestures start facing the original front
            if (modelRootRef.current) {
              modelRootRef.current.position.copy(modelStartPosRef.current);
              modelRootRef.current.quaternion.copy(modelStartQuatRef.current);
              (modelRootRef.current as any)?.updateMatrixWorld?.(true);
            }
          }
        } catch (e) {}

        const fbxLoader = new FBXLoader();
        const list = Array.isArray(urls) ? urls : [urls];

        // Wait for the mixer and body mesh to be ready (in case caller fires early)
        const waitForReady = async (timeoutMs = 5000) => {
          const start = performance.now();
          while (performance.now() - start < timeoutMs) {
            if (mixerRef.current && bodyMeshRef.current) return true;
            // small backoff
            await new Promise((r) => setTimeout(r, 100));
          }
          return false;
        };

        const ready = await waitForReady(5000);
        if (!ready) {
          console.warn('ThreeCanvas.playGestures: mixer/model not ready after wait; aborting gestures');
          return;
        }

        const mixer = mixerRef.current as THREE.AnimationMixer;
        const target = bodyMeshRef.current as THREE.Object3D;

        for (const u of list) {
          const url = String(u);
          console.log('ThreeCanvas.playGestures: loading', url);
          try {
            const loaded: any = await fbxLoader.loadAsync(url);
            if (!loaded || !loaded.animations || loaded.animations.length === 0) {
              console.warn('ThreeCanvas.playGestures: no animations in', url);
              continue;
            }
            const clip = retargetClip(loaded.animations[0].clone());

            // Dedupe quaternion tracks for hands to avoid sudden wrist flips
            const seenQuat = new Set<string>();
            const deduped: THREE.KeyframeTrack[] = [];
            for (const track of clip.tracks) {
              if (
                track.name.endsWith('.quaternion') &&
                (track.name.startsWith('LeftHand.') || track.name.startsWith('RightHand.'))
              ) {
                if (seenQuat.has(track.name)) continue;
                seenQuat.add(track.name);
              }
              deduped.push(track);
            }
            clip.tracks = deduped;

            const action = mixer.clipAction(clip as any, target as any);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;

            // Fade out current talking/loop/idle action to make gesture visible
            console.log('ThreeCanvas.playGestures: starting gesture, fading out base animations');
            const prevTalking = currentlyPlayingTalkingActionRef.current;
            const prevLoop = currentLoopActionRef.current;
            const idle = idleActionRef.current;
            try {
              if (prevTalking?.isRunning()) {
                prevTalking.fadeOut(0.15);
              } else if (prevLoop?.isRunning()) {
                prevLoop.fadeOut(0.15);
              } else if (idle?.isRunning()) {
                idle.fadeOut(0.15);
              }
            } catch (e) {
              // ignore
            }

            action.reset().setEffectiveWeight(1).fadeIn(0.15).play();

            await new Promise<void>((resolve) => {
              const onFinished = (e: any) => {
                if (e.action === action) {
                  try { mixer.removeEventListener('finished', onFinished); } catch {}
                  action.fadeOut(0.15);
                  // Restore previous actions
                  try {
                    if (prevTalking) {
                      prevTalking.reset().setEffectiveWeight(1).fadeIn(0.2).play();
                    } else if (prevLoop) {
                      prevLoop.reset().setEffectiveWeight(1).fadeIn(0.2).play();
                    } else if (idle) {
                      idle.reset().setEffectiveWeight(1).fadeIn(0.2).play();
                    }
                  } catch (err) {}
                  resolve();
                }
              };
              mixer.addEventListener('finished', onFinished);
            });
            console.log('ThreeCanvas.playGestures: finished', url);
          } catch (err) {
            console.warn('ThreeCanvas.playGestures: failed to load/play', url, err);
            continue;
          }
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
              // Release any frozen typing pose so BVH retarget doesn't inherit a look-down
              clearTypingHoldTimeout();
              typingActiveRef.current = false;
              typingHeadQuatRef.current = null;
              typingNeckQuatRef.current = null;

              mixer.stopAllAction();
              bodyMesh.skeleton.pose();
              // Restore neutral head/neck base pose if available so BVH starts from a neutral orientation
              try {
                if (hasCapturedBasePoseRef.current) {
                  if (headBoneRef.current) headBoneRef.current.quaternion.copy(headBaseQuatRef.current);
                  if (neckBoneRef.current) neckBoneRef.current.quaternion.copy(neckBaseQuatRef.current);
                  // Reset the model root transform so BVH starts facing forward
                  if (modelRootRef.current) {
                    modelRootRef.current.position.copy(modelStartPosRef.current);
                    modelRootRef.current.quaternion.copy(modelStartQuatRef.current);
                    (modelRootRef.current as any)?.updateMatrixWorld?.(true);
                  }
                }
              } catch (e) {}

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

              const action = mixer.clipAction(clip, bodyMesh);
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
                const { distance, side } = followViewRef.current;
                cameraOffsetRef.current
                  .copy(right).multiplyScalar(side)
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
      setTyping: (isTyping: boolean) => {
        const mixer = mixerRef.current;
        const idle = idleActionRef.current;
        const typingAction = typingActionRef.current;
        if (!mixer || !idle || !typingAction) {
          // If typing action isn't available yet, try to load it asynchronously
          if (!mixer || !idle) {
            typingActiveRef.current = false;
            return;
          }
          // Mark desired state and attempt to load/create the typing action
          typingActiveRef.current = isTyping;
          (async () => {
            try {
              const fbxLoader = new FBXLoader();
              const candidates = [
                typingAnimationUrl,
                "/idleanimations/waitingprompt.fbx",
                "/idleanimations/waiting.fbx",
              ].filter(Boolean) as string[];
              let loaded: any = null;
              for (const url of candidates) {
                try {
                  loaded = await fbxLoader.loadAsync(url);
                  console.log("ThreeCanvas: dynamically loaded typing animation:", url);
                  break;
                } catch (e) {
                  console.warn("ThreeCanvas: failed to load typing candidate:", url, e);
                }
              }
              if (!loaded || !loaded.animations || loaded.animations.length === 0) {
                console.warn("ThreeCanvas: no typing animation found after dynamic load");
                typingActiveRef.current = false;
                return;
              }
              const clip = retargetClip(loaded.animations[0].clone());
              const target = bodyMeshRef.current;
              if (!target) {
                console.warn("ThreeCanvas: body mesh missing, cannot bind typing action");
                typingActiveRef.current = false;
                return;
              }
              const ta = mixer.clipAction(clip, target);
              ta.setLoop(THREE.LoopOnce, 1);
              ta.clampWhenFinished = true;
              typingActionRef.current = ta;
              // If caller still wants typing, play now
              if (typingActiveRef.current) {
                if (currentLoopActionRef.current?.isRunning()) currentLoopActionRef.current.fadeOut(0.25);
                else if (idle.isRunning()) idle.fadeOut(0.25);
                ta.reset().setEffectiveWeight(1).fadeIn(0.25).play();
              }
              // Capture final pose when this dynamically loaded typing action finishes
              const onDynFinished = (e: any) => {
                if (e.action === ta) {
                  try { mixer.removeEventListener("finished", onDynFinished); } catch {}
                  const head = headBoneRef.current;
                  const neck = neckBoneRef.current;
                  if (head) typingHeadQuatRef.current = head.quaternion.clone();
                  if (neck) typingNeckQuatRef.current = neck.quaternion.clone();
                  // Release the frozen typing pose after a short hold so we don't stay looking down
                  releaseTypingPose(1400);
                }
              };
              mixer.addEventListener("finished", onDynFinished);
            } catch (err) {
              console.warn("ThreeCanvas: error loading typing animation", err);
              typingActiveRef.current = false;
            }
          })();
          return;
        }
        if (isTyping) {
          // If already in typing mode, don't restart the pose
          if (typingActiveRef.current) return;
          typingActiveRef.current = true;
          // Fade out any loop/idle action, then play typing pose once and hold
          if (currentLoopActionRef.current?.isRunning()) {
            currentLoopActionRef.current.fadeOut(0.25);
          } else if (idle.isRunning()) {
            idle.fadeOut(0.25);
          }
          typingAction.reset().setEffectiveWeight(1).fadeIn(0.25).play();
        } else {
          if (!typingActiveRef.current) return;
          typingActiveRef.current = false;
          // Clear any hold timer and frozen quats
          clearTypingHoldTimeout();
          typingHeadQuatRef.current = null;
          typingNeckQuatRef.current = null;
          // Return to loop or idle
          const playlist = loopActionsRef.current;
          if (playlist.length > 0) {
            const prev = currentLoopActionRef.current;
            if (prev?.isRunning()) prev.fadeOut(0.25);
            currentLoopIndexRef.current = (currentLoopIndexRef.current + 1) % playlist.length;
            const next = playlist[currentLoopIndexRef.current];
            next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
            currentLoopActionRef.current = next;
          } else {
            idle.reset().setEffectiveWeight(1).fadeIn(0.25).play();
          }
        }
      },
      // Reset the skeleton, stop all actions and return to the idle loop.
      resetToIdle: () => {
        try {
          const mixer = mixerRef.current;
          const body = bodyMeshRef.current;
          const idle = idleActionRef.current;
          // Stop any running actions
          if (mixer) mixer.stopAllAction();
          // Restore skeleton bind pose
          if (body && body.skeleton) body.skeleton.pose();
          // Reset model root transform
          if (modelRootRef.current) {
            modelRootRef.current.position.copy(modelStartPosRef.current);
            modelRootRef.current.quaternion.copy(modelStartQuatRef.current);
            (modelRootRef.current as any).updateMatrixWorld?.(true);
          }
          // Clear typing state
          typingActiveRef.current = false;
          clearTypingHoldTimeout();
          typingHeadQuatRef.current = null;
          typingNeckQuatRef.current = null;
          // Reset loop/talking pointers
          currentLoopActionRef.current = null;
          currentlyPlayingTalkingActionRef.current = null;
          animationStateRef.current = "idle";
          // Ensure idle is playing
          if (idle) {
            idle.reset().setEffectiveWeight(1).fadeIn(FADE_DURATION).play();
          }
        } catch (err) {
          // ignore errors during best-effort reset
        }
      },
      getAnimationObjects: () => {
        return {
          mixer: mixerRef.current,
          model: bodyMeshRef.current ? bodyMeshRef.current.parent : null,
          idleAction: idleActionRef.current,
        };
      },
  // Mixamo/gesture API removed — callers should no longer invoke this.
  }));

  // Mixamo/gesture internal implementation removed.

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
      bodyMeshRef.current =
        findBestSkinnedMesh(characterModel) ||
        (characterModel.getObjectByProperty(
          "isSkinnedMesh",
          true
        ) as THREE.SkinnedMesh);

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
        retargetClip(idleFbx.animations[0]),
        bodyMeshRef.current
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
          retargetClip(introFbx.animations[0]),
          bodyMeshRef.current
        );
        introAction.setLoop(THREE.LoopOnce, 1);
        introAction.clampWhenFinished = true;
        idleAction.weight = 0;
        introAction.play();
      }
      if (interruptFbx) {
        interruptAction = mixerRef.current.clipAction(
          retargetClip(interruptFbx.animations[0]),
          bodyMeshRef.current
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
  // Create ground only for non-studio backgrounds
  let ground: THREE.Mesh | null = null;
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
          // Keep the WebGL canvas fully transparent so the page CSS gradient shows through.
          // No ground plane for studio to match the reference design.
          ground = null;
          break;
        default:
          scene.background = new THREE.Color(selectedBackground.color || 0xa0a0a0);
          ground = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })
          );
          break;
      }
      if (ground) {
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
      }
      const safeAspect = currentMount.clientHeight
        ? currentMount.clientWidth / currentMount.clientHeight
        : 1;
      const camera = new THREE.PerspectiveCamera(45, safeAspect, 0.1, 1000);
  // Lowered initial camera Y and moved closer (smaller Z) so follow preserves a lower view.
  camera.position.set(-0.13, 1.2, 1.63);
  // Seed last good camera transform
  lastGoodCameraPosRef.current.copy(camera.position);
  lastGoodCameraQuatRef.current.copy(camera.quaternion);
  setCameraPosition({x: camera.position.x, y: camera.position.y, z: camera.position.z});
      const audioListener = new THREE.AudioListener();
      camera.add(audioListener);
      audioRef.current = new THREE.Audio(audioListener);
  // alpha:true + transparent clear color prevents any white flash and lets CSS background show
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x000000, 0); // fully transparent
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
  // Random interrupt scheduling is replaced by deterministic idle-cycle;
  // keeping variables for backward compatibility but not used when loop is enabled.
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
      if (animationUrl)
        promises.push(fbxLoader.loadAsync(animationUrl));
      if (talkingAnimationUrl1)
        promises.push(fbxLoader.loadAsync(talkingAnimationUrl1));
      if (talkingAnimationUrl2)
        promises.push(fbxLoader.loadAsync(talkingAnimationUrl2));
      // Always push a typing pose loader with fallbacks
      promises.push(
        (async () => {
          const candidates = [
            typingAnimationUrl,
            "/idleanimations/waitingprompt.fbx",
            "/idleanimations/waiting.fbx",
          ].filter(Boolean) as string[];
          for (const url of candidates) {
            try {
              const res = await fbxLoader.loadAsync(url);
              console.log("Loaded typing animation:", url);
              return res;
            } catch (e) {
              console.warn("Failed to load typing animation candidate:", url);
            }
          }
          console.warn("No typing animation loaded; typing pose will be disabled.");
          return null as any;
        })()
      );
      let introAction: THREE.AnimationAction | null = null;
      let interruptAction: THREE.AnimationAction | null = null;
      let ambientAction: THREE.AnimationAction | null = null;
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
          const ambientFbx = animationUrl ? (assets[assetIndex++] as any) : null;
          const talkingFbx1 = talkingAnimationUrl1
            ? (assets[assetIndex++] as any)
            : null;
          const talkingFbx2 = talkingAnimationUrl2
            ? (assets[assetIndex++] as any)
            : null;
          const typingFbx = assets[assetIndex++] as any;
          const characterModel = gltf.scene;
          scene.add(characterModel);
          bodyMeshRef.current =
            findBestSkinnedMesh(characterModel) ||
            (characterModel.getObjectByProperty(
              "isSkinnedMesh",
              true
            ) as THREE.SkinnedMesh);

          // Store model root and its starting transform for reset
          modelRootRef.current = characterModel;
          modelStartPosRef.current.copy(characterModel.position);
          modelStartQuatRef.current.copy(characterModel.quaternion);

          // --- ADD THIS LOG ---
          // This will print an array of all bone names in your character model.
          const modelBones = bodyMeshRef.current.skeleton.bones.map(bone => bone.name);
          console.log("--- CHARACTER MODEL BONES (TARGET) ---", modelBones);
          // --- END OF ADDED LOG ---

          // Initialize the mixer on the character root so tracks bind to bones properly
          mixerRef.current = new THREE.AnimationMixer(characterModel);
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

          // Try to locate key bones for subtle motions
          if (bodyMeshRef.current?.skeleton?.bones) {
            const bones = bodyMeshRef.current.skeleton.bones;
            const findBone = (patterns: RegExp[]): THREE.Bone | null => {
              for (const p of patterns) {
                const b = bones.find((bn) => p.test(bn.name));
                if (b) return b;
              }
              return null;
            };
            neckBoneRef.current = findBone([
              /^Neck$/i,
              /mixamorig[:]?Neck/i,
              /neck/i,
            ]);
            headBoneRef.current = findBone([
              /^Head$/i,
              /mixamorig[:]?Head/i,
              /head/i,
            ]);
            hipsBoneRef.current = findBone([
              /^Hips$/i,
              /mixamorig[:]?Hips/i,
            ]);
            spineRef.current = findBone([
              /^Spine$/i,
              /mixamorig[:]?Spine$/i,
            ]);
            spine1Ref.current = findBone([
              /^Spine1$/i,
              /mixamorig[:]?Spine1/i,
            ]);
            spine2Ref.current = findBone([
              /^Spine2$/i,
              /mixamorig[:]?Spine2/i,
            ]);
            leftShoulderRef.current = findBone([
              /^LeftShoulder$/i,
              /mixamorig[:]?LeftShoulder/i,
            ]);
            rightShoulderRef.current = findBone([
              /^RightShoulder$/i,
              /mixamorig[:]?RightShoulder/i,
            ]);
            if (neckBoneRef.current) neckBaseQuatRef.current.copy(neckBoneRef.current.quaternion);
            if (headBoneRef.current) headBaseQuatRef.current.copy(headBoneRef.current.quaternion);
            hasCapturedBasePoseRef.current = !!(neckBoneRef.current || headBoneRef.current);
          }
          // Create actions
          const idleAction = mixerRef.current.clipAction(
            retargetClip(idleFbx.animations[0]),
            characterModel
          );
          // Keep idle as the base looping animation
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleAction.clampWhenFinished = false;
          idleAction.play();
          idleActionRef.current = idleAction;

          // Mixamo/gesture queuing removed.

          if (introFbx) {
            introAction = mixerRef.current.clipAction(
              retargetClip(introFbx.animations[0]),
              characterModel
            );
            introAction.setLoop(THREE.LoopOnce, 1);
            introAction.clampWhenFinished = true;
            introAction.play();
          }

          if (interruptFbx) {
            interruptAction = mixerRef.current.clipAction(
              retargetClip(interruptFbx.animations[0]),
              characterModel
            );
            interruptAction.setLoop(THREE.LoopOnce, 1);
            interruptAction.clampWhenFinished = true;
          }

          if (ambientFbx) {
            ambientAction = mixerRef.current.clipAction(
              retargetClip(ambientFbx.animations[0]),
              bodyMeshRef.current
            );
            ambientAction.setLoop(THREE.LoopOnce, 1);
            ambientAction.clampWhenFinished = true;
          }

          if (talkingFbx1) {
            talkingAction1 = mixerRef.current.clipAction(
              retargetClip(talkingFbx1.animations[0]),
              bodyMeshRef.current
            );
            talkingAction1.setLoop(THREE.LoopRepeat, Infinity);
          }
          if (talkingFbx2) {
            talkingAction2 = mixerRef.current.clipAction(
              retargetClip(talkingFbx2.animations[0]),
              bodyMeshRef.current
            );
            talkingAction2.setLoop(THREE.LoopRepeat, Infinity);
          }
          if (typingFbx) {
                const ta = mixerRef.current.clipAction(
                  retargetClip(typingFbx.animations[0]),
                  bodyMeshRef.current
                );
            ta.setLoop(THREE.LoopOnce, 1);
            ta.clampWhenFinished = true; // hold final pose
                typingActionRef.current = ta;
                // Capture final head/neck pose when typing action completes so we can freeze it
                const onTypingFinished = (e: any) => {
                  if (e.action === ta) {
                    try {
                      mixerRef.current?.removeEventListener("finished", onTypingFinished);
                    } catch {}
                    const head = headBoneRef.current;
                    const neck = neckBoneRef.current;
                    if (head) typingHeadQuatRef.current = head.quaternion.clone();
                    if (neck) typingNeckQuatRef.current = neck.quaternion.clone();
                    // Release the frozen typing pose after a short hold so we don't stay looking down
                    releaseTypingPose(1400);
                  }
                };
                mixerRef.current.addEventListener("finished", onTypingFinished);
          }

          // Build a playlist for occasional one-shot idles (exclude the base idle)
          const playlist: THREE.AnimationAction[] = [];
          if (interruptAction) playlist.push(interruptAction);
          if (ambientAction) playlist.push(ambientAction);
          loopActionsRef.current = playlist;
          // Disable auto-looping of playlist to prevent unexpected interrupts
          loopEnabledRef.current = false;

          const playNextLoopAction = () => {
            if (!loopEnabledRef.current || playlist.length === 0) return;
            if (animationStateRef.current === "talking") return;
            const prev = currentLoopActionRef.current;
            if (prev?.isRunning()) prev.fadeOut(0.4);
            currentLoopIndexRef.current =
              (currentLoopIndexRef.current + 1) % playlist.length;
            const next = playlist[currentLoopIndexRef.current];
            if (next) {
              next.reset().setEffectiveWeight(1).fadeIn(0.4).play();
              currentLoopActionRef.current = next;
              animationStateRef.current = "idle";
            }
          };

          // Do not auto-start playlist; base idle is already playing

          mixerRef.current.addEventListener("finished", (e: any) => {
            const finished = e.action as THREE.AnimationAction;
            if (finished === introAction) {
              playNextLoopAction();
              return;
            }
            // Do not auto-advance playlist; remain on base idle unless explicitly triggered
            return;
          });
        })
        .catch((error) => console.error("Error loading assets:", error));

      let animationFrameId: number;
      const isFiniteVec3 = (v: THREE.Vector3) =>
        Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      const isFiniteQuat = (q: THREE.Quaternion) =>
        Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w) && q.lengthSq() > 0;
      const animate = () => {
        if (cameraRef.current) {
          const pos = cameraRef.current.position;
          if (!isFiniteVec3(pos)) {
            console.warn("ThreeCanvas: camera position non-finite; resetting", pos);
            cameraRef.current.position.copy(lastGoodCameraPosRef.current);
          } else {
            lastGoodCameraPosRef.current.copy(pos);
          }
          const quat = cameraRef.current.quaternion;
          if (!isFiniteQuat(quat)) {
            console.warn("ThreeCanvas: camera quaternion non-finite; resetting", quat);
            cameraRef.current.quaternion.copy(lastGoodCameraQuatRef.current);
          } else {
            lastGoodCameraQuatRef.current.copy(quat);
          }
          setCameraPosition({
            x: Number(cameraRef.current.position.x.toFixed(2)),
            y: Number(cameraRef.current.position.y.toFixed(2)),
            z: Number(cameraRef.current.position.z.toFixed(2)),
          });
        }
        animationFrameId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const elapsedTime = clock.getElapsedTime();
        if (mixerRef.current) mixerRef.current.update(delta);
        controls.update();
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
          const { distance, side } = followViewRef.current;

          // Horizontal-only offset (zero Y) so camera doesn't follow vertical motion
          const horizontalOffset = new THREE.Vector3()
            .addScaledVector(right, side)
            .addScaledVector(forward, -distance);
          horizontalOffset.y = 0;

          // Preserve camera Y (do not move vertically)
          let camY = cameraRef.current.position.y;
          if (!Number.isFinite(camY)) camY = lastGoodCameraPosRef.current.y;

          // New camera position: anchor X/Z + horizontal offset, keep original camera Y
          const targetPos = new THREE.Vector3(anchorPos.x, camY, anchorPos.z).add(horizontalOffset);
          if (isFiniteVec3(targetPos)) {
            cameraRef.current.position.copy(targetPos);
          }

          // Update controls target X/Z to follow anchor, but keep target Y unchanged to avoid tilting
          const currentTarget = controlsRef.current.target;
          const newTarget = new THREE.Vector3(anchorPos.x, currentTarget.y, anchorPos.z);
          if (isFiniteVec3(newTarget)) {
            controlsRef.current.target.copy(newTarget);
          }
          controlsRef.current.update();
        }

  const faceMesh = faceMeshRef.current;
  const idle = idleActionRef.current;
  const isCurrentlyTalking = !!(faceMesh?.userData?.visemes?.length > 0);

        // Subtle neck/head motion only during interruptAnimation play
    if (currentLoopActionRef.current && currentLoopActionRef.current.isRunning()) {
          // Determine if the current loop action is the interrupt action
          const isInterruptPlaying = ((): boolean => {
            // interruptAction is closed over from asset load scope
            return currentLoopActionRef.current === interruptAction;
          })();
          if (isInterruptPlaying && !isCurrentlyTalking) {
            const t = elapsedTime;
            const neck = neckBoneRef.current;
            const head = headBoneRef.current;
            if (neck) {
      // Additive, small tilt/yaw on top of current animated pose
      const neckTilt = 0.05 * Math.sin(t * 1.4);
      const neckYaw = 0.04 * Math.sin(t * 0.9 + 1.0);
              const q = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(0, neckYaw, neckTilt, "XYZ")
              );
              neck.quaternion.multiply(q);
            }
            if (head) {
      const headPitch = 0.06 * Math.sin(t * 1.8 + 0.6);
      const headYaw = 0.04 * Math.sin(t * 1.1 + 0.2);
              const qh = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(headPitch, headYaw, 0, "XYZ")
              );
              head.quaternion.multiply(qh);
            }
          }
        }

        // Procedural idle micro-motions (breathing, weight shift, shoulders)
        // Only when in idle state, not talking, and not following BVH
        if (
          animationStateRef.current === "idle" &&
          !isCurrentlyTalking &&
          !isFollowingRef.current &&
          !typingActiveRef.current
        ) {
          const t = elapsedTime;
          // Breathing: gentle forward/back on spine chain
          const breath = 0.03 * Math.sin(t * 0.7 + motionPhase.breath); // amplitude, freq
          const breathUpper = 0.02 * Math.sin(t * 0.9 + motionPhase.breath + 0.5);
          if (spineRef.current) {
            const q = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(breath, 0, 0, "XYZ")
            );
            spineRef.current.quaternion.multiply(q);
          }
          if (spine1Ref.current) {
            const q1 = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(breathUpper, 0, 0, "XYZ")
            );
            spine1Ref.current.quaternion.multiply(q1);
          }
          if (spine2Ref.current) {
            const q2 = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(breathUpper * 0.7, 0, 0, "XYZ")
            );
            spine2Ref.current.quaternion.multiply(q2);
          }

          // Weight shift: tiny hips roll/yaw sway
          if (hipsBoneRef.current) {
            const swayRoll = 0.02 * Math.sin(t * 0.5 + motionPhase.sway);
            const swayYaw = 0.015 * Math.sin(t * 0.4 + motionPhase.sway + 1.3);
            const qh = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, swayYaw, swayRoll, "XYZ")
            );
            hipsBoneRef.current.quaternion.multiply(qh);
          }

          // Shoulder micro-motions alternating
          const shAmp = 0.02;
          const shL = shAmp * Math.sin(t * 0.8 + motionPhase.shoulder);
          const shR = shAmp * Math.sin(t * 0.8 + motionPhase.shoulder + Math.PI);
          if (leftShoulderRef.current) {
            const qls = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, 0, shL, "XYZ")
            );
            leftShoulderRef.current.quaternion.multiply(qls);
          }
          if (rightShoulderRef.current) {
            const qrs = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, 0, -shR, "XYZ")
            );
            rightShoulderRef.current.quaternion.multiply(qrs);
          }

          // Tiny head drift for general idle (less than interrupt)
          if (headBoneRef.current) {
            const hdPitch = 0.015 * Math.sin(t * 0.6 + motionPhase.head);
            const hdYaw = 0.012 * Math.sin(t * 0.7 + motionPhase.head + 0.4);
            const qh = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(hdPitch, hdYaw, 0, "XYZ")
            );
            headBoneRef.current.quaternion.multiply(qh);
          }
        }

        // If typing pose is active and we captured final quaternions, enforce them to freeze the look-down pose
        if (typingActiveRef.current) {
          const head = headBoneRef.current;
          const neck = neckBoneRef.current;
          if (head && typingHeadQuatRef.current) {
            head.quaternion.copy(typingHeadQuatRef.current);
          }
          if (neck && typingNeckQuatRef.current) {
            neck.quaternion.copy(typingNeckQuatRef.current);
          }
        }

        // Animation State Machine
        if (
          isCurrentlyTalking &&
          animationStateRef.current !== "talking" &&
          !isWaitingAfterTalkRef.current
        ) {
          const previousState = animationStateRef.current;
          animationStateRef.current = "talking";

          // Prefer talkingAction2 (newer/desired) and fall back to talkingAction1
          const preferred = talkingAction2 || talkingAction1;
          if (preferred) {
            // Fade out whatever loop action is playing
            if (currentLoopActionRef.current?.isRunning()) {
              currentLoopActionRef.current.fadeOut(0.5);
            } else if (previousState === "interrupt" && interruptAction?.isRunning()) {
              interruptAction.fadeOut(0.5);
            } else if (previousState === "idle" && idle?.isRunning()) {
              idle.fadeOut(0.5);
            }
            preferred.reset().setEffectiveWeight(1).fadeIn(0.5).play();
            currentlyPlayingTalkingActionRef.current = preferred;
          }
        } else if (
          animationStateRef.current === "talking" &&
          isWaitingAfterTalkRef.current
        ) {
          animationStateRef.current = "idle";
          const currentTalkingAction = currentlyPlayingTalkingActionRef.current;
          if (currentTalkingAction?.isRunning()) currentTalkingAction.fadeOut(0.5);
          currentlyPlayingTalkingActionRef.current = null;
          // Resume loop cycle
          if (typingActiveRef.current) {
            // If typing, do nothing – typing pose controls the state
          } else if (loopEnabledRef.current) {
            // Trigger next in playlist immediately
            const playlist = loopActionsRef.current;
            if (playlist.length > 0) {
              const prev = currentLoopActionRef.current;
              if (prev?.isRunning()) prev.fadeOut(0.3);
              currentLoopIndexRef.current =
                (currentLoopIndexRef.current + 1) % playlist.length;
              const next = playlist[currentLoopIndexRef.current];
              next.reset().setEffectiveWeight(1).fadeIn(0.4).play();
              currentLoopActionRef.current = next;
            } else if (idle) {
              idle.reset().setEffectiveWeight(1).fadeIn(0.4).play();
            }
          } else if (idle) {
            idle.reset().setEffectiveWeight(1).fadeIn(0.4).play();
          }
        }

  // Interrupt Logic is handled by the idle-cycle playlist when enabled.
  // Keeping this block disabled to avoid conflicts.
  // if (!loopEnabledRef.current && animationStateRef.current === "idle" && interruptAction) {
  //   timeToNextInterrupt -= delta;
  //   if (timeToNextInterrupt <= 0) {
  //     animationStateRef.current = "interrupt";
  //     if (idle?.isRunning()) idle.fadeOut(0.5);
  //     interruptAction.reset().setEffectiveWeight(1).fadeIn(0.5).play();
  //   }
  // }

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
          // Determine elapsed audio time in seconds. If playAudio stored a context time (seconds), use the
          // AudioContext.currentTime reference; otherwise fall back to performance.now().
          let audioElapsedTime = 0;
          const storedStart = faceMesh.userData.audioStartTime;
          if (typeof storedStart === 'number') {
            const audioCtx = audioContextRef.current;
            if (audioCtx && typeof audioCtx.currentTime === 'number') {
              audioElapsedTime = audioCtx.currentTime - storedStart;
            } else {
              // Fallback to performance
              audioElapsedTime = performance.now() / 1000 - storedStart;
            }
          } else {
            audioElapsedTime = 0;
          }
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

        // Only render when camera is valid; attempt recovery if not
        if (camera && isFiniteVec3(camera.position) && isFiniteQuat(camera.quaternion)) {
          renderer.render(scene, camera);
        } else if (camera) {
          camera.position.copy(lastGoodCameraPosRef.current);
          camera.quaternion.copy(lastGoodCameraQuatRef.current);
        }
      };

      const handleResize = () => {
        const currentMount = mountRef.current;
        if (!currentMount) return;
        camera.aspect = currentMount.clientHeight
          ? currentMount.clientWidth / currentMount.clientHeight
          : 1;
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
      animationUrl,
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

