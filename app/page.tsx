'use client';

import { useState, useRef } from 'react';
import ThreeCanvas from '../app/components/ThreeCanvas';
import styles from './page.module.css';
import type { ThreeCanvasHandles } from '../app/components/ThreeCanvas';

// This map translates Rhubarb's output to your specific model's viseme names.
export type RhubarbVisemeKey = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// You will also need a type for this new map shape
type VisemeMapEntry = { viseme: string; jaw: number };

const rhubarbToVisemeMap: Record<RhubarbVisemeKey, VisemeMapEntry> = {
  'X': { viseme: 'viseme_sil', jaw: 0 },
  'A': { viseme: 'viseme_aa', jaw: 0.5 }, // Open jaw for "ah"
  'B': { viseme: 'viseme_PP', jaw: 0 },   // Closed for "b, p, m"
  'C': { viseme: 'viseme_E',  jaw: 0.2 }, // Slightly open for "ee, i"
  'D': { viseme: 'viseme_DD', jaw: 0.2 },
  'E': { viseme: 'viseme_E',  jaw: 0.3 }, // Open for "eh"
  'F': { viseme: 'viseme_FF', jaw: 0.2 },
  'G': { viseme: 'viseme_kk', jaw: 0.2 },
  'H': { viseme: 'viseme_O',  jaw: 0.4 }, // Very open for "oh"
};

const BACKEND_URL = "http://13.124.213.220:5001";

const characters = {
  harry: {
    name: 'Harry (The Potter)',
    modelUrl: '/models/Harry.glb',
    introAnimationUrl: "/idleanimations/harryuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/LookingAround.fbx",
    animationUrl: '/idleanimations/LookingAround.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },  
  Joy: {
    name: 'Joy (Dishwashing Expert)',
    modelUrl: '/models/Joy.glb',
    introAnimationUrl: "/idleanimations/Joyuniqueidle.fbx", 
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/InterruptIdle.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },
  Surf: {
    name: 'Surf (Fabcon Expert)',
    modelUrl: '/models/Surf.glb',
    introAnimationUrl: "/idleanimations/Surfuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Stretching.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },
};

const backgrounds = {
  studio: { name: 'Studio', url: null, color: 0xffffff },
  forest: { name: 'Forest', url: '/textures/forest/forestbg.jpg' },
  city: { name: 'City at Night', url: '/textures/city/cyberbg.jpg' },
};

type CharacterKey = keyof typeof characters;
type BackgroundKey = keyof typeof backgrounds;
type RawVisemeCue = { start: number; end: number; value: RhubarbVisemeKey };


export default function Home() {
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>('harry');
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>('studio');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('AI Response will appear here...');
  const [isSending, setIsSending] = useState(false);
  const [isTestingLipSync, setIsTestingLipSync] = useState(false);
  const canvasRef = useRef<ThreeCanvasHandles>(null);

  const selectedCharacter = characters[selectedCharKey];
  const selectedBackground = backgrounds[selectedBgKey];

  // --- CORRECTED CHAT SUBMIT HANDLER ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending || !chatInput.trim()) return;

    setIsSending(true);
    setChatResponse('Thinking...');
    const prompt = chatInput;
    setChatInput('');

    try {
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
        throw new Error(`Companion API failed with status: ${companionResponse.status}`);
      }
      
      // The backend returns the raw Rhubarb cues in the 'visemes' property
      const result = await companionResponse.json();
      const { response: answer, audio_base64, visemes: rawVisemeCues } = result;

      if (!answer || !audio_base64) {
        throw new Error("Invalid or incomplete response from companion API");
      }
      
      setChatResponse(answer);

      // Process the visemes before sending them to the canvas
      if (canvasRef.current && rawVisemeCues && Array.isArray(rawVisemeCues)) {
        // Translate raw Rhubarb cues to the format our 3D model needs
        const processedVisemes = rawVisemeCues.map((cue: RawVisemeCue) => {
          const entry = rhubarbToVisemeMap[cue.value] || rhubarbToVisemeMap['X'];
          return {
            time: cue.start,
            value: entry.viseme, // The morph target name (e.g., 'viseme_aa')
            jaw: entry.jaw       // The corresponding jaw opening value
          };
        });

        // Add a final silent viseme to ensure the mouth closes after speaking
        if (rawVisemeCues.length > 0) {
          const lastCue = rawVisemeCues[rawVisemeCues.length - 1];
          processedVisemes.push({ time: lastCue.end, value: 'viseme_sil', jaw: 0 });
        }
        
        // Play the audio with the correctly translated lip-sync data
          const audioDataUri = `data:audio/mp3;base64,${audio_base64}`;
canvasRef.current.playAudioWithEmotionAndLipSync(audioDataUri, processedVisemes, result.emotion || 'neutral');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Chat submission error:", error);
      setChatResponse(`Error: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleTestLipSync = async () => {
    setIsTestingLipSync(true);
    if (!canvasRef.current) {
      setChatResponse('Canvas not ready for testing.');
      setIsTestingLipSync(false);
      return;
    }
    if (isSending) return; 

    setIsSending(true); 
    setChatResponse('Running static lip-sync test...');

    try {
      const response = await fetch('/audio/test-speech.json');
      if (!response.ok) {
        throw new Error(`Failed to load test-speech.json: ${response.statusText}`);
      }
      const rhubarbData = await response.json();

      const visemes = rhubarbData.mouthCues.map((cue: RawVisemeCue) => {
        const entry = rhubarbToVisemeMap[cue.value] || rhubarbToVisemeMap['X'];
        return {
            time: cue.start,
            value: entry.viseme, 
            jaw: entry.jaw       
        };
      });
      
      if (rhubarbData.mouthCues.length > 0) {
        const lastCue = rhubarbData.mouthCues[rhubarbData.mouthCues.length - 1];
        visemes.push({ time: lastCue.end, value: 'viseme_sil', jaw: 0 });
      }
      
      const audioResponse = await fetch('/sample.wav');
      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      const audioDataUri = `data:audio/mp3;base64,${audioBase64}`;
canvasRef.current.playAudioWithEmotionAndLipSync(audioDataUri, visemes, 'neutral');


      setChatResponse('Static lip-sync test complete.');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Lip-sync test failed:", error);
      setChatResponse(`Error in test: ${errorMessage}`);
    } finally {
      setIsSending(false);
      setIsTestingLipSync(false);
      
      setTimeout(() => {
        if (chatResponse.startsWith('Static lip-sync')) {
          setChatResponse('AI Response will appear here...');
        }
      }, 3000);
    }
  };

  return (
    <main className={styles.mainContainer}>
      <div className={styles.leftPanel}>
        <div className={styles.section}>
          <h1>AI Companion</h1>
          <p>Choose your companion and setting. Then, start a conversation.</p>
        </div>
        
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
                disabled={isSending}
              />
              <button
                type="submit"
                className={styles.button}
                style={{ padding: '6px 14px', fontSize: 14 }}
                disabled={isSending || !chatInput.trim()}
              >
                {isSending && !isTestingLipSync ? '...' : 'Send'}
              </button>
            </div>
          </form>
        </div>

        <div className={styles.section}>
          <h2>Choose a Character</h2>
          <div className={styles.buttonGroup}>
            {(Object.keys(characters) as CharacterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedCharKey(key)}
                className={`${styles.button} ${selectedCharKey === key ? styles.activeButton : ''}`}
                disabled={isSending}
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
                disabled={isSending}
              >
                {backgrounds[key].name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section} style={{ marginTop: '20px', borderTop: '1px solid #444', paddingTop: '15px' }}>
            <h3 style={{ marginBottom: 8 }}>Dev Tools</h3>
            <button 
              onClick={handleTestLipSync} 
              disabled={isSending}
              className={styles.button}
              style={{ width: '100%' }}
            >
              {isTestingLipSync ? 'Testing...' : 'Test Static Lip Sync'}
            </button>
        </div>

      </div>
      
      <div className={styles.rightPanel}>
        <ThreeCanvas
          ref={canvasRef}
          characterModelUrl={selectedCharacter.modelUrl}
          introAnimationUrl={selectedCharacter.introAnimationUrl}
          idleAnimationUrl={selectedCharacter.idleAnimationUrl}
          interruptAnimationUrl={selectedCharacter.interruptAnimationUrl}
          talkingAnimationUrl1={selectedCharacter.talkingAnimationUrl1}
          talkingAnimationUrl2={selectedCharacter.talkingAnimationUrl2}

          backgroundData={selectedBackground}
        />
      </div>
    </main>
  );
}