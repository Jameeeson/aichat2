// src/app/components/CharacterController.tsx
"use client";

import React, { useState, useRef } from "react";
import ThreeCanvas from "./ThreeCanvas";
import styles from "./CharacterController.module.css";
// Make sure to import the Emotion type as well
import type { ThreeCanvasHandles, Emotion } from "./ThreeCanvas";

// Remove bracketed tokens like [Wave] or [Talkinganimation] for UI display
const sanitizeResponse = (text: string | null | undefined) => {
  if (!text) return "";
  return String(text).replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
};

const BACKEND_URL = "http://43.203.245.169:5001";

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

  const handleTalk = async () => {
    if (isSubmittingTalk || !talkPrompt.trim()) return;

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
  const { response: answer, mixamo_animation } = companionJson;
      if (!answer) throw new Error("Invalid response from companion");

  setChatMessage(sanitizeResponse(answer));
      // If the backend returned a Mixamo gesture name, tell the canvas to play it.
  // mixamo_animation handling removed — gestures are no longer supported
      setStatus("Generating audio...");
      setTalkPrompt("");

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
      const { audio_base64, visemes, emotion } = audioJson; // Expect emotion from backend

  if (canvasRef.current && audio_base64) {
        setIsAudioPlaying(true);
        setStatus("Talking...");

        // --- FIX 1: Use the correct function and pass the emotion ---
        const audioDataUri = `data:audio/mp3;base64,${audio_base64}`;
        // Start speech in parallel with any gestures
        const speechPromise = canvasRef.current.playAudioWithEmotionAndLipSync(
          audioDataUri,
          visemes || [],
          emotion || "neutral"
        );

        // If backend suggested a Mixamo gesture (string or array), play it as overlay(s)
        if (mixamo_animation && canvasRef.current.playGestures) {
          try {
            const urls = Array.isArray(mixamo_animation)
              ? mixamo_animation
              : [mixamo_animation];
            // Convert backend paths (/gesturesanimation/Waving.fbx) to frontend URLs if necessary
            const converted = urls.map((p) => (p.startsWith('/') ? p : `/gesturesanimation/${p}`));
            console.log('CharacterController: playing gestures', converted);
            // Play gestures but don't await here so they overlay the talking animation
            canvasRef.current.playGestures(converted).catch((e) => console.warn(e));
          } catch (err) {
            console.warn('Failed to play gestures', err);
          }
        }

        await speechPromise;

        setIsAudioPlaying(false);
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
      const generatedFiles = await bvhPlayer.generateBVHAnimations(BACKEND_URL, [motionPrompt]);
      
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
