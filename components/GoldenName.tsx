import React from 'react';
import { Crown, Sparkles, Shield, Zap } from 'lucide-react';
import { UserRole, UserTier } from '../services/authService';

interface GoldenNameProps {
  name: string;
  isGolden?: boolean;
  tier?: UserTier;
  role?: UserRole;
  showGlowingName?: boolean;
  className?: string;
  showBadge?: boolean;
}

export const GoldenName: React.FC<GoldenNameProps> = ({
  name,
  isGolden = false,
  tier,
  role,
  showGlowingName = true,
  className = '',
  showBadge = true
}) => {
  // Chloe is unconditionally an Admin
  const cleanName = (name || '').trim();
  const isAdmin = role === 'admin' || cleanName.toLowerCase() === 'chloe';
  const isMod = role === 'mod' && !isAdmin;
  const isCelestial = tier === 'celestial';

  // 1. Celestial Admin Display
  if (isAdmin) {
    const isGlowing = showGlowingName !== false;
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title="System Administrator (Celestial Admin)">
        <span
          className={`font-bold transition-all ${
            isGlowing
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-fuchsia-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.85)]'
              : 'text-cyan-200'
          }`}
        >
          {name}
        </span>
        {showBadge && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider uppercase bg-gradient-to-r from-sky-950 via-indigo-950 to-purple-950 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.45)] shrink-0 select-none">
            <Sparkles size={10} className="text-cyan-300 animate-pulse shrink-0" />
            <span>ADMIN</span>
          </span>
        )}
      </span>
    );
  }

  // 2. Celestial Tier Player Display (Requested: Celestial tier with celestial name like admin)
  if (isCelestial) {
    const isGlowing = showGlowingName !== false;
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title="Celestial Player (Cosmic Tier - +1,000 Actions)">
        <span
          className={`font-bold transition-all ${
            isGlowing
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-purple-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.85)]'
              : 'text-cyan-200'
          }`}
        >
          {name}
        </span>
        {showBadge && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider uppercase bg-gradient-to-r from-sky-950 via-indigo-950 to-purple-950 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.45)] shrink-0 select-none">
            <Sparkles size={10} className="text-cyan-300 animate-pulse shrink-0" />
            <span>CELESTIAL</span>
          </span>
        )}
      </span>
    );
  }

  // 3. Golden Moderator Display
  if (isMod) {
    const isGlowing = showGlowingName !== false;
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title="Moderator (Golden Theme)">
        <span
          className={`font-bold transition-all ${
            isGlowing
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 drop-shadow-[0_0_9px_rgba(245,158,11,0.85)]'
              : 'text-amber-300'
          }`}
        >
          {name}
        </span>
        {showBadge && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider uppercase bg-gradient-to-r from-amber-950 via-yellow-950 to-amber-950 text-amber-300 border border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.45)] shrink-0 select-none">
            <Shield size={10} className="text-amber-400 shrink-0" />
            <span>MOD</span>
          </span>
        )}
      </span>
    );
  }

  // 4. Legendary Tier Golden Name
  if (isGolden || tier === 'legendary') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.75)] ${className}`}
        title="Legendary Player (Golden Name)"
      >
        {showBadge && <Crown size={12} className="text-amber-400 drop-shadow-sm shrink-0 inline" />}
        <span>{name}</span>
      </span>
    );
  }

  // 5. Standard Player
  return <span className={className}>{name}</span>;
};

export default GoldenName;
