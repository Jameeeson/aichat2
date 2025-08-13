// src/app/components/CharacterController.tsx
'use client';

import React, { useState, useRef } from 'react';
import ThreeCanvas from './ThreeCanvas';
import styles from './CharacterController.module.css';
import type { ThreeCanvasHandles } from './ThreeCanvas';

const BACKEND_URL = "http://localhost:9093";

// Character and background definitions (reuse from page.tsx for consistency)
const characters = {
  harry: {
    name: 'Harry (The Potter)',
    modelUrl: '/models/Harry.glb',
    introAnimationUrl: "/idleanimations/harryuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Interruptidle.fbx",
    animationUrl: '/idleanimations/LookingAround.fbx',
  },
  Joy: {
    name: 'Joy (Dishwashing Expert)',
    modelUrl: '/models/Joy.glb',
    introAnimationUrl: "/idleanimations/Joyuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Interruptidle.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
  },
  Surf: {
    name: 'Surf (Fabcon Expert)',
    modelUrl: '/models/Surf.glb',
    introAnimationUrl: "/idleanimations/Surfuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Stretching.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
  },
};
const backgrounds = {
  studio: { name: 'Studio', url: null, color: 0xffffff },
  forest: { name: 'Forest', url: '/textures/forest/forestbg.jpg' },
  city: { name: 'City at Night', url: '/textures/city/cyberbg.jpg' },
};
type CharacterKey = keyof typeof characters;
type BackgroundKey = keyof typeof backgrounds;

export default function CharacterController() {
  // State for UI elements
  const [talkPrompt, setTalkPrompt] = useState('');
  const [motionPrompt, setMotionPrompt] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [isGeneratingMotion, setIsGeneratingMotion] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [chatMessage, setChatMessage] = useState('');
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>('harry');
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>('studio');
  
  // Ref to access ThreeCanvas methods
  const canvasRef = useRef<ThreeCanvasHandles>(null);
  const lastGeneratedFiles = useRef<string[]>([]);


  // --- Logic for Talking ---
  const handleTalk = async () => {
    if (isTalking || !talkPrompt.trim()) return;

    setIsTalking(true);
    setStatus('Thinking...');
    setChatMessage('');
    setIsChatVisible(true);

    try {
      // Send character and background info to backend
      console.log('Connecting to backend at', `${BACKEND_URL}/api/companion`);
      const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: talkPrompt,
          character: selectedCharKey,
          background: selectedBgKey
        }),
      });
      console.log('Companion response status:', companionResponse.status);

      if (!companionResponse.ok) throw new Error(`API failed: ${companionResponse.status}`);
      const companionJson = await companionResponse.json();
      console.log('Companion response JSON:', companionJson);
      const { response: answer } = companionJson;
      if (!answer) throw new Error("Invalid response from companion");

      setChatMessage(answer); // Show the full response at once
      setStatus('Generating audio...');

      // Get audio and visemes (lip-sync data)
      console.log('Connecting to backend at', `${BACKEND_URL}/ask`);
      const audioResponse = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: answer,
          character: selectedCharKey,
          background: selectedBgKey
        }),
      });
      console.log('Audio response status:', audioResponse.status);
      if (!audioResponse.ok) throw new Error("TTS API failed");

      const audioJson = await audioResponse.json();
      console.log('Audio response JSON:', audioJson);
      const { audio_base64, visemes } = audioJson;

      setStatus('Talking...');
      if (canvasRef.current && audio_base64 && visemes) {
        // Tell the canvas to play the audio with lip-sync
        await canvasRef.current.playAudioWithLipSync(audio_base64, visemes);
      }

      setStatus('Completed!');

    } catch (error) {
      console.error("Error during talk:", error);
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      setChatMessage(error instanceof Error ? error.message : "An error occurred.");
    } finally {
      // Hide chat bubble and reset state after a delay
      setTimeout(() => {
        setIsChatVisible(false);
        setStatus('Ready');
        setIsTalking(false);
      }, 3000);
    }
  };

  // --- Logic for Motion ---
  const handleGenerateMotion = async () => {
    if (isGeneratingMotion || !motionPrompt.trim()) return;

    setIsGeneratingMotion(true);
    setStatus('Generating motion...');

    try {
        console.log('Connecting to backend at', `${BACKEND_URL}/generate_bvh`);
        const bvhResponse = await fetch(`${BACKEND_URL}/generate_bvh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Assuming your backend can take the prompt directly
            body: JSON.stringify({ prompts: [motionPrompt] }), 
        });
        console.log('BVH response status:', bvhResponse.status);

        if (!bvhResponse.ok) throw new Error("Failed to generate motion animation");

        const bvhJson = await bvhResponse.json();
        console.log('BVH response JSON:', bvhJson);
        const { files_created = [] } = bvhJson;

        if (files_created.length > 0) {
            lastGeneratedFiles.current = files_created;
            setStatus('Playing generated animation...');

            for (const fileUrl of files_created) {
                if (canvasRef.current) {
                    // Tell the canvas to play this one-off animation
                    // The URL needs to be accessible, e.g., `${BACKEND_URL}/animations/${fileUrl}`
                    await canvasRef.current.playAnimation(`${BACKEND_URL}/animations/${fileUrl}`);
                }
            }
        } else {
            setStatus('No animation files generated.');
        }

        setStatus('Completed!');

    } catch (error) {
        console.error("Motion generation error:", error);
        setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
        setTimeout(() => {
            setStatus('Ready');
            setIsGeneratingMotion(false);
        }, 3000);
    }
  };

  const selectedCharacter = characters[selectedCharKey];
  const selectedBackground = backgrounds[selectedBgKey];

  return (
    <div className={styles.container}>
      <div className={styles.leftPanel}>
        <div className={styles.section}>
          <h2>Choose a Character</h2>
          <div className={styles.buttonGroup}>
            {(Object.keys(characters) as CharacterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedCharKey(key)}
                className={selectedCharKey === key ? styles.activeButton : styles.button}
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
                className={selectedBgKey === key ? styles.activeButton : styles.button}
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
              disabled={isTalking || isGeneratingMotion}
            />
            <button onClick={handleTalk} disabled={isTalking || isGeneratingMotion}>
              {isTalking ? 'Talking...' : 'Talk'}
            </button>
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              value={motionPrompt}
              onChange={(e) => setMotionPrompt(e.target.value)}
              placeholder="Describe a motion (e.g., wave)..."
              disabled={isTalking || isGeneratingMotion}
            />
            <button onClick={handleGenerateMotion} disabled={isTalking || isGeneratingMotion}>
              {isGeneratingMotion ? 'Generating...' : 'Generate Motion'}
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
          smileIntensity={0.2}
          backgroundData={selectedBackground}
        />
      </div>
    </div>
  );
}