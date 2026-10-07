import React from 'react';

interface LoadingScreenProps {
  statusText?: string;
  subText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  statusText = "AIFINITY",
  subText = "Loading..."
}) => {
  return (
    <div
      id="aifinity-loading-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950 text-neutral-300 font-mono select-none px-4"
    >
      <div className="flex flex-col items-center space-y-4 max-w-xs text-center">
        {/* Minimal spinner */}
        <div className="relative w-8 h-8">
          <div className="w-8 h-8 rounded-full border border-neutral-800 border-t-amber-500 animate-spin"></div>
        </div>

        {/* Minimal text */}
        <div className="space-y-1">
          <div className="text-sm font-semibold tracking-wider text-neutral-200">
            {statusText}
          </div>
          <div className="text-xs text-neutral-500">
            {subText}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
