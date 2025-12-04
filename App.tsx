import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { Play, RotateCcw, Trophy, Wind, Zap, Skull, AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'RESULT'>('MENU');
  const [resultData, setResultData] = useState<{score: number, rank: string, win: boolean, lap3: boolean} | null>(null);

  const startGame = () => setGameState('PLAYING');
  
  const handleGameOver = (score: number, rank: string, win: boolean, lap3: boolean) => {
    setResultData({ score, rank, win, lap3 });
    setGameState('RESULT');
  };

  const toMenu = () => setGameState('MENU');
  
  // Wrapper to restart game immediately from result screen
  const retryLevel = () => {
      setGameState('MENU'); // Briefly reset to ensure component remount if needed, though React key or direct switch usually works. 
      // Actually, since GameCanvas uses refs for initialization, unmounting is required.
      // Since 'RESULT' is a different block than 'PLAYING', switching directly 'RESULT' -> 'PLAYING' will mount a fresh GameCanvas.
      setTimeout(() => setGameState('PLAYING'), 0);
  };

  if (gameState === 'PLAYING') {
    return <GameCanvas onGameOver={handleGameOver} onExit={toMenu} />;
  }

  if (gameState === 'RESULT') {
    // GAME OVER SCREEN (LOSS)
    if (!resultData?.win) {
        return (
            <div className="w-full h-screen bg-red-950 flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10 animate-pulse"></div>
                <div className="z-10 bg-gray-900 p-12 rounded-lg shadow-[8px_8px_0_0_#ef4444] border-4 border-red-600 text-center max-w-lg w-full">
                    <Skull className="w-24 h-24 text-red-600 mx-auto mb-6 animate-bounce" />
                    <h1 className="text-7xl font-black mb-2 font-comic text-white drop-shadow-[4px_4px_0_#ef4444]">
                        GAME OVER
                    </h1>
                    <p className="text-2xl text-red-400 font-bold mb-8 uppercase tracking-widest">
                        CAUGHT BY THE CHASER!
                    </p>
                    
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={retryLevel}
                            className="group relative inline-flex items-center justify-center px-8 py-4 text-2xl font-black text-white transition-all duration-200 bg-red-600 border-4 border-black focus:outline-none hover:bg-red-500 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#fff]"
                        >
                            <RotateCcw className="mr-3 h-8 w-8 group-hover:-rotate-180 transition-transform" />
                            RETRY LEVEL
                        </button>
                        <button 
                            onClick={toMenu}
                            className="text-gray-500 hover:text-white font-bold text-sm tracking-widest uppercase hover:underline decoration-2 underline-offset-4 transition-colors"
                        >
                            Give Up & Return to Menu
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // VICTORY SCREEN (WIN)
    return (
      <div className="w-full h-screen bg-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        <div className={`z-10 bg-white p-12 rounded-lg shadow-[8px_8px_0_0_rgba(0,0,0,1)] border-4 border-black text-center max-w-lg w-full transform transition-all hover:scale-105`}>
          <h1 className="text-6xl font-black mb-2 font-comic italic text-green-500">
            DELIVERY COMPLETE!
          </h1>
          
          <div className="my-8">
            <div className="text-2xl font-bold uppercase tracking-widest text-gray-500">Rank</div>
            <div className="flex items-center justify-center gap-4">
                <div className={`text-9xl font-black font-comic drop-shadow-lg ${
                    resultData?.rank === 'P' ? 'text-purple-600' :
                    resultData?.rank === 'S' ? 'text-yellow-400' :
                    resultData?.rank === 'A' ? 'text-red-500' :
                    'text-gray-800'
                }`}>
                  {resultData?.rank}
                </div>
                {resultData?.lap3 && (
                    <Skull className="w-16 h-16 text-red-600 animate-pulse drop-shadow-[2px_2px_0_#000]" />
                )}
            </div>
          </div>

          <div className="text-3xl font-bold mb-8">
            Score: <span className="text-blue-600">{Math.floor(resultData?.score || 0)}</span>
          </div>

          <button 
            onClick={toMenu}
            className="group relative inline-flex items-center justify-center px-8 py-4 text-xl font-bold text-white transition-all duration-200 bg-black border-2 border-black focus:outline-none hover:bg-gray-800 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(128,128,128,1)]"
          >
            <RotateCcw className="mr-2 h-6 w-6 group-hover:rotate-180 transition-transform" />
            BACK TO KITCHEN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-yellow-400 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle, #000 2px, transparent 2.5px)',
            backgroundSize: '20px 20px'
        }}></div>

      <div className="z-10 text-center space-y-8">
        <div className="relative">
             <h1 className="text-8xl font-black text-white stroke-black drop-shadow-[6px_6px_0_rgba(0,0,0,1)] font-comic italic -rotate-3">
            LUNCH RUSH:<br/>
            <span className="text-red-600">OVERDRIVE</span>
            </h1>
            <Zap className="absolute -top-12 -right-12 w-24 h-24 text-yellow-200 animate-pulse" />
        </div>

        <div className="bg-white border-4 border-black p-6 rotate-1 shadow-[8px_8px_0_0_rgba(0,0,0,0.8)] max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center justify-center gap-2">
                <Wind className="w-6 h-6" /> HOW TO PLAY
            </h2>
            <ul className="text-left space-y-2 font-semibold text-gray-800">
                <li>Arrow Keys: Move</li>
                <li>Hold SHIFT: Sprint (Build MOMENTUM!)</li>
                <li>Z: Jump / Wall Run</li>
                <li>X: Shoulder Bash (Break blocks!)</li>
                <li>Goal: Reach the end, hit the switch, ESCAPE!</li>
            </ul>
        </div>

        <button 
          onClick={startGame}
          className="group relative inline-flex items-center justify-center px-12 py-6 text-3xl font-black text-white transition-all duration-200 bg-red-600 border-4 border-black focus:outline-none hover:bg-red-500 hover:-translate-y-2 hover:shadow-[8px_8px_0_0_rgba(0,0,0,1)]"
        >
          <Play className="mr-4 h-8 w-8 fill-current" />
          START SHIFT
        </button>
      </div>
    </div>
  );
};

export default App;