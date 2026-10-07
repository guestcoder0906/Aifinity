/**
 * Map Player Engine
 * Provides canonical player identification, multi-page deduplication,
 * and robust reconciliation between character files and CurrentMap.json.
 */

export interface RegisteredPlayer {
  username: string;
  charName: string;
  fullName: string;
  filename: string;
  aliases: Set<string>;
}

export interface PlayerResolution {
  canonicalKey: string;
  username: string;
  characterName: string;
  isRegistered: boolean;
  playerObj: any;
}

/**
 * Determines whether a file represents a human player character sheet rather than an NPC or world file.
 */
export function isPlayerCharacterFile(
  filename: string,
  content?: string | null
): { isPlayer: boolean; username: string; charName: string; canonicalName: string } {
  if (!filename || !filename.endsWith('.txt')) {
    return { isPlayer: false, username: '', charName: '', canonicalName: '' };
  }
  if (
    filename.startsWith('World') ||
    filename.startsWith('Guide') ||
    filename.startsWith('Log') ||
    filename.startsWith('History') ||
    filename.startsWith('Event') ||
    filename.startsWith('Combat') ||
    filename === 'CurrentMap.json'
  ) {
    return { isPlayer: false, username: '', charName: '', canonicalName: '' };
  }

  const base = filename.replace(/\.txt$/, '');
  const cleanBase = base.replace(/[-_](?:npc|dead|corpse)$/i, '').trim();

  // Deceased characters ending in -dead.txt are preserved corpses/memorials, not active player characters
  if (base.toLowerCase().endsWith('-dead') || base.toLowerCase().endsWith('_dead')) {
    return { isPlayer: false, username: '', charName: cleanBase, canonicalName: cleanBase };
  }

  let isPlayer = false;
  let username = '';
  let charName = '';

  if (content) {
    // If character is deceased or corpse in content, not an active player character
    if (
      /[-*•]?\s*status\s*[:=]\s*(?:dead|deceased|corpse|fallen|slain)/i.test(content) ||
      /\[(?:STATUS EFFECTS & LORE)\][\s\S]*?(?:Status:\s*Dead|Status:\s*Deceased)/i.test(content)
    ) {
      return { isPlayer: false, username: '', charName: cleanBase, canonicalName: cleanBase };
    }

    // If file represents an item, weapon, equipment, container, location, landmark, area, or spell
    if (
      /category\s*[:=]\s*(?:item|equipment|gear|weapon|clothing|vehicle|mount|container|armor|tool|transport|location|landmark|area|spell|note|event)/i.test(content) ||
      /\[(?:IDENTIFICATION|TECHNICAL RULES|SPECIAL PROPERTIES|CONDITION & ACTIVE EFFECTS|LOCATION DETAILS|TECHNICAL SCHEMA)\]/i.test(content) ||
      /damage range:|container space capacity:|holding anatomy:/i.test(content)
    ) {
      return { isPlayer: false, username: '', charName: cleanBase, canonicalName: cleanBase };
    }

    const playerMatch = content.match(/[-*•]?\s*Player\s*[:=]\s*([^\n\r]+)/i);
    if (playerMatch && playerMatch[1]) {
      const pVal = playerMatch[1].replace(/^[*-•\s]+/, '').trim();
      if (pVal && !/^(?:none|n\/a|npc|dead|deceased|former|bot|ai|unassigned)/i.test(pVal)) {
        isPlayer = true;
        username = pVal;
      }
    }
    const nameMatch = content.match(/[-*•]?\s*(?:Character\s+)?Name\s*[:=]\s*([^\n\r]+)/i);
    if (nameMatch && nameMatch[1]) {
      const nVal = nameMatch[1].replace(/^[*-•\s]+/, '').trim();
      if (nVal && nVal.length > 1 && !/^(?:adventurer|player|npc)$/i.test(nVal)) {
        charName = nVal;
      }
    }
  }

  // Only consider filename pattern fallback if content is absent AND it's not a known item/location/non-player keyword
  if (!isPlayer && !content && cleanBase.includes('-')) {
    const parts = cleanBase.split('-');
    const suffix = parts[parts.length - 1].trim();
    const prefix = parts.slice(0, -1).join('-').trim();
    const suffixLower = suffix.toLowerCase();
    const NON_PLAYER_SUFFIXES = new Set([
      'npc', 'dead', 'corpse', 'deceased', 'bot', 'ai', 'boss', 'monster', 'creature', 'enemy', 'ally',
      'guard', 'merchant', 'item', 'weapon', 'sword', 'shield', 'armor', 'bow', 'potion', 'herb',
      'scroll', 'key', 'ring', 'amulet', 'staff', 'wand', 'dagger', 'axe', 'spear', 'helmet', 'boots',
      'gloves', 'cloak', 'pouch', 'bag', 'backpack', 'chest', 'box', 'camp', 'room', 'door', 'gate',
      'cave', 'tower', 'bridge', 'river', 'forest', 'shop', 'inn', 'tavern', 'hall', 'shrine', 'altar'
    ]);
    if (suffix && !NON_PLAYER_SUFFIXES.has(suffixLower)) {
      isPlayer = true;
      if (!username) username = suffix;
      if (!charName) charName = prefix || suffix;
    }
  }

  return {
    isPlayer,
    username: username.trim(),
    charName: (charName || username).trim(),
    canonicalName: cleanBase
  };
}

/**
 * Detects and repairs any human player character files that were incorrectly named or corrupted
 * with an accidental "-npc" suffix (e.g., "MiraRavencrest-Chloe-npc.txt" -> "MiraRavencrest-Chloe.txt").
 * Also cleans up duplicate player files for the same account.
 */
export function cleanAndRepairPlayerFiles(
  fileSystem: {
    list: () => string[];
    read: (f: string) => string | null;
    write: (f: string, c: string) => void;
    delete: (f: string) => void;
    exists?: (f: string) => boolean;
  }
): string[] {
  if (!fileSystem || typeof fileSystem.list !== 'function') return [];
  const files = fileSystem.list();

  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    if (
      f.startsWith('World') ||
      f.startsWith('Guide') ||
      f.startsWith('Log') ||
      f.startsWith('History') ||
      f.startsWith('Event') ||
      f.startsWith('Combat') ||
      f === 'CurrentMap.json'
    ) continue;

    const base = f.replace(/\.txt$/, '');
    const lower = base.toLowerCase();

    if (lower.endsWith('-npc') || lower.endsWith('_npc')) {
      const content = fileSystem.read(f);
      const detection = isPlayerCharacterFile(f, content);

      if (detection.isPlayer) {
        const cleanBase = base.replace(/[-_]npc$/i, '').trim();
        const targetFilename = `${cleanBase}.txt`;

        console.log(`[Player Engine] Repairing corrupted player character filename: "${f}" -> "${targetFilename}"`);
        if (content) {
          const cleanedContent = content
            .replace(/[-*•]?\s*is_npc\s*[:=]\s*true[^\n\r]*/gi, '')
            .replace(/[-*•]?\s*category\s*[:=]\s*npc[^\n\r]*/gi, '')
            .replace(/[-*•]?\s*status\s*[:=]\s*npc[^\n\r]*/gi, '');
          fileSystem.write(targetFilename, cleanedContent);
        }
        fileSystem.delete(f);
      } else if (content) {
        // Also check if an item, weapon, equipment, or vehicle was mistakenly renamed with -npc.txt
        const isItemOrVehicle = /category\s*[:=]\s*(?:item|equipment|gear|weapon|vehicle|container|armor|clothing)|type\s*[:=]\s*(?:item|weapon|vehicle|equipment)|attached\s*to\s*[:=]|equipped\s*by\s*[:=]/i.test(content);
        if (isItemOrVehicle) {
          const cleanBase = base.replace(/[-_]npc$/i, '').trim();
          const targetFilename = `${cleanBase}.txt`;
          console.log(`[Entity Engine] Repairing item/vehicle mistakenly given -npc suffix: "${f}" -> "${targetFilename}"`);
          fileSystem.write(targetFilename, content);
          fileSystem.delete(f);
        }
      }
    }
  }

  return fileSystem.list();
}

/**
 * Discovers and builds a registry of all human players from the character files in the project.
 */
export function buildPlayerRegistry(
  files: string[] = [],
  fileSystem?: { read: (f: string) => string | null }
): RegisteredPlayer[] {
  const registry: RegisteredPlayer[] = [];
  const seenUsernames = new Set<string>();

  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    if (
      f.startsWith('World') ||
      f.startsWith('Guide') ||
      f.startsWith('Log') ||
      f.startsWith('History') ||
      f.startsWith('Event') ||
      f.startsWith('Combat') ||
      f === 'CurrentMap.json'
    ) {
      continue;
    }

    const content = fileSystem ? fileSystem.read(f) : null;
    const playerCheck = isPlayerCharacterFile(f, content);

    if (!playerCheck.isPlayer) {
      continue;
    }

    const username = playerCheck.username;
    let charName = playerCheck.charName;
    const base = f.replace(/\.txt$/, '').replace(/[-_]npc$/i, '').trim();

    const uKey = username.toLowerCase();
    if (seenUsernames.has(uKey)) continue;
    seenUsernames.add(uKey);

    let fullName = charName;
    if (content) {
      const nameMatch = content.match(/[-*•]?\s*(?:Character\s+)?Name\s*[:=]\s*([^\n\r]+)/i);
      if (nameMatch) {
        const rawParsedName = nameMatch[1].replace(/^[*-•\s]+/, '').trim();
        if (rawParsedName && rawParsedName.length > 1) {
          fullName = rawParsedName;
          if (!charName || charName === username) {
            charName = rawParsedName;
          }
        }
      }
    }

    const aliases = new Set<string>();
    const addTokens = (str: string) => {
      if (!str) return;
      const clean = str.toLowerCase().trim();
      if (!clean) return;
      aliases.add(clean);
      const alphaNum = clean.replace(/[^a-z0-9\s]/g, ' ').trim();
      if (alphaNum) {
        aliases.add(alphaNum);
        alphaNum.split(/\s+/).forEach(w => {
          if (w.length >= 3) aliases.add(w);
        });
      }
    };

    addTokens(username);
    addTokens(charName);
    addTokens(fullName);
    addTokens(base);
    addTokens(`${charName} ${username}`);
    addTokens(`${charName}-${username}`);

    registry.push({
      username,
      charName,
      fullName,
      filename: `${base}.txt`,
      aliases
    });
  }

  return registry;
}

/**
 * Resolves any map player token to its canonical player identity and links it
 * with its registered player file if available.
 */
export function resolvePlayerIdentity(
  pl: any,
  registry: RegisteredPlayer[] = []
): PlayerResolution {
  if (!pl || typeof pl !== 'object') {
    return {
      canonicalKey: 'player',
      username: 'Player',
      characterName: 'Player',
      isRegistered: false,
      playerObj: pl
    };
  }

  const rawUsername = (pl.username !== undefined ? String(pl.username) : '').trim();
  const rawCharName = (pl.characterName !== undefined ? String(pl.characterName) : '').trim();
  const rawName = (pl.name !== undefined ? String(pl.name) : '').trim();
  const rawId = (pl.id !== undefined ? String(pl.id) : '').trim();

  const candidates = [rawUsername, rawCharName, rawName, rawId].filter(Boolean);

  for (const reg of registry) {
    const regUKey = reg.username.toLowerCase();
    const regCKey = reg.charName.toLowerCase();
    const regFKey = reg.fullName.toLowerCase();

    for (const cand of candidates) {
      const cLower = cand.toLowerCase().trim();
      if (!cLower) continue;

      if (cLower === regUKey || cLower === regCKey || cLower === regFKey) {
        return makeWinner(reg);
      }

      if (reg.aliases.has(cLower)) {
        return makeWinner(reg);
      }

      const cAlpha = cLower.replace(/[^a-z0-9]/g, '');
      if (
        cAlpha &&
        (cAlpha === regUKey.replace(/[^a-z0-9]/g, '') ||
          cAlpha === regCKey.replace(/[^a-z0-9]/g, '') ||
          cAlpha === regFKey.replace(/[^a-z0-9]/g, ''))
      ) {
        return makeWinner(reg);
      }

      if (cLower.startsWith(regCKey) || cLower.includes(regUKey) || regFKey.includes(cLower)) {
        if (cLower.length >= 3 || cLower === regUKey) {
          return makeWinner(reg);
        }
      }
    }
  }

  function makeWinner(reg: RegisteredPlayer): PlayerResolution {
    const finalUsername = reg.username;
    const finalCharName = reg.fullName || reg.charName || finalUsername;
    pl.username = finalUsername;
    if (!pl.characterName || pl.characterName === pl.username) {
      pl.characterName = finalCharName;
    }
    return {
      canonicalKey: reg.username.toLowerCase(),
      username: finalUsername,
      characterName: finalCharName,
      isRegistered: true,
      playerObj: pl
    };
  }

  const bestName = rawUsername || rawCharName || rawName || rawId || 'player';
  const cleanKey = bestName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return {
    canonicalKey: cleanKey || 'player',
    username: rawUsername || bestName,
    characterName: rawCharName || rawName || bestName,
    isRegistered: false,
    playerObj: pl
  };
}

/**
 * Selects the best token among duplicates on the same page and merges details.
 */
function pickBestPlayerToken(tokens: any[], activeUsername?: string): any {
  if (tokens.length === 1) return tokens[0];

  let best = tokens[0];
  let bestScore = -Infinity;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let score = i;
    if (t.vision) score += 50;
    if (t.facing !== undefined && t.facing !== 0) score += 20;
    if (t.characterName && t.characterName !== t.username) score += 20;
    if (activeUsername && String(t.username).toLowerCase() === activeUsername.toLowerCase()) score += 30;

    const px = Number(t.x) || 0;
    const py = Number(t.y) || 0;
    // Penalize exact default grid coordinates
    if (px >= 10 && px <= 60 && (px - 10) % 8 === 0 && (py - 15) % 6 === 0) {
      score -= 40;
    }

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  for (const t of tokens) {
    if (t === best) continue;
    if (!best.vision && t.vision) best.vision = t.vision;
    if (!best.facing && t.facing) best.facing = t.facing;
    if (!best.characterName && t.characterName) best.characterName = t.characterName;
  }

  return best;
}

/**
 * Purges any NPC tokens from all map pages that match any registered human player's
 * username, character name, full name, or aliases.
 * Player characters are strictly players, NEVER NPCs.
 */
export function purgePlayerDuplicatesFromNpcs(
  pages: any[],
  registry: RegisteredPlayer[] = []
): void {
  if (!pages || !Array.isArray(pages) || pages.length === 0 || registry.length === 0) return;

  const forbiddenKeys = new Set<string>();
  for (const reg of registry) {
    if (reg.username) {
      const u = reg.username.toLowerCase().trim();
      forbiddenKeys.add(u);
      forbiddenKeys.add(`${u}-npc`);
      forbiddenKeys.add(`${u}_npc`);
      forbiddenKeys.add(`npc-${u}`);
    }
    if (reg.charName) {
      const c = reg.charName.toLowerCase().trim();
      forbiddenKeys.add(c);
      forbiddenKeys.add(`${c}-npc`);
      forbiddenKeys.add(`${c}_npc`);
      forbiddenKeys.add(`npc-${c}`);
    }
    if (reg.fullName) {
      const f = reg.fullName.toLowerCase().trim();
      forbiddenKeys.add(f);
      forbiddenKeys.add(`${f}-npc`);
      forbiddenKeys.add(`${f}_npc`);
      forbiddenKeys.add(`npc-${f}`);
    }
    reg.aliases.forEach(a => {
      const al = a.toLowerCase().trim();
      if (al && al.length >= 3) {
        forbiddenKeys.add(al);
        forbiddenKeys.add(`${al}-npc`);
      }
    });
  }

  for (const page of pages) {
    if (Array.isArray(page.npcs)) {
      page.npcs = page.npcs.filter((npc: any) => {
        if (!npc || typeof npc !== 'object') return false;
        const rawName = String(npc.name || npc.charName || npc.characterName || '').trim().toLowerCase();
        if (!rawName) return true;

        const cleanName = rawName.replace(/[-_]npc$/i, '').trim();
        const baseName = cleanName.replace(/[^a-z0-9\s]/g, '').trim();

        if (forbiddenKeys.has(rawName) || forbiddenKeys.has(cleanName) || forbiddenKeys.has(baseName)) {
          return false;
        }

        for (const reg of registry) {
          const regU = reg.username.toLowerCase();
          const regC = reg.charName.toLowerCase();
          const regF = reg.fullName.toLowerCase();
          if (cleanName === regU || cleanName === regC || cleanName === regF) {
            return false;
          }
          if (rawName.includes(regU) && rawName.includes(regC)) {
            return false;
          }
        }

        return true;
      });
    }
  }
}

/**
 * Deduplicates players both within each page and across all pages of the map.
 * Ensures that each player exists EXACTLY ONCE on the entire map.
 */
export function deduplicatePlayersOnMap(
  pages: any[],
  registry: RegisteredPlayer[] = [],
  options: {
    activeUsername?: string;
    oldPlayerLocations?: Map<string, { pageIndex: number; pageName: string; x: number; y: number; facing: number; raw: any }>;
  } = {}
): void {
  if (!pages || !Array.isArray(pages) || pages.length === 0) return;

  // Clean out any rogue NPCs that are actually players
  purgePlayerDuplicatesFromNpcs(pages, registry);

  // 1. Canonicalize player identity on all tokens
  for (const page of pages) {
    if (Array.isArray(page.players)) {
      for (const pl of page.players) {
        resolvePlayerIdentity(pl, registry);
      }
    }
  }

  // 2. Intra-page deduplication
  for (const page of pages) {
    if (!Array.isArray(page.players) || page.players.length <= 1) continue;

    const playerMap = new Map<string, any[]>();
    for (const pl of page.players) {
      const res = resolvePlayerIdentity(pl, registry);
      if (!playerMap.has(res.canonicalKey)) {
        playerMap.set(res.canonicalKey, []);
      }
      playerMap.get(res.canonicalKey)!.push(pl);
    }

    const dedupedPlayers: any[] = [];
    playerMap.forEach((list) => {
      if (list.length === 1) {
        dedupedPlayers.push(list[0]);
      } else {
        const winner = pickBestPlayerToken(list, options.activeUsername);
        dedupedPlayers.push(winner);
      }
    });
    page.players = dedupedPlayers;
  }

  // 3. Cross-page deduplication
  if (pages.length > 1) {
    const occurrencesMap = new Map<
      string,
      { pageIndex: number; pageName: string; player: any; score: number }[]
    >();

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const pageName = (page.name || '').trim().toLowerCase();
      if (!Array.isArray(page.players)) continue;

      for (const pl of page.players) {
        const res = resolvePlayerIdentity(pl, registry);
        const key = res.canonicalKey;

        let score = 0;
        const px = Number(pl.x) || 0;
        const py = Number(pl.y) || 0;

        if (options.oldPlayerLocations && options.oldPlayerLocations.has(key)) {
          const oldLoc = options.oldPlayerLocations.get(key)!;
          const samePage = pageName === oldLoc.pageName || pIdx === oldLoc.pageIndex;
          const sameCoords = Math.abs(px - oldLoc.x) < 0.2 && Math.abs(py - oldLoc.y) < 0.2;

          if (samePage && sameCoords) {
            score -= 100; // Stale location from previous turn
          } else if (!samePage) {
            score += 100; // Moved to a new page
          } else {
            score += 50;  // Updated coords on same page
          }
        }

        score += pIdx * 10;

        // Custom coordinates bonus
        if (!(Math.abs((px - 10) % 8) < 0.01 && Math.abs((py - 15) % 6) < 0.01 && px <= 50 && py <= 50)) {
          score += 20;
        }

        if (pl.vision) score += 15;

        if (!occurrencesMap.has(key)) {
          occurrencesMap.set(key, []);
        }
        occurrencesMap.get(key)!.push({
          pageIndex: pIdx,
          pageName,
          player: pl,
          score
        });
      }
    }

    occurrencesMap.forEach((occs, key) => {
      if (occs.length <= 1) return;

      occs.sort((a, b) => b.score - a.score);
      const winner = occs[0];

      // Remove from other pages or stale duplicates on same page
      for (let i = 1; i < occs.length; i++) {
        const toDrop = occs[i];
        const page = pages[toDrop.pageIndex];
        if (page && Array.isArray(page.players)) {
          if (toDrop.pageIndex === winner.pageIndex) {
            page.players = page.players.filter((p: any) => p !== toDrop.player);
          } else {
            page.players = page.players.filter((p: any) => {
              const r = resolvePlayerIdentity(p, registry);
              return r.canonicalKey !== key;
            });
          }
        }
      }
    });
  }
}

/**
 * Ensures all registered human players have a token on the map, placing them on
 * page 0 ONLY if they are not already present on ANY page.
 */
export function reconcileRegisteredPlayersOnMap(
  pages: any[],
  registry: RegisteredPlayer[]
): void {
  if (!pages || pages.length === 0 || registry.length === 0) return;

  const existingKeys = new Set<string>();
  for (const page of pages) {
    if (Array.isArray(page.players)) {
      for (const pl of page.players) {
        const res = resolvePlayerIdentity(pl, registry);
        existingKeys.add(res.canonicalKey);
      }
    }
  }

  for (const reg of registry) {
    const key = reg.username.toLowerCase();
    if (!existingKeys.has(key)) {
      if (!Array.isArray(pages[0].players)) {
        pages[0].players = [];
      }
      const offset = pages[0].players.length;
      pages[0].players.push({
        username: reg.username,
        characterName: reg.fullName || reg.charName,
        x: 10 + (offset * 8),
        y: 15 + (offset * 6),
        facing: 0,
        vision: { mainAngle: 66, peripheralAngle: 90, detailedRange: 20, maxRange: 50 }
      });
      existingKeys.add(key);
    }
  }
}

const NPC_TITLES_OCCUPATIONS = new Set([
  'the', 'a', 'an', 'old', 'young', 'elder', 'little', 'big', 'great',
  'man', 'woman', 'lady', 'sir', 'madam', 'mister', 'mr', 'mrs', 'ms',
  'father', 'mother', 'brother', 'sister', 'doctor', 'dr', 'captain', 'commander',
  'officer', 'sergeant', 'lieutenant', 'chief', 'sheriff', 'mayor', 'master',
  'lord', 'king', 'queen', 'prince', 'princess', 'baron', 'count', 'duke',
  'blacksmith', 'smith', 'shopkeeper', 'merchant', 'vendor', 'trader',
  'innkeeper', 'bartender', 'barkeep', 'tavernkeeper', 'herbalist', 'alchemist',
  'apothecary', 'cleric', 'priest', 'priestess', 'ranger', 'hunter', 'farmer',
  'fisherman', 'sailor', 'pirate', 'thief', 'rogue', 'wizard', 'mage', 'sorcerer',
  'knight', 'paladin', 'warrior', 'guard', 'town guard', 'city guard', 'watchman', 'sentry', 'patrol'
]);

/**
 * Normalizes an NPC name to identify its core entity identity, detect distinct numbering,
 * and determine if genuine cloning or illusion context applies.
 */
export function normalizeNpcName(raw: string): {
  normalized: string;
  cleanName: string;
  coreTokens: string[];
  numberIndex?: number;
  letterIndex?: string;
  isExplicitClone: boolean;
} {
  let name = String(raw || '').trim();
  name = name.replace(/[-_]npc$/i, '').trim();

  // Genuine cloning context: Mirror Image spell, simulacrum, clone vat, doppelganger, etc.
  const isExplicitClone = /\b(?:clone|illusion|duplicate|mirror\s*image|simulacrum|doppelganger|copy|replica|decoy|shadow\s*clone|split|mitosis|hologram|projection)\b/i.test(name);

  let numberIndex: number | undefined;
  let letterIndex: string | undefined;

  const numMatch = name.match(/(?:^|[\s_-])#?(\d+)\b/);
  if (numMatch) {
    numberIndex = parseInt(numMatch[1], 10);
  }

  const letterMatch = name.match(/(?:^|[\s_-])([A-Z])\b/);
  if (!numberIndex && letterMatch && !['A', 'I'].includes(letterMatch[1])) {
    letterIndex = letterMatch[1];
  }

  const decamel = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const clean = decamel.replace(/[-_]+/g, ' ').replace(/[()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  const tokens = lower.split(/\s+/).filter(t => t.length > 0 && !/^\d+$/.test(t));
  const coreTokens = tokens.filter(t => !NPC_TITLES_OCCUPATIONS.has(t));

  return {
    normalized: lower,
    cleanName: clean,
    coreTokens: coreTokens.length > 0 ? coreTokens : tokens,
    numberIndex,
    letterIndex,
    isExplicitClone
  };
}

/**
 * Determines whether two NPC names refer to the exact same NPC entity
 * (preventing accidental cloning with slight name variations),
 * while preserving distinct numbered minions and genuine magical/sci-fi clones.
 */
export function areNpcsSameEntity(rawA: string, rawB: string): boolean {
  if (!rawA || !rawB) return false;
  if (rawA === rawB) return true;

  const a = normalizeNpcName(rawA);
  const b = normalizeNpcName(rawB);

  // If either entity has an explicit cloning/illusion tag, do NOT merge them unless identical clone tag
  if (a.isExplicitClone || b.isExplicitClone) {
    return a.normalized === b.normalized;
  }

  // If one has index 1 and another has index 2 (e.g. Bandit 1 vs Bandit 2), they are DIFFERENT entities
  if (a.numberIndex !== undefined && b.numberIndex !== undefined && a.numberIndex !== b.numberIndex) {
    return false;
  }
  if (a.letterIndex !== undefined && b.letterIndex !== undefined && a.letterIndex !== b.letterIndex) {
    return false;
  }

  // Exact normalized match e.g. "maeve" === "maeve"
  if (a.normalized === b.normalized) return true;

  // Normalized without spaces e.g. "townguard" === "townguard"
  const aNoSpace = a.normalized.replace(/\s+/g, '');
  const bNoSpace = b.normalized.replace(/\s+/g, '');
  if (aNoSpace === bNoSpace) return true;

  // Check core tokens (e.g. "Garrick" vs "Blacksmith Garrick" vs "Garrick the Blacksmith")
  if (a.coreTokens.length > 0 && b.coreTokens.length > 0) {
    const aCore = a.coreTokens.join(' ');
    const bCore = b.coreTokens.join(' ');
    if (aCore === bCore) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
    // Subset match: e.g. "Jenkins" in "Old Man Jenkins" or "Garrick" in "Garrick Ironfoot"
    if (a.coreTokens.length === 1 && b.coreTokens.includes(a.coreTokens[0])) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
    if (b.coreTokens.length === 1 && a.coreTokens.includes(b.coreTokens[0])) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Deduplicates NPCs on map pages.
 * Prevents accidental duplicate / cloned NPCs with slight name variations from cluttering the map,
 * while preserving genuine distinct numbered entities and explicit clone mechanics.
 */
export function deduplicateNpcsOnMap(pages: any[], fileList: string[] = []): void {
  if (!pages || !Array.isArray(pages)) return;

  // Build a lookup of established canonical NPC names from existing -npc.txt files
  const canonicalNpcNames = fileList
    .filter(f => f.endsWith('-npc.txt'))
    .map(f => f.replace(/\.txt$/, ''));

  for (const page of pages) {
    if (!Array.isArray(page.npcs) || page.npcs.length <= 1) continue;

    const uniqueNpcs: any[] = [];
    for (const npc of page.npcs) {
      if (!npc || typeof npc !== 'object') continue;
      const rawName = String(npc.name || npc.charName || npc.characterName || '').trim();
      if (!rawName) continue;

      // Ensure -npc suffix
      let normalizedName = rawName.endsWith('-npc') ? rawName : `${rawName}-npc`;

      // Check if there is an established canonical file name that matches this entity
      const canonicalMatch = canonicalNpcNames.find(c => areNpcsSameEntity(c, normalizedName));
      if (canonicalMatch) {
        normalizedName = canonicalMatch;
      }

      const existingIdx = uniqueNpcs.findIndex(existing => areNpcsSameEntity(existing.name, normalizedName));
      if (existingIdx >= 0) {
        // Duplicate / cloned NPC detected! Merge into a single canonical entity
        const existing = uniqueNpcs[existingIdx];
        // Prefer canonical name from file or cleaner title
        if (canonicalMatch && existing.name !== canonicalMatch) {
          existing.name = canonicalMatch;
        }
        // Preserve richer metadata
        if (!existing.vision && npc.vision) existing.vision = npc.vision;
        if ((existing.facing === undefined || existing.facing === 0) && npc.facing !== undefined && npc.facing !== 0) {
          existing.facing = npc.facing;
        }
        if (npc.description && !existing.description) {
          existing.description = npc.description;
        }
      } else {
        uniqueNpcs.push({
          ...npc,
          name: normalizedName
        });
      }
    }

    page.npcs = uniqueNpcs;
  }
}

/**
 * Reconciles incoming and existing NPC files to prevent duplicate / cloned NPC files
 * with slight name variations (e.g. "Garrick-npc.txt" and "BlacksmithGarrick-npc.txt").
 */
export function reconcileNpcFiles(fs: any, incomingFiles?: Record<string, any>): { reconciled: boolean; mergedCount: number } {
  if (!fs) return { reconciled: false, mergedCount: 0 };
  let mergedCount = 0;

  const existingFiles = (typeof fs.list === 'function' ? fs.list() : Object.keys(fs.getAll?.() || {})) as string[];
  const existingNpcFiles = existingFiles.filter(f => f.endsWith('-npc.txt'));

  // 1. Reconcile incoming files against established existing NPC files
  if (incomingFiles && typeof incomingFiles === 'object') {
    const incomingNames = Object.keys(incomingFiles).filter(f => f.endsWith('-npc.txt'));
    for (const inName of incomingNames) {
      const matchExisting = existingNpcFiles.find(ex => ex !== inName && areNpcsSameEntity(ex.replace(/\.txt$/, ''), inName.replace(/\.txt$/, '')));
      if (matchExisting) {
        // Incoming file is a variation of an already established NPC file!
        // Preserve content in the canonical established filename and remove the duplicate variation
        const incomingData = incomingFiles[inName];
        incomingFiles[matchExisting] = incomingData;
        delete incomingFiles[inName];
        if (fs.exists(inName)) {
          fs.delete(inName);
        }
        mergedCount++;
      }
    }
  }

  // 2. Reconcile any existing duplicate NPC files already in the filesystem
  const currentNpcFiles = (typeof fs.list === 'function' ? fs.list() : Object.keys(fs.getAll?.() || {})) as string[];
  const npcFiles = currentNpcFiles.filter(f => f.endsWith('-npc.txt'));
  const visited = new Set<string>();

  for (let i = 0; i < npcFiles.length; i++) {
    const fileA = npcFiles[i];
    if (visited.has(fileA)) continue;

    for (let j = i + 1; j < npcFiles.length; j++) {
      const fileB = npcFiles[j];
      if (visited.has(fileB)) continue;

      if (areNpcsSameEntity(fileA.replace(/\.txt$/, ''), fileB.replace(/\.txt$/, ''))) {
        // Duplicate files found! Keep the cleaner/canonical one (shorter or without underscores)
        const nameA = fileA.replace(/\.txt$/, '');
        const nameB = fileB.replace(/\.txt$/, '');
        const keepA = nameA.length <= nameB.length && !nameA.includes('_');
        const canonicalFile = keepA ? fileA : fileB;
        const duplicateFile = keepA ? fileB : fileA;

        // If duplicate has content and canonical is shorter, preserve the richer content
        const contCanon = fs.read(canonicalFile) || '';
        const contDupe = fs.read(duplicateFile) || '';
        if (contDupe.length > contCanon.length) {
          fs.write(canonicalFile, contDupe);
        }

        fs.delete(duplicateFile);
        visited.add(duplicateFile);
        mergedCount++;
      }
    }
  }

  return { reconciled: mergedCount > 0, mergedCount };
}

export interface HeldItemInfo {
  name: string;
  cleanName: string;
  raw?: string;
  limb?: string;
  range?: number;
  isOverflow?: boolean;
}

/**
 * Robustly extracts the clean item name from any equipment, holding, or inventory line.
 * Completely strips limb/slot prefixes (both bracketed and unbracketed, e.g. [Main Hand], Main Hand:,
 * Both Hands (Two-Handed):, Under Arm (Overflow):, etc.), dimensions, weights, and stat suffixes.
 */
export function extractCleanItemNameFromLine(rawLine: string): string {
  if (!rawLine) return '';
  let line = rawLine.replace(/^[-*•>\s\d.]+/, '').trim();
  if (!line || line.startsWith('#')) return '';

  // 1. Strip limb or slot bracket prefixes like [Main Hand], [Both Hands (Two-Handed)], [Equipped], [Worn], [Attached], etc.
  line = line.replace(/^\[(?:Main Hand|Off Hand|Both Hands(?:\s*\([^)]*\))?|Two-Handed|Right Hand|Left Hand|Held in Jaws|Hands|Worn|Equipped|Attached|Container|Vehicle|Mount)[^\]]*\]\s*[:=-]?\s*/i, '').trim();

  // 2. Strip limb, slot, inventory, or container subheaders with or without colons:
  // e.g. "Main Hand:", "Both Hands (Two-Handed):", "Containers Equipped/Carried:", "Equipped Gear & Armor:", "Attached:", "Mount / Vehicle Link:"
  line = line.replace(/^(?:(?:Main|Off|Both|Right|Left)\s+Hands?(?:\s*\([^)]*\))?|Two-Handed(?:\s*Grip)?|Held in Jaws|Mouth|Talons|Beak|Tentacles|Under Arm(?:\s*\(Overflow\))?|Overflow(?:\s*Hold)?|Worn Gear|Equipped Gear(?:\s*& Armor)?|Containers?(?:\s*Equipped(?:\/Carried)?)?|Carried Inventory(?:\s*\([^)]*\))?|Mount(?: \/ Vehicle Link)?|Mounting \/ Riding Status|Attached(?: Vehicle| Transport| Equipment| Gear)?|Worn|Equipped|Attached|Mount|Vehicle|Container)\s*[:=-]\s*/i, '').trim();

  // Handle bracketed item links directly: e.g. "[Wooden Cart]" -> "Wooden Cart"
  const bracketMatch = line.match(/^\[([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1] && !bracketMatch[1].toLowerCase().startsWith('location:')) {
    line = bracketMatch[1].trim();
  }

  // 3. Take everything before the first colon, semicolon, or parenthesis with weight/dimensions/stats
  const weightOrDimIndex = line.search(/[:|;]\s*(?:weight|dimensions?|dim|range|reach|capacity|damage|ac|status|equipped|attached|overflow|drop|qty|quantity)\b/i);
  let namePart = weightOrDimIndex >= 0
    ? line.substring(0, weightOrDimIndex).trim()
    : line.split(/[:|;]|\s*\((?:weight|dimensions?|dim|range|reach|capacity|[0-9.]+\s*lbs?|[0-9.]+\s*kg)/i)[0].trim();

  // Strip trailing parens like "(Attached to Player)", "(Riding)", or "(Two-Handed)"
  namePart = namePart.replace(/\s*\([^)]*(?:attached|equipped|worn|two-handed|grip|overflow|lbs|kg|riding|mounted|driver|passenger|occupant)[^)]*\)/gi, '').trim();
  // Strip outer brackets/quotes
  namePart = namePart.replace(/^["'\[]+|["'\]]+$/g, '').trim();

  // Filter out meta headers and non-item entries (e.g. empty hands, free hand)
  if (!namePart || namePart.length < 2 || /^(none|n\/a|empty|slots?|capacity|hand slots|anatomy|items currently held|items?|containers?|equipped|worn|free\s*hands?|empty\s*hands?|bare\s*hands?|open\s*hands?|unarmed|hands?\s*free)$/i.test(namePart)) {
    return '';
  }

  return namePart;
}

/**
 * Extracts items currently held in hands/limbs from a character sheet.
 */
export function extractHeldItemsFromCharacterSheet(content: string): HeldItemInfo[] {
  if (!content) return [];
  const heldItems: HeldItemInfo[] = [];

  const linesToParse: string[] = [];

  // 1. Look for [CURRENTLY HOLDING], [ITEMS CURRENTLY HELD], [HELD ITEMS]
  const holdingMatch = content.match(
    /\[(?:CURRENTLY HOLDING|ITEMS CURRENTLY HELD|HELD ITEMS|HOLDING|CURRENT HOLDINGS)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i
  );
  if (holdingMatch && holdingMatch[1]) {
    const lines = holdingMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (!trimmed || trimmed.startsWith('#') || lower.startsWith('holding anatomy') || lower.startsWith('holding capacity') || lower.startsWith('hand slots') || lower.startsWith('dynamic overflow') || lower.startsWith('overflow hold drop chance') || lower.startsWith('items currently held:')) {
        continue;
      }
      linesToParse.push(trimmed);
    }
  }

  // 2. Also look for equipped weapons in [Equipped Gear & Armor], [CONTAINERS & CARRIED GEAR], or [INVENTORY & EQUIPMENT]
  const equippedMatch = content.match(
    /\[(?:Equipped Gear & Armor|EQUIPPED GEAR|WORN GEAR|INVENTORY & EQUIPMENT|CONTAINERS & CARRIED GEAR|CARRIED GEAR|EQUIPMENT)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i
  );
  if (equippedMatch && equippedMatch[1]) {
    const lines = equippedMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      // Check if this line is a weapon, shield, or tool with range/reach/handedness
      if (
        lower.includes('hand') ||
        lower.includes('range:') ||
        lower.includes('reach:') ||
        lower.includes('rifle') ||
        lower.includes('bow') ||
        lower.includes('sword') ||
        lower.includes('dagger') ||
        lower.includes('spear') ||
        lower.includes('crossbow') ||
        lower.includes('gun') ||
        lower.includes('wand') ||
        lower.includes('staff') ||
        lower.includes('pistol') ||
        lower.includes('shield')
      ) {
        if (!linesToParse.includes(trimmed)) {
          linesToParse.push(trimmed);
        }
      }
    }
  }

  for (const rawLine of linesToParse) {
    const namePart = extractCleanItemNameFromLine(rawLine);
    if (!namePart) continue;

    // Detect limb
    let limb = 'Hands';
    const limbMatch = rawLine.match(/\[(?:Main Hand|Off Hand|Both Hands(?:\s*\([^)]*\))?|Right Hand|Left Hand|Held in Jaws|Mouth|Talons|Beak|Tentacles)[^\]]*\]/i);
    if (limbMatch) {
      limb = limbMatch[0].replace(/^\[|\]$/g, '').trim();
    } else {
      const prefixLimb = rawLine.match(/(?:Main Hand|Off Hand|Both Hands(?:\s*\([^)]*\))?|Right Hand|Left Hand|Held in Jaws|Mouth|Talons|Beak|Tentacles)/i);
      if (prefixLimb) {
        limb = prefixLimb[0].trim();
      }
    }

    // Extract range if present in line
    let range: number | undefined;
    const rangeMatch = rawLine.match(/(?:range|reach|distance|radius)[:=\s]*(\d+(?:\.\d+)?)\s*(m|meters?|ft|feet|yards?)?/i);
    if (rangeMatch) {
      let val = parseFloat(rangeMatch[1]);
      const unit = (rangeMatch[2] || 'm').toLowerCase();
      if (unit.startsWith('ft') || unit.startsWith('feet')) {
        val = +(val * 0.3048).toFixed(1);
      } else if (unit.startsWith('yard')) {
        val = +(val * 0.9144).toFixed(1);
      }
      if (val > 0) range = val;
    } else {
      // Default heuristic range based on weapon type
      const lName = namePart.toLowerCase();
      if (/sniper|hunting rifle|rifle|carbine|musket/i.test(lName)) range = 80;
      else if (/longbow/i.test(lName)) range = 70;
      else if (/shortbow|bow/i.test(lName)) range = 50;
      else if (/crossbow/i.test(lName)) range = 40;
      else if (/blaster|pistol|revolver/i.test(lName)) range = 30;
      else if (/shotgun/i.test(lName)) range = 20;
      else if (/sling/i.test(lName)) range = 25;
      else if (/wand|magic staff|spell focus/i.test(lName)) range = 35;
      else if (/spear|halberd|pike|javelin/i.test(lName)) range = 4;
      else if (/greatsword|two-handed sword|polearm/i.test(lName)) range = 2.5;
      else if (/sword|dagger|knife|axe|mace|club/i.test(lName)) range = 2;
    }

    heldItems.push({
      name: namePart,
      cleanName: namePart,
      raw: rawLine,
      limb,
      range,
      isOverflow: /\b(overflow:\s*yes|overflow\s*hold|under\s*arm)\b/i.test(rawLine) && !/\b(overflow:\s*no|no\s*overflow|0\s*overflow)\b/i.test(rawLine)
    });
  }

  return heldItems;
}

/**
 * Extracts all items, gear, armor, containers, and attached equipment/vehicles
 * from a character sheet or item file so they can never be erroneously rendered as loose ground items
 * or cloned separate from the player.
 */
export function extractAllPossessionsFromCharacterSheet(content: string): string[] {
  if (!content) return [];
  const possessions = new Set<string>();

  const addPossession = (raw: string) => {
    if (!raw) return;
    const clean = raw.trim();
    if (clean.length < 2) return;
    const lower = clean.toLowerCase();
    if (/^(none|n\/a|empty|slots?|capacity|anatomy|player|user|null|undefined|free\s*hands?|empty\s*hands?|bare\s*hands?|open\s*hands?|unarmed|hands?\s*free)$/i.test(lower)) return;
    possessions.add(lower);

    // Also add unspaced variant (e.g. "wooden cart" -> "woodencart")
    const unspaced = lower.replace(/[\s_-]+/g, '');
    if (unspaced.length >= 2) possessions.add(unspaced);

    // Also add PascalCase split (e.g. "WoodenCart" -> "wooden cart")
    const pascalSplit = clean.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    if (pascalSplit !== lower && pascalSplit.length >= 2) {
      possessions.add(pascalSplit);
      const pascalSimple = pascalSplit.replace(/^(?:the|an?|heavy|light|wooden|iron|steel|leather|cloth|silver|gold|bronze|copper|sturdy|ancient|magic|magical|custom|reinforced|hardened)\s+/i, '').trim();
      if (pascalSimple.length >= 2) possessions.add(pascalSimple);
    }

    // Simplified without common adjectives (e.g. "Iron Sword" -> "Sword", "Wooden Cart" -> "Cart")
    const simple = lower.replace(/^(?:the|an?|heavy|light|wooden|iron|steel|leather|cloth|silver|gold|bronze|copper|sturdy|ancient|magic|magical|custom|reinforced|hardened)\s+/i, '').trim();
    if (simple && simple.length >= 2) {
      possessions.add(simple);
      const simpleUnspaced = simple.replace(/[\s_-]+/g, '');
      if (simpleUnspaced.length >= 2) possessions.add(simpleUnspaced);
    }

    // Core weapon / vehicle / equipment token if present
    const tokens = lower.split(/[\s_-]+/);
    const keyTokens = [
      'sword', 'dagger', 'bow', 'shortbow', 'longbow', 'rifle', 'crossbow', 'gun', 'pistol',
      'musket', 'shotgun', 'spear', 'staff', 'wand', 'shield', 'lantern', 'torch',
      'cart', 'wagon', 'mule', 'horse', 'steed', 'drone', 'trailer', 'sled', 'carriage', 'skateboard',
      'backpack', 'satchel', 'pouch', 'wallet', 'boots', 'cloak', 'armor', 'breastplate',
      'helmet', 'gloves', 'belt', 'quiver', 'cuirass', 'jacket', 'tunic', 'robe'
    ];
    for (const kt of keyTokens) {
      if (tokens.includes(kt)) {
        possessions.add(kt);
      }
    }
  };

  // Look across all inventory, equipment, holding, containers, and vehicle sections
  const sectionsToScan = [
    /\[(?:CURRENTLY HOLDING|HELD ITEMS|HOLDING|ITEMS CURRENTLY HELD|CURRENT HOLDINGS)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i,
    /\[(?:CONTAINERS & CARRIED GEAR|CONTAINERS & STORAGE|INVENTORY & EQUIPMENT|EQUIPMENT & GEAR|EQUIPPED GEAR & ARMOR|EQUIPPED GEAR|WORN GEAR|EQUIPMENT|INVENTORY|GEAR|CONTAINERS|STORAGE|CARRIED ITEMS|LOOSE CARRIED ITEMS|EQUIPPED CONTAINERS|ITEMS|BELONGINGS)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i,
    /\[(?:MOUNT, VEHICLE & TRANSPORT STATUS|VEHICLES & MOUNTS|ATTACHED EQUIPMENT|ATTACHED VEHICLES|TRANSPORT|MOUNTS|VEHICLES|CARTS & WAGONS|ATTACHMENTS)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i,
    /\[(?:OWNED \/ STORED ITEMS(?: \(NOT ON PERSON\))?|STORED ITEMS)\]([\s\S]*?)(?=\n\s*\[[A-Z0-9 &/_()-]+\]|$)/i,
  ];

  for (const regex of sectionsToScan) {
    const match = content.match(regex);
    if (match && match[1]) {
      const lines = match[1].split(/\r?\n/);
      for (const line of lines) {
        // Direct bracket link in line: e.g. "- Mount / Vehicle Link: [Wooden Cart]"
        const linkMatches = line.matchAll(/\[([^\]]+)\]/g);
        for (const lm of linkMatches) {
          const inner = lm[1].trim();
          if (inner && !inner.toLowerCase().startsWith('location:') && !inner.toLowerCase().startsWith('container:') && inner.length >= 2) {
            addPossession(inner);
          }
        }

        const namePart = extractCleanItemNameFromLine(line);
        if (namePart) {
          addPossession(namePart);
        }
      }
    }
  }

  // Check if content itself is an item / vehicle / equipment file schema
  const isItemOrVehicleFile =
    /\[(?:IDENTIFICATION|TECHNICAL RULES|SPECIAL PROPERTIES|CONDITION & ACTIVE EFFECTS)\]/i.test(content) ||
    /category\s*[:=]\s*(?:item|equipment|gear|weapon|vehicle|mount|container|armor|clothing|tool|transport)/i.test(content);

  if (isItemOrVehicleFile) {
    const nameMatch = content.match(/[-*•]?\s*Name\s*[:=]\s*([^\n\r]+)/i);
    if (nameMatch && nameMatch[1]) {
      addPossession(nameMatch[1].replace(/\[[^\]]+\]/g, '').trim());
    }
  }

  // Also check for explicit attachment / hitching lines across the entire document
  // e.g. "- Attached: [Wooden Cart]", "- Hitched to: Pack Mule", "- Mount / Vehicle Link: [Chestnut Warhorse]"
  const linkLines = content.matchAll(/[-*•]?\s*(?:attached|equipped|mounted|hitched|towed|carried|held|riding|link|wearing)\s*(?:to|by|with|on)?\s*[:=]\s*([^\n\r]+)/gi);
  for (const ll of linkLines) {
    const val = ll[1].replace(/\[([^\]]+)\]/g, '$1').trim();
    if (val && val.length >= 2 && !val.toLowerCase().startsWith('location:') && !val.toLowerCase().startsWith('container:')) {
      addPossession(val);
    }
  }

  return Array.from(possessions);
}

/**
 * Checks if two item names refer to the same item/weapon (e.g. "Hunting Rifle" vs "Rifle", "Wooden Cart" vs "Cart", "WoodenCart" vs "Wooden Cart").
 */
export function areItemNamesEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Normalize PascalCase (e.g. "WoodenCart" -> "Wooden Cart")
  const aSpaced = String(a).replace(/([a-z])([A-Z])/g, '$1 $2');
  const bSpaced = String(b).replace(/([a-z])([A-Z])/g, '$1 $2');

  const normA = aSpaced.toLowerCase().replace(/[-_]npc$/i, '').replace(/^[-*•>\s\d.]+/, '').replace(/\[[^\]]+\]/g, '').replace(/[()]/g, '').trim();
  const normB = bSpaced.toLowerCase().replace(/[-_]npc$/i, '').replace(/^[-*•>\s\d.]+/, '').replace(/\[[^\]]+\]/g, '').replace(/[()]/g, '').trim();

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Unspaced equivalence: "woodencart" === "woodencart"
  const unspacedA = normA.replace(/[\s_-]+/g, '');
  const unspacedB = normB.replace(/[\s_-]+/g, '');
  if (unspacedA === unspacedB) return true;
  if (unspacedA.includes(unspacedB) || unspacedB.includes(unspacedA)) return true;

  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Compare core tokens
  const tokensA = normA.split(/[\s_-]+/).filter(t => t.length > 2);
  const tokensB = normB.split(/[\s_-]+/).filter(t => t.length > 2);

  const sharedCategories = [
    'rifle', 'bow', 'shortbow', 'longbow', 'crossbow', 'gun', 'pistol', 'musket', 'shotgun',
    'spear', 'sword', 'dagger', 'wand', 'staff', 'blade', 'shield', 'lantern', 'torch',
    'cart', 'wagon', 'trailer', 'sled', 'carriage', 'mule', 'horse', 'steed', 'drone', 'skateboard',
    'backpack', 'satchel', 'pouch', 'wallet', 'cuirass', 'armor', 'boots', 'cloak', 'helmet'
  ];
  for (const cat of sharedCategories) {
    if (tokensA.includes(cat) && tokensB.includes(cat)) {
      return true;
    }
  }

  // Common token match
  const common = tokensA.filter(t => tokensB.includes(t));
  return common.length >= 1 && (tokensA.length === 1 || tokensB.length === 1 || common.length >= 2);
}

/**
 * Reconciles held items on map pages.
 * Ensures items/weapons held or equipped by players and NPCs are attached to their holder
 * rather than erroneously placed far away on the map at their weapon range or random coordinates.
 */
export function reconcileHeldItemsOnMap(
  pages: any[],
  fileSystem: {
    list: () => string[];
    read: (f: string) => string | null;
  },
  playerRegistry?: any[]
): { attachedCount: number; fixedFarAwayCount: number } {
  if (!pages || !Array.isArray(pages) || !fileSystem) {
    return { attachedCount: 0, fixedFarAwayCount: 0 };
  }

  let attachedCount = 0;
  let fixedFarAwayCount = 0;

  const allFiles = typeof fileSystem.list === 'function' ? fileSystem.list() : [];

  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;

    interface ActiveHolder {
      id: string;
      charName: string;
      username: string;
      emailPrefix: string;
      aliases: Set<string>;
      x: number;
      y: number;
      heldItems: HeldItemInfo[];
      allPossessions: string[];
      isPlayer: boolean;
    }
    const activeHolders: ActiveHolder[] = [];

    // 1. Gather all players with their held items and coordinates
    if (Array.isArray(page.players)) {
      const regList = (playerRegistry && playerRegistry.length > 0)
        ? playerRegistry
        : buildPlayerRegistry(allFiles, fileSystem);

      for (const pl of page.players) {
        if (!pl || typeof pl !== 'object') continue;
        const px = Number(pl.x) || 0;
        const py = Number(pl.y) || 0;

        let charName = String(pl.characterName || pl.charName || '').trim();
        const username = String(pl.username || '').trim();

        const res = resolvePlayerIdentity(pl, regList);
        if (res.characterName && !charName) charName = res.characterName;

        // Resolve file
        let content: string | null = null;
        const matchedReg = regList.find(r =>
          r.username.toLowerCase() === res.canonicalKey ||
          r.charName.toLowerCase() === res.canonicalKey ||
          r.aliases.has(res.canonicalKey)
        );
        if (matchedReg) {
          content = fileSystem.read(matchedReg.filename);
        }
        if (!content && charName && username) {
          content = fileSystem.read(`${charName}-${username}.txt`);
        }
        if (!content && username) {
          content = fileSystem.read(`${username}.txt`);
        }
        if (!content && charName) {
          content = fileSystem.read(`${charName}.txt`);
        }
        if (!content) {
          const matchF = allFiles.find(f => {
            const fLow = f.toLowerCase();
            return (username && fLow.includes(username.toLowerCase())) ||
                   (charName && fLow.includes(charName.toLowerCase()));
          });
          if (matchF) content = fileSystem.read(matchF);
        }
        if (!content && regList.length === 1) {
          content = fileSystem.read(regList[0].filename);
          charName = regList[0].charName;
        }

        const held = content ? extractHeldItemsFromCharacterSheet(content) : [];
        const allPossessions = content ? extractAllPossessionsFromCharacterSheet(content) : [];
        if (held.length > 0) {
          pl.heldItems = held;
          pl.weaponRange = Math.max(...held.map(h => h.range || 0), 0);
        } else if (Array.isArray(pl.heldItems) && pl.heldItems.length > 0) {
          // pl already has heldItems attached
        }
        pl.allPossessions = allPossessions;

        const aliases = new Set<string>();
        if (matchedReg) {
          matchedReg.aliases.forEach(a => aliases.add(a.toLowerCase()));
        }
        if (username) aliases.add(username.toLowerCase());
        if (charName) aliases.add(charName.toLowerCase());
        const emailPrefix = username.includes('@') ? username.split('@')[0].toLowerCase() : username.toLowerCase();
        if (emailPrefix) aliases.add(emailPrefix);

        activeHolders.push({
          id: username.toLowerCase() || charName.toLowerCase() || res.canonicalKey,
          charName: charName || res.characterName || username,
          username,
          emailPrefix,
          aliases,
          x: px,
          y: py,
          heldItems: pl.heldItems || held,
          allPossessions,
          isPlayer: true
        });
      }
    }

    // 2. Gather all NPCs with their held items and coordinates
    if (Array.isArray(page.npcs)) {
      for (const npc of page.npcs) {
        if (!npc || typeof npc !== 'object') continue;
        const nx = Number(npc.x) || 0;
        const ny = Number(npc.y) || 0;
        const nName = String(npc.name || npc.charName || '').trim();

        let content: string | null = null;
        if (nName) {
          content = fileSystem.read(`${nName}.txt`) ||
                    fileSystem.read(`${nName}-npc.txt`) ||
                    fileSystem.read(`${nName.replace(/-npc$/i, '')}.txt`);
        }
        if (!content && nName) {
          const cleanN = nName.replace(/[-_]npc$/i, '').toLowerCase();
          const matchF = allFiles.find(f => f.toLowerCase().includes(cleanN));
          if (matchF) content = fileSystem.read(matchF);
        }

        const held = content ? extractHeldItemsFromCharacterSheet(content) : [];
        const allPossessions = content ? extractAllPossessionsFromCharacterSheet(content) : [];
        if (held.length > 0) {
          npc.heldItems = held;
          npc.weaponRange = Math.max(...held.map(h => h.range || 0), 0);
        }
        npc.allPossessions = allPossessions;

        const aliases = new Set<string>();
        aliases.add(nName.toLowerCase());
        aliases.add(nName.replace(/[-_]npc$/i, '').toLowerCase());

        activeHolders.push({
          id: nName.toLowerCase(),
          charName: nName.replace(/[-_]npc$/i, ''),
          username: nName,
          emailPrefix: '',
          aliases,
          x: nx,
          y: ny,
          heldItems: npc.heldItems || held,
          allPossessions,
          isPlayer: false
        });
      }
    }

    // Helper to match an item against active holders
    const findHolderForItem = (itemName: string, itemObj?: any): { holder: ActiveHolder; heldItem: HeldItemInfo } | null => {
      const cleanItem = String(itemName || '').trim().toLowerCase();
      if (!cleanItem) return null;

      // Extract explicit attach target from item properties or description
      let explicitAttach = String(itemObj?.attachedTo || itemObj?.holder || itemObj?.equippedBy || itemObj?.owner || itemObj?.hitchedTo || itemObj?.towedBy || itemObj?.carriedBy || '').trim().toLowerCase();
      if (!explicitAttach && itemObj) {
        const descText = String(itemObj.description || itemObj.notes || itemObj.status || '').toLowerCase();
        const attachMatch = descText.match(/(?:attached|equipped|hitched|towed|held|carried)\s*(?:to|by)?\s*[:=\s]+([a-zA-Z0-9_.-]+)/i);
        if (attachMatch && attachMatch[1]) {
          explicitAttach = attachMatch[1].trim().toLowerCase();
        }
      }

      // Check item's file content if available in fileSystem
      if (!explicitAttach) {
        const itemFile = fileSystem.read(`${itemName}.txt`) || fileSystem.read(`${cleanItem}.txt`);
        if (itemFile) {
          const fileAttachMatch = itemFile.match(/(?:attached|equipped|hitched|towed|held|carried)\s*(?:to|by)?\s*[:=\s]+([a-zA-Z0-9_.-]+)/i);
          if (fileAttachMatch && fileAttachMatch[1]) {
            explicitAttach = fileAttachMatch[1].trim().toLowerCase();
          }
        }
      }

      if (explicitAttach) {
        const found = activeHolders.find(h =>
          h.id === explicitAttach ||
          h.username.toLowerCase() === explicitAttach ||
          h.charName.toLowerCase() === explicitAttach ||
          h.emailPrefix === explicitAttach ||
          h.aliases.has(explicitAttach) ||
          explicitAttach.includes(h.charName.toLowerCase()) ||
          explicitAttach.includes(h.username.toLowerCase()) ||
          (h.isPlayer && (explicitAttach === 'player' || explicitAttach === 'user'))
        );
        if (found) {
          const matchedHeld = found.heldItems.find(hi =>
            cleanItem.includes(hi.cleanName.toLowerCase()) ||
            hi.cleanName.toLowerCase().includes(cleanItem)
          ) || found.heldItems[0] || { name: itemName, cleanName: itemName };
          return { holder: found, heldItem: matchedHeld };
        }
      }

      // Check each holder's held items
      for (const holder of activeHolders) {
        for (const hi of holder.heldItems) {
          const hiNorm = hi.cleanName.toLowerCase();
          if (
            cleanItem === hiNorm ||
            cleanItem.includes(hiNorm) ||
            hiNorm.includes(cleanItem) ||
            areItemNamesEquivalent(cleanItem, hiNorm)
          ) {
            return { holder, heldItem: hi };
          }
        }
      }

      // Check each holder's equipped gear, containers, vehicles/mounts, and all possessions
      for (const holder of activeHolders) {
        for (const pos of holder.allPossessions) {
          if (
            cleanItem === pos ||
            cleanItem.includes(pos) ||
            pos.includes(cleanItem) ||
            areItemNamesEquivalent(cleanItem, pos)
          ) {
            const matchedHeld = holder.heldItems.find(hi =>
              cleanItem.includes(hi.cleanName.toLowerCase()) ||
              hi.cleanName.toLowerCase().includes(cleanItem)
            ) || { name: itemName, cleanName: itemName };
            return { holder, heldItem: matchedHeld };
          }
        }
      }

      return null;
    };

    // 3. Reconcile page.items: snap to holder and remove from loose ground items so it's not cloned separate from player
    if (Array.isArray(page.items)) {
      page.items = page.items.filter((item: any) => {
        if (!item || typeof item !== 'object') return false;
        const match = findHolderForItem(item.name, item);
        const itemNameLower = String(item.name || '').toLowerCase();
        const isPossessed = activeHolders.some(h =>
          h.heldItems.some(hi => areItemNamesEquivalent(itemNameLower, hi.cleanName)) ||
          h.allPossessions.some(p => areItemNamesEquivalent(itemNameLower, p))
        );

        if (match || isPossessed || item.isHeld || item.attachedTo || (item.holder && item.holder !== 'ground')) {
          if (match) {
            const { holder, heldItem } = match;
            const oldX = Number(item.x) || 0;
            const oldY = Number(item.y) || 0;
            const dist = Math.sqrt((oldX - holder.x) ** 2 + (oldY - holder.y) ** 2);

            if (dist > 1.0) {
              fixedFarAwayCount++;
              console.log(`[Map Item Engine] Corrected held/attached item "${item.name}" placed far away (${dist.toFixed(1)}m) to holder ${holder.charName} at (${holder.x}, ${holder.y})`);
            }

            item.x = holder.x;
            item.y = holder.y;
            item.attachedTo = holder.charName || holder.username;
            item.holder = holder.username || holder.charName;
            item.isHeld = true;
            if (heldItem.range && !item.range) {
              item.range = heldItem.range;
            }
            attachedCount++;
          }
          // An item held, equipped, or attached to a character is on their person, NOT loose on the ground!
          // Remove from loose page.items so it is not cloned or rendered as a separate loose ground item!
          return false;
        }
        return true;
      });
    }

    // 4. Reconcile page.areas: catch held items, weapons, vehicles, and range areas
    if (Array.isArray(page.areas)) {
      page.areas = page.areas.filter((area: any) => {
        if (!area || typeof area !== 'object') return false;
        const aType = String(area.type || '').toLowerCase();
        const aName = String(area.name || '').toLowerCase();

        // Check if area is an item, weapon, equipment, vehicle, transport, range indicator, or explicitly attached/held
        const shouldCheck =
          aType === 'item' ||
          aType === 'weapon' ||
          aType === 'equipment' ||
          aType === 'vehicle' ||
          aType === 'transport' ||
          aType === 'mount' ||
          aType === 'loot' ||
          aType === 'treasure' ||
          aType === 'range' ||
          aType === 'weapon_range' ||
          aName.includes('range') ||
          aName.includes('reach') ||
          area.attachedTo ||
          area.isHeld ||
          area.range !== undefined ||
          activeHolders.some(h =>
            h.heldItems.some(hi => areItemNamesEquivalent(aName, hi.cleanName)) ||
            h.allPossessions.some(pos => areItemNamesEquivalent(aName, pos))
          );

        if (shouldCheck) {
          const match = findHolderForItem(area.name, area) || (
            (aName.includes('range') || aType === 'range' || aType === 'weapon_range') && activeHolders.length > 0
              ? { holder: activeHolders[0], heldItem: activeHolders[0].heldItems.find(h => h.range) || activeHolders[0].heldItems[0] || { name: area.name, cleanName: area.name, range: area.radius || area.range } }
              : null
          );

          if (match || area.attachedTo || area.isHeld) {
            if (match) {
              const { holder, heldItem } = match;
              const ax = Number(area.x ?? area.cx) || 0;
              const ay = Number(area.y ?? area.cy) || 0;
              const dist = Math.sqrt((ax - holder.x) ** 2 + (ay - holder.y) ** 2);

              if (dist > 1.0) {
                fixedFarAwayCount++;
                console.log(`[Map Item Engine] Corrected held area "${area.name}" placed far away (${dist.toFixed(1)}m) to holder ${holder.charName} at (${holder.x}, ${holder.y})`);
              }

              if (area.cx !== undefined) area.cx = holder.x;
              if (area.cy !== undefined) area.cy = holder.y;
              area.x = holder.x;
              area.y = holder.y;
              area.attachedTo = holder.charName || holder.username;
              area.holder = holder.username || holder.charName;
              area.isHeld = true;
              if (heldItem.range && !area.range) {
                area.range = heldItem.range;
              }
              attachedCount++;
            }

            // Remove any area that represents an item, weapon, gear, or vehicle in a character's possession
            return false;
          }
        }
        return true;
      });
    }

    // 4.5. Reconcile page.landmarks: purge any possessed/attached items mistakenly registered as landmarks
    if (Array.isArray(page.landmarks)) {
      page.landmarks = page.landmarks.filter((lm: any) => {
        if (!lm || typeof lm !== 'object') return false;
        const match = findHolderForItem(lm.name, lm);
        const lmNameLower = String(lm.name || '').toLowerCase();
        const isPossessed = activeHolders.some(h =>
          h.heldItems.some(hi => areItemNamesEquivalent(lmNameLower, hi.cleanName)) ||
          h.allPossessions.some(p => areItemNamesEquivalent(lmNameLower, p))
        );
        if (match || isPossessed || lm.attachedTo) {
          console.log(`[Map Engine] Purged possessed item "${lm.name}" mistakenly listed as landmark`);
          return false;
        }
        return true;
      });
    }

    // 5. Reconcile page.npcs: purge any equipped gear, held items, or attached vehicles/mounts
    if (Array.isArray(page.npcs)) {
      page.npcs = page.npcs.filter((npc: any) => {
        if (!npc || typeof npc !== 'object') return false;
        const nName = String(npc.name || npc.charName || '').trim();
        const nNameLower = nName.toLowerCase();
        const cleanNName = nNameLower.replace(/[-_]npc$/i, '').trim();

        // Check if this NPC is actually an equipped or held gear/item/vehicle of any player/NPC
        const isPossessed = activeHolders.some(h =>
          h.heldItems.some(hi => areItemNamesEquivalent(cleanNName, hi.cleanName)) ||
          h.allPossessions.some(p => areItemNamesEquivalent(cleanNName, p))
        );
        const match = findHolderForItem(npc.name, npc);

        // If an item, weapon, gear, cart, vehicle, or mount is attached to or held by a character,
        // it is WITH that character and MUST NOT exist as a separate NPC clone!
        if (isPossessed || match || npc.attachedTo || (npc.holder && npc.holder !== 'ground') || npc.isHeld) {
          console.log(`[Map Engine] Purged attached/held entity "${nName}" from loose NPCs`);
          return false;
        }

        return true;
      });
    }

    // 6. Reconcile page.creatures: purge any possessed/attached creatures or mounts
    if (Array.isArray(page.creatures)) {
      page.creatures = page.creatures.filter((c: any) => {
        if (!c || typeof c !== 'object') return false;
        const cName = String(c.name || '').trim().toLowerCase().replace(/[-_]npc$/i, '');
        const isPossessed = activeHolders.some(h =>
          h.heldItems.some(hi => areItemNamesEquivalent(cName, hi.cleanName)) ||
          h.allPossessions.some(p => areItemNamesEquivalent(cName, p))
        );
        const match = findHolderForItem(c.name, c);
        if (isPossessed || match || c.attachedTo || c.isHeld) {
          return false;
        }
        return true;
      });
    }

    // 7. Reconcile page.entities: purge any possessed/attached entities
    if (Array.isArray(page.entities)) {
      page.entities = page.entities.filter((e: any) => {
        if (!e || typeof e !== 'object') return false;
        const eName = String(e.name || '').trim().toLowerCase().replace(/[-_]npc$/i, '');
        const isPossessed = activeHolders.some(h =>
          h.heldItems.some(hi => areItemNamesEquivalent(eName, hi.cleanName)) ||
          h.allPossessions.some(p => areItemNamesEquivalent(eName, p))
        );
        const match = findHolderForItem(e.name, e);
        if (isPossessed || match || e.attachedTo || e.isHeld) {
          return false;
        }
        return true;
      });
    }
  }

  return { attachedCount, fixedFarAwayCount };
}
