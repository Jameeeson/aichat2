'use client';

import { useState, useRef } from 'react'; // NEW: Add useRef
import ThreeCanvas from '../app/components/ThreeCanvas';
import styles from './page.module.css';

// Import the ThreeCanvasHandles type from the ThreeCanvas component
import type { ThreeCanvasHandles } from '../app/components/ThreeCanvas';

// NEW: Define the backend URL
const BACKEND_URL = "http://localhost:9093";

// Characters (no changes here)
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

// Background presets (no changes here)
const backgrounds = {
  studio: { name: 'Studio', url: null, color: 0xffffff },
  forest: { name: 'Forest', url: '/textures/forest/forestbg.jpg' },
  city: { name: 'City at Night', url: '/textures/city/cyberbg.jpg' },
};

type CharacterKey = keyof typeof characters;
type BackgroundKey = keyof typeof backgrounds;

export default function Home() {
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>('harry');
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>('studio');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('AI Response will appear here...');

  // NEW: Add state to manage the loading/sending process
  const [isSending, setIsSending] = useState(false);
  
  // NEW: Create a ref to control the ThreeCanvas component
  const canvasRef = useRef<ThreeCanvasHandles>(null);

  const selectedCharacter = characters[selectedCharKey];
  const selectedBackground = backgrounds[selectedBgKey];

  // NEW: This is the real chat submission logic that connects to the backend
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending || !chatInput.trim()) return;

    setIsSending(true);
    setChatResponse('Thinking...'); // Update UI to show it's working
    const prompt = chatInput;
    setChatInput(''); // Clear the input field immediately

    try {
      // Step 1: Get the text, audio, and motion data from the companion AI in one call
      console.log('Connecting to backend at', `${BACKEND_URL}/api/companion`);
      const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt,
          character: selectedCharKey,
          background: selectedBgKey
        }),
      });

      if (!companionResponse.ok) {
        throw new Error(`Companion API failed: ${companionResponse.status}`);
      }
      
      const result = await companionResponse.json();
      console.log('Full backend response:', result); // DEBUG: Log the entire response
      const { response: answer, audio_base64, visemes, action, keywords } = result;

      if (!answer) throw new Error("Invalid response from companion");
      
      setChatResponse(answer); // Show the final AI text response in the chat box

      // Step 2: Tell the ThreeCanvas to play the audio with lip-sync
      if (canvasRef.current && audio_base64) {
        // Pass visemes if they exist, otherwise pass an empty array.
        // This allows audio to play even without lip-sync data.
        await canvasRef.current.playAudioWithLipSync(audio_base64, visemes || []);
      }

      // Step 3: If the backend decided to generate a motion, play it.
      // Note: This assumes your backend can return animation file data 
      // and that ThreeCanvas has a method to play them.
      if (canvasRef.current && action === 'generate' && keywords && keywords.length > 0) {
        // You would need a method on ThreeCanvas to handle this, e.g.:
        // await canvasRef.current.playMotion(keywords);
        console.log("Received motion keywords, but no handler is implemented yet:", keywords);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Chat submission error:", error);
      setChatResponse(`Error: ${errorMessage}`);
    } finally {
      setIsSending(false); // Re-enable the send button
    }
  };

  return (
    <main className={styles.mainContainer}>
      {/* Left Panel: Controls */}
      <div className={styles.leftPanel}>
        <div className={styles.section}>
          <h1>AI Companion</h1>
          <p>Choose your companion and setting. Then, start a conversation.</p>
        </div>

        {/* AI Chat Section - updated with disabled state */}
        <div className={styles.chatSection} style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 8 }}>Chat</h2>
          <form onSubmit={handleChatSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className={styles.chatBox} style={{ minHeight: 32, marginBottom: 6, fontSize: 14, padding: 8 }}>
              {chatResponse}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Type your message..."
                className={styles.chatInput}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                style={{ flex: 1, fontSize: 14, padding: 6 }}
                disabled={isSending} // NEW: Disable input while sending
              />
              <button
                type="submit"
                className={styles.button}
                style={{ padding: '6px 14px', fontSize: 14 }}
                disabled={isSending || !chatInput.trim()} // NEW: Disable button
              >
                {isSending ? '...' : 'Send'} {/* NEW: Change text on load */}
              </button>
            </div>
          </form>
        </div>

        {/* Character and Background Selection (no changes here) */}
        <div className={styles.section}>
          <h2>Choose a Character</h2>
          <div className={styles.buttonGroup}>
            {(Object.keys(characters) as CharacterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedCharKey(key)}
                className={`${styles.button} ${selectedCharKey === key ? styles.activeButton : ''}`}
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
                className={`${styles.button} ${selectedBgKey === key ? styles.activeButton : ''}`}
              >
                {backgrounds[key].name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: 3D Canvas */}
      <div className={styles.rightPanel}>
        <ThreeCanvas
          ref={canvasRef} // NEW: Pass the ref to the canvas
          characterModelUrl={selectedCharacter.modelUrl}
          introAnimationUrl={selectedCharacter.introAnimationUrl}
          idleAnimationUrl={selectedCharacter.idleAnimationUrl}
          interruptAnimationUrl={selectedCharacter.interruptAnimationUrl}
          smileIntensity={0.2}
          backgroundData={selectedBackground}
        />
      </div>
    </main>
  );
}
