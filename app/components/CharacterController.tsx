// src/app/components/CharacterController.tsx
"use client";

import React, { useState, useRef } from "react";
import ThreeCanvas from "./ThreeCanvas";
import styles from "./CharacterController.module.css";
// Make sure to import the Emotion type as well
import type { ThreeCanvasHandles, Emotion } from "./ThreeCanvas";
import { bvhPlayer } from "./BVHAnimationPlayer";

// Remove bracketed tokens like [Wave] or [Talkinganimation] for UI display
const sanitizeResponse = (text: string | null | undefined) => {
    if (!text) return '';
    // Remove annotations in [], {}, {{}}, and now ()
    return String(text)
      .replace(/\[[^\]]*\]/g, '')       // Removes [notes]
      .replace(/\([^)]*\)/g, '')        // Removes (emotions)
      .replace(/\{\{[\s\S]*?\}\}/g, '') // Removes {{actions}}
      .replace(/\{[^\}]*\}/g, '')       // Removes {fallback actions}
      .replace(/\s+/g, ' ')
      .trim();
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

// Character and background definitions
const characters = {
  harry: {
    name: "Harry (The Potter)",
    modelUrl: "/models/Harry.glb",
    introAnimationUrl: "/idleanimations/harryuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/StandIdle.fbx",
    animationUrl: "/idleanimations/StandIdle.fbx",
    talkingAnimationUrl1: "/talkinganimations/Talking2.fbx",
    talkingAnimationUrl2: "/talkinganimations/Talking2.fbx",
  },
  Joy: {
    name: "Joy (Dishwashing Expert)",
    modelUrl: "/models/Joy.glb",
    introAnimationUrl: "/idleanimations/Joyuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/InterruptIdle.fbx",
    animationUrl: "/idleanimations/Stretching.fbx",
    talkingAnimationUrl1: "/talkinganimations/Talking2.fbx",
    talkingAnimationUrl2: "/talkinganimations/Talking2.fbx",
  },
  Surf: {
    name: "Surf (Fabcon Expert)",
    modelUrl: "/models/Surf.glb",
    introAnimationUrl: "/idleanimations/Surfuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Stretching.fbx",
    animationUrl: "/idleanimations/Stretching.fbx",
    talkingAnimationUrl1: "/talkinganimations/Talking2.fbx",
    talkingAnimationUrl2: "/talkinganimations/Talking2.fbx",
    thinkingAnimationUrl: "/idleanimations/Looking.fbx",
  },
};
const backgrounds = {
  studio: { name: "Studio", url: null, color: 0xffffff },
  forest: { name: "Forest", url: "/textures/forest/forestbg.jpg" },
  city: { name: "City at Night", url: "/textures/city/cyberbg.jpg" },
};
type CharacterKey = keyof typeof characters;
type BackgroundKey = keyof typeof backgrounds;
type RawVisemeCue = { start: number; end: number; value: string };

const rhubarbToVisemeMap: { [key: string]: { viseme: string; jaw: number } } = {
  X: { viseme: "viseme_sil", jaw: 0 },
  A: { viseme: "viseme_aa", jaw: 0.2 },
  B: { viseme: "viseme_PP", jaw: 0 },
  C: { viseme: "viseme_E", jaw: 0.2 },
  D: { viseme: "viseme_DD", jaw: 0.1 },
  E: { viseme: "viseme_E", jaw: 0.1 },
  F: { viseme: "viseme_FF", jaw: 0.1 },
  G: { viseme: "viseme_kk", jaw: 0.2 },
  H: { viseme: "viseme_O", jaw: 0.3 },
};

export default function CharacterController() {
  const [talkPrompt, setTalkPrompt] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [isSubmittingTalk, setIsSubmittingTalk] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isGeneratingMotion, setIsGeneratingMotion] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [chatMessage, setChatMessage] = useState("");
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>("harry");
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>("studio");

  const canvasRef = useRef<ThreeCanvasHandles>(null);
  const lastGeneratedFiles = useRef<string[]>([]);
  // Manifest/polling refs for incremental BVH/audio steps
  const manifestRequestIdRef = useRef<string | null>(null);
  const manifestCancelRef = useRef<(() => void) | null>(null);
  const playedStepIndexRef = useRef<number>(0);

  const handleTalk = async () => {
    if (isSubmittingTalk || !talkPrompt.trim()) return;
    // Cancel any existing manifest polling / playback
    try {
      if (manifestCancelRef.current) {
        manifestCancelRef.current();
        manifestCancelRef.current = null;
        manifestRequestIdRef.current = null;
        playedStepIndexRef.current = 0;
      }
      // Stop any active audio/animation on the canvas
      canvasRef.current?.resetToIdle?.();
    } catch (e) {}

    setIsSubmittingTalk(true);
    setStatus("Thinking...");
    setChatMessage("");
    setIsChatVisible(true);

    try {
      // Reset character bones/animation to idle immediately when user submits
      try {
        canvasRef.current?.resetToIdle?.();
      } catch (e) {
        console.warn('Failed to reset character to idle on submit', e);
      }

      const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: talkPrompt,
          character: selectedCharKey,
          background: selectedBgKey,
        }),
      });
      if (!companionResponse.ok)
        throw new Error(`API failed: ${companionResponse.status}`);
      const companionJson = await companionResponse.json();
      console.log("CharacterController: full companion JSON:", companionJson);

      // New fields supported by backend: request_id, generation_status, steps, step_texts
      const {
        response: answer,
        audio_base64,
        visemes,
        bvh_files,
        generation_status,
        request_id,
        steps,
        step_texts,
        emotion,
        mixamo_animation,
      } = companionJson || {};

      if (!answer && !request_id) throw new Error("Invalid response from companion");

      setChatMessage(sanitizeResponse(answer || ""));
      setStatus("Generating audio...");
      setTalkPrompt("");

      // If backend immediately returned step-1 audio (audio-first flow), play it now
      if (generation_status === 'partial' && request_id) {
        // remember the active manifest request
        manifestRequestIdRef.current = String(request_id);
        // If companion included immediate audio for first step
        if (audio_base64) {
          try {
            setIsAudioPlaying(true);
            const audioDataUri = `data:audio/mp3;base64,${audio_base64}`;
            const mappedVisemes = (visemes || []).map((cue: any) => {
              const entry = (rhubarbToVisemeMap as any)[cue.value] || (rhubarbToVisemeMap as any)['X'];
              return { time: cue.start, value: entry.viseme, jaw: entry.jaw };
            });
            await canvasRef.current?.playAudioWithEmotionAndLipSync?.(audioDataUri, mappedVisemes, emotion || 'neutral');
            setIsAudioPlaying(false);
          } catch (e) {
            console.warn('Failed to play immediate companion audio', e);
            setIsAudioPlaying(false);
          }
        }

        // Play immediate BVH files returned with companion for step-1
        if (Array.isArray(bvh_files) && bvh_files.length > 0) {
          const urls = bvh_files.map((f: string) => `${BACKEND_URL}/generated_bvh/${f}`);
          await playBVHUrls(urls);
        }

        // begin polling manifest for remaining steps
        manifestCancelRef.current = startManifestPolling(String(request_id));
      } else {
        // Fallback old flow: ask /ask for audio for the assistant answer then play
        const audioResponse = await fetch(`${BACKEND_URL}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: answer,
            character: selectedCharKey,
            background: selectedBgKey,
          }),
        });
        if (!audioResponse.ok) throw new Error("TTS API failed");
        const audioJson = await audioResponse.json();
        const { audio_base64: ab64, visemes: aVisemes, emotion: aEmotion } = audioJson; // Expect emotion from backend

        if (canvasRef.current && ab64) {
          setIsAudioPlaying(true);
          const audioDataUri = `data:audio/mp3;base64,${ab64}`;
          const mapped = (aVisemes || []).map((cue: any) => {
            const entry = (rhubarbToVisemeMap as any)[cue.value] || (rhubarbToVisemeMap as any)['X'];
            return { time: cue.start, value: entry.viseme, jaw: entry.jaw };
          });
          const speechPromise = canvasRef.current.playAudioWithEmotionAndLipSync?.(audioDataUri, mapped, aEmotion || 'neutral');
          if (mixamo_animation && canvasRef.current.playGestures) {
            try {
              const urls = Array.isArray(mixamo_animation) ? mixamo_animation : [mixamo_animation];
              const converted = urls.map((p: string) => (p.startsWith('/') ? p : `/gesturesanimation/${p}`));
              canvasRef.current.playGestures?.(converted).catch((e) => console.warn(e));
            } catch (err) { console.warn('Failed to play gestures', err); }
          }
          await speechPromise;
          setIsAudioPlaying(false);
        }
      }

      setStatus("Completed");
      setTimeout(() => setIsChatVisible(false), 2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Error: ${msg}`);
      setChatMessage(msg);
    } finally {
      setIsSubmittingTalk(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (isGeneratingMotion || !motionPrompt.trim()) return;

    setIsGeneratingMotion(true);
    setStatus("Requesting animation from server...");

    try {
      // 1. Fetch the BVH file names from the backend.
      const { bvhPlayer } = await import("./BVHAnimationPlayer");
      const generatedFiles = await bvhPlayer.generateBVHAnimations(BACKEND_URL ?? "", [motionPrompt]);
      
      if (!generatedFiles || generatedFiles.length === 0) {
        throw new Error("Backend did not return any BVH files.");
      }

      lastGeneratedFiles.current = generatedFiles;
      const bvhUrls = generatedFiles.map(file => `${BACKEND_URL}/generated_bvh/${file}`);
      
      setStatus("Playing generated motion...");

      // 2. Get the necessary Three.js objects from the ThreeCanvas component.
      if (canvasRef.current) {
        const animationObjects = canvasRef.current.getAnimationObjects();
        if (animationObjects.mixer && animationObjects.model && animationObjects.idleAction) {
          // 3. Call the centralized play method in the BVHAnimationPlayer.
          await bvhPlayer.play({
              mixer: animationObjects.mixer,
              model: animationObjects.model,
              idleAction: animationObjects.idleAction
          }, bvhUrls);
          setStatus("Motion completed.");
        } else {
          throw new Error("Could not retrieve necessary animation objects from ThreeCanvas.");
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Error: ${msg}`);
      console.error("Error during motion generation:", error);
    } finally {
      setIsGeneratingMotion(false);
    }
  };

  // Helper: play BVH URLs using the bvhPlayer and ThreeCanvas animation objects
  const playBVHUrls = async (urls: string[]) => {
    try {
      if (!canvasRef.current) return;
      const objs = canvasRef.current.getAnimationObjects();
      if (!objs || !objs.mixer || !objs.model || !objs.idleAction) {
        console.warn('playBVHUrls: animation objects not ready');
        return;
      }
      // objs fields are nullable in the public API; assert non-null for bvhPlayer
      const params = {
        mixer: objs.mixer,
        model: objs.model,
        idleAction: objs.idleAction,
      } as unknown as { mixer: any; model: any; idleAction: any };
      await bvhPlayer.play(params, urls);
    } catch (e) {
      console.warn('BVH play failed', e);
    }
  };

  // Manifest polling helper. Returns a cancel function.
  const startManifestPolling = (requestId: string) => {
    let cancelled = false;
    let playedIndex = playedStepIndexRef.current || 0;
    let emptyPollCount = 0;
    const pollIntervalMs = 1000;
    const maxEmptyBeforeBackoff = 6;

    const mapRhCuesToVisemes = (raw: any[]) => {
      return (raw || []).map((cue: any) => {
        const entry = (rhubarbToVisemeMap as any)[cue.value] || (rhubarbToVisemeMap as any)['X'];
        return { time: cue.start, value: entry.viseme, jaw: entry.jaw };
      });
    };

    const pollOnce = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/companion/status/${requestId}`);
        if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
        const manifest = await res.json();
        const steps = manifest.steps || [];

        for (let i = playedIndex; i < steps.length; i++) {
          if (cancelled) return;
          const step = steps[i];
          const hasAudio = !!step.audio_base64;
          const hasBVH = Array.isArray(step.bvh_files) && step.bvh_files.length > 0;

          if (hasAudio) {
            try {
              const audioUri = `data:audio/mp3;base64,${step.audio_base64}`;
              const mapped = mapRhCuesToVisemes(step.visemes || []);
              await canvasRef.current?.playAudioWithEmotionAndLipSync?.(audioUri, mapped, manifest.emotion || 'neutral');
            } catch (err) {
              console.warn('Manifest audio play failed for step', i, err);
            }
          } else if (step.step) {
            // fallback: call /ask for this step text
            try {
              const askRes = await fetch(`${BACKEND_URL}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: step.step, character: selectedCharKey, background: selectedBgKey }),
              });
              if (askRes.ok) {
                const askJson = await askRes.json();
                if (askJson.audio_base64) {
                  const audioUri = `data:audio/mp3;base64,${askJson.audio_base64}`;
                  const mapped = mapRhCuesToVisemes(askJson.visemes || []);
                  await canvasRef.current?.playAudioWithEmotionAndLipSync?.(audioUri, mapped, askJson.emotion || 'neutral');
                }
              }
            } catch (err) {
              console.warn('Fallback /ask failed for manifest step', i, err);
            }
          }

          if (hasBVH) {
            const urls = step.bvh_files.map((f: string) => `${BACKEND_URL}/generated_bvh/${f}`);
            await playBVHUrls(urls);
          }

          playedIndex = i + 1;
          playedStepIndexRef.current = playedIndex;
        }

        if (manifest.complete && playedIndex >= (manifest.steps || []).length) {
          // done
          return;
        }

        if ((steps.length === playedIndex) || steps.length === 0) emptyPollCount++; else emptyPollCount = 0;
        const nextInterval = emptyPollCount > maxEmptyBeforeBackoff ? Math.min(5000, pollIntervalMs * 3) : pollIntervalMs;
        if (!cancelled) setTimeout(pollOnce, nextInterval);
      } catch (err) {
        console.warn('Manifest poll error', err);
        if (!cancelled) setTimeout(pollOnce, 3000);
      }
    };

    // start
    pollOnce();

    return () => { cancelled = true; };
  };

  const handleTestMotion = async () => {
    if (isTesting) return;
    if (!canvasRef.current) {
      setStatus("Canvas not ready.");
      setTimeout(() => setStatus("Ready"), 1500);
      return;
    }
    setIsTesting(true);
    setStatus("Loading test visemes...");
    try {
      const response = await fetch("/audio/test-speech.json");
      if (!response.ok)
        throw new Error(
          `Failed to load test-speech.json: ${response.statusText}`
        );
      const rhubarbData = await response.json();
      const visemes = rhubarbData.mouthCues.map((cue: RawVisemeCue) => {
        const entry = rhubarbToVisemeMap[cue.value] || rhubarbToVisemeMap["X"];
        return {
          time: cue.start,
          value: entry.viseme,
          jaw: entry.jaw,
        };
      });
      if (visemes.length > 0) {
        const lastCue = rhubarbData.mouthCues[rhubarbData.mouthCues.length - 1];
        visemes.push({ time: lastCue.end, value: "viseme_sil", jaw: 0 });
      }
      setStatus("Playing test audio...");
      const audioRes = await fetch("/sample.wav");
      const audioBlob = await audioRes.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );
      if (canvasRef.current) {
        setIsAudioPlaying(true);

        // --- FIX 2: Use the correct function and pass a default emotion ---
        const audioDataUri = `data:audio/mp3;base64,${base64Audio}`;
        await canvasRef.current.playAudioWithEmotionAndLipSync(
          audioDataUri,
          visemes,
          "neutral"
        );

        setIsAudioPlaying(false);
      }
      setStatus("Test complete");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Test failed: ${msg}`);
    } finally {
      setIsTesting(false);
      setTimeout(() => setStatus("Ready"), 2000);
    }
  };

  const selectedCharacter = characters[selectedCharKey];
  const selectedBackground = backgrounds[selectedBgKey];

  return (
    <>
      <div className={styles.container}>
        <div className={styles.leftPanel}>
          <div className={styles.section}>
            <h2>Choose a Character</h2>
            <div className={styles.buttonGroup}>
              {(Object.keys(characters) as CharacterKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedCharKey(key)}
                  className={
                    selectedCharKey === key
                      ? styles.activeButton
                      : styles.button
                  }
                >
                  {characters[key].name}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <h2>Choose a Background</h2>
            <div className={styles.buttonGroup}>
              {(Object.keys(backgrounds) as BackgroundKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedBgKey(key)}
                  className={
                    selectedBgKey === key ? styles.activeButton : styles.button
                  }
                >
                  {backgrounds[key].name}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.status}>Status: {status}</div>
            <div className={styles.inputGroup}>
              <input
                type="text"
                value={talkPrompt}
                onChange={(e) => setTalkPrompt(e.target.value)}
                placeholder="Type something to say..."
                disabled={isSubmittingTalk || isGeneratingMotion || isTesting}
              />
              <button
                onClick={handleTalk}
                disabled={isSubmittingTalk || isGeneratingMotion || isTesting}
              >
                {isSubmittingTalk
                  ? "Sending..."
                  : isAudioPlaying
                  ? "Talking..."
                  : "Talk"}
              </button>
            </div>
            <div className={styles.inputGroup}>
              <input
                type="text"
                value={motionPrompt}
                onChange={(e) => setMotionPrompt(e.target.value)}
                placeholder="Describe a motion (e.g., wave)..."
                disabled={isGeneratingMotion || isSubmittingTalk || isTesting}
              />
              <button
                onClick={handleGenerateMotion}
                disabled={isGeneratingMotion || isSubmittingTalk || isTesting}
              >
                {isGeneratingMotion ? "Generating..." : "Generate Motion"}
              </button>
            </div>
            <div
              className={styles.section}
              style={{
                marginTop: "20px",
                borderTop: "1px solid #ccc",
                paddingTop: "10px",
              }}
            >
              <h2>Developer Tools</h2>
              <button
                onClick={handleTestMotion}
                disabled={isSubmittingTalk || isGeneratingMotion || isTesting}
                style={{ width: "100%" }}
              >
                {isTesting ? "Testing..." : "Test Static Lip Sync"}
              </button>
            </div>
          </div>
          {isChatVisible && (
            <div className={styles.chatBubble}>{chatMessage}</div>
          )}
        </div>
        <div className={styles.rightPanel}>
          <ThreeCanvas
            ref={canvasRef}
            characterModelUrl={selectedCharacter.modelUrl}
            introAnimationUrl={selectedCharacter.introAnimationUrl}
            idleAnimationUrl={selectedCharacter.idleAnimationUrl}
            interruptAnimationUrl={selectedCharacter.interruptAnimationUrl}
            animationUrl={selectedCharacter.animationUrl}
            talkingAnimationUrl1={selectedCharacter.talkingAnimationUrl1}
            talkingAnimationUrl2={selectedCharacter.talkingAnimationUrl2}
            // --- FIX 3: Remove the invalid prop ---
            backgroundData={selectedBackground}
          />
        </div>
      </div>
    </>
  );
}
