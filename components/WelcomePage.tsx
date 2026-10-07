import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Zap, MessageSquareCode, Clock } from 'lucide-react';

interface WelcomePageProps {
  onEnterGame: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onEnterGame }) => {
  const [countdown, setCountdown] = useState<number>(8);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  useEffect(() => {
    if (isPaused) return;

    if (countdown <= 1) {
      onEnterGame();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isPaused, onEnterGame]);

  return (
    <div
      id="welcome-page"
      className="fixed inset-0 w-full overflow-y-auto bg-black text-gray-100 flex flex-col justify-between font-sans selection:bg-blue-600 selection:text-white z-10"
      style={{ WebkitOverflowScrolling: 'touch', height: '100%', maxHeight: '100%' }}
    >
      {/* Top Navigation */}
      <header id="welcome-header" className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-mono font-bold text-sm sm:text-base">
            A
          </div>
          <div>
            <span className="font-mono text-xs sm:text-sm tracking-wider font-semibold text-blue-400">AIFINITY</span>
            <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs text-neutral-500 font-mono">RPG SANDBOX</span>
          </div>
        </div>

        <button
          id="enter-game-nav-btn"
          onClick={onEnterGame}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-mono font-medium rounded border border-blue-500/50 bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
        >
          <span>Enter Game</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main id="welcome-main" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 flex flex-col justify-start sm:justify-center w-full">
        {/* Category Pill */}
        <div className="mb-4 sm:mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-400 text-xs font-mono max-w-fit">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Infinite Autonomous AI World Engine</span>
        </div>

        {/* Primary Headline Quote */}
        <h1 id="welcome-title" className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight mb-4 sm:mb-6">
          “Aifinity is an infinite AI RPG sandbox game that keeps track and sets up everything under seconds! Easy to play, in the most accurate way!”
        </h1>

        {/* Sub-quote */}
        <div className="border-l-2 border-blue-500/60 pl-3 sm:pl-4 py-1.5 sm:py-2 mb-6 sm:mb-8 bg-neutral-900/40 rounded-r">
          <p id="welcome-subtitle" className="text-base sm:text-xl text-neutral-200 font-medium">
            “Setting up and doing actions is as easy as sending a text.”
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div id="welcome-features" className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-10">
          <div className="p-3.5 sm:p-4 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <div className="flex items-center gap-2 text-blue-400 mb-1.5 sm:mb-2 font-mono text-xs font-semibold uppercase tracking-wider">
              <Zap className="w-4 h-4" />
              <span>Instant Setup</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Type any starting prompt or premise. Aifinity generates the physics, rules, starting scenario, and character attributes in seconds.
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <div className="flex items-center gap-2 text-emerald-400 mb-1.5 sm:mb-2 font-mono text-xs font-semibold uppercase tracking-wider">
              <MessageSquareCode className="w-4 h-4" />
              <span>Natural Text Actions</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              No complex syntax or cumbersome menus. Type what your character says or does naturally just like sending a text message.
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-lg bg-neutral-900/60 border border-neutral-800">
            <div className="flex items-center gap-2 text-purple-400 mb-1.5 sm:mb-2 font-mono text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Accurate World State</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Real-time persistent state files, dynamic maps, probability checks, and temporal consistency ensure complete narrative integrity.
            </p>
          </div>
        </div>

        {/* Call to Action and Redirect Timer Bar */}
        <div id="welcome-action-box" className="p-4 sm:p-6 rounded-lg bg-neutral-900/80 border border-neutral-700/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-mono text-neutral-400">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              {isPaused ? (
                <span>Auto-redirect paused.</span>
              ) : (
                <span>
                  Redirecting to game in <strong className="text-blue-400 font-bold">{countdown}s</strong>...
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              Ready to embark on your adventure? Jump straight into the simulation.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              id="pause-redirect-btn"
              onClick={() => setIsPaused(!isPaused)}
              className="flex-1 sm:flex-none px-3 py-2 text-xs font-mono text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 rounded transition-colors"
            >
              {isPaused ? 'Resume Redirect' : 'Stay on Page'}
            </button>
            <button
              id="launch-game-btn"
              onClick={onEnterGame}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold tracking-wider rounded flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition-all cursor-pointer"
            >
              <span>ENTER AIFINITY</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer id="welcome-footer" className="border-t border-neutral-900 py-3 sm:py-4 px-4 sm:px-6 text-center text-xs text-neutral-600 font-mono shrink-0">
        Aifinity &copy; {new Date().getFullYear()} &mdash; Infinite AI RPG Sandbox Engine
      </footer>
    </div>
  );
};

export default WelcomePage;
