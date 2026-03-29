/**
 * Mock Audio Hook
 * Silent implementation to satisfy UI components without loading external mp3 resources.
 * Prevents 404/416 load errors in the browser console.
 */
export const useAudio = () => {
  const play = (name: string) => {
    // console.log(`Audio mock play: ${name}`);
  };

  const toggleBGM = (shouldPlay: boolean) => {
    // console.log(`Audio mock BGM: ${shouldPlay}`);
  };

  const setGlobalVolume = (volume: number) => {
    // console.log(`Audio mock volume: ${volume}`);
  };

  return { play, toggleBGM, setGlobalVolume };
};
