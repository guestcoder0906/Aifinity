/**
 * Unified Visibility & Secret Engine
 * Handles multiplayer secret masking and visibility rules:
 * - hide:besides(Player1, Player2)[secret]: Hidden for all players EXCEPT listed players
 * - hide:except(Player1, Player2)[secret]: Synonym for hide:besides
 * - target(Player1, Player2)[secret]: Visible only to targeted players (hidden for all others)
 * - hide:for(Player1, Player2)[secret]: Hidden specifically for listed players
 * - hide[secret] / hide:all[secret]: Hidden for ALL players (known only to NPC / AI currently)
 */

export interface SecretLocationResolution {
  isSecret: boolean;
  isVisibleToPlayer: boolean;
  cleanLocation: string;
  displayFormatted: string;
  allowedPlayers?: string[];
  hiddenPlayers?: string[];
  visibilityType: 'public' | 'besides' | 'target' | 'for' | 'all_players_hidden';
}

/**
 * Normalizes username for consistent case-insensitive comparison
 */
export function normalizeUser(username?: string): string {
  return (username || '').trim().toLowerCase();
}

/**
 * Evaluates whether a location/entity/item represents something the character/player should naturally know
 * based on context (such as their home, house, residence, personal dwelling, bedroom, apartment, cottage,
 * cabin, quarters, homestead, estate, workshop, personal storage, or personal belongings kept there),
 * unless context explicitly dictates otherwise (e.g. amnesia, memory loss, forgotten memories,
 * stolen memories, brainwashing, or unknown secret).
 */
export function isCharacterKnownContext(text?: string, currentUsername?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // If context explicitly dictates memory loss, oblivion, amnesia, or unknown to character:
  if (
    lower.includes('amnesia') ||
    lower.includes('forgotten') ||
    lower.includes('memory loss') ||
    lower.includes('memory wipe') ||
    lower.includes('stolen memory') ||
    lower.includes('stolen memories') ||
    lower.includes('brainwash') ||
    lower.includes('unknown to player') ||
    lower.includes('unknown to character') ||
    lower.includes('no memory of') ||
    lower.includes('unfamiliar to')
  ) {
    return false;
  }

  // Check if it represents the player's home, familiar personal dwelling, or personal storage/base
  const isHomeOrDwelling =
    /\b(?:home|house|residence|cottage|apartment|cabin|quarters|dwelling|homestead|estate|manor|bedroom|workshop|smithy|shack|farm|base|safehouse|bunk|inn\s*room|personal\s*chest|personal\s*storage|closet|wardrobe|locker|childhood\s*home|hometown|birthplace)\b/i.test(lower);

  if (isHomeOrDwelling) {
    return true;
  }

  // Check if text refers to "my home", "player's home", "character's home", etc.
  if (/\b(?:my\s+home|player(?:'s)?\s+home|character(?:'s)?\s+home|personal\s+home)\b/i.test(lower)) {
    return true;
  }

  // Check if text directly references the current user or character handle
  if (currentUsername) {
    const userClean = normalizeUser(currentUsername);
    if (userClean && userClean.length >= 3 && lower.includes(userClean)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a player matches any target in a comma-separated list
 */
export function userMatchesList(targetListStr: string, currentUsername?: string): boolean {
  if (!currentUsername) return false;
  const curr = normalizeUser(currentUsername);
  const targets = targetListStr.split(',').map(t => normalizeUser(t));
  return targets.some(t => t === curr || curr.endsWith(`-${t}`) || t.endsWith(`-${curr}`));
}

/**
 * Parses and formats secret location strings (e.g. for stored items, caches, loot)
 * Example input: "hide:besides(Paul-Mep, Ace-stega)[Tucked inside a rusted locker at downtown bus terminal #42]"
 */
export function parseSecretLocation(
  rawLocation?: string,
  currentUsername?: string,
  debugMode: boolean = false
): SecretLocationResolution {
  if (!rawLocation) {
    return {
      isSecret: false,
      isVisibleToPlayer: true,
      cleanLocation: '',
      displayFormatted: '',
      visibilityType: 'public'
    };
  }

  let trimmed = rawLocation.trim();
  // Strip any leaked pipes or metadata remnants
  trimmed = trimmed.replace(/\|.*$/i, '').trim();
  // Clean repeated phrases
  trimmed = trimmed.replace(/([A-Za-z0-9#_ \-\.]{8,}?)(?:\s*(?:\|\s*)?\1){1,}/g, '$1').trim();
  trimmed = trimmed.replace(/(\[[^\]]{3,}\])(?:\s*\1)+/gi, '$1').trim();

  // Clean location/secret prefix if wrapped in e.g. "[Location: hide[...]]" or "Location: hide[...]"
  trimmed = trimmed.replace(/^[\[\s]*(?:location|secret)[:=\s]+/i, '').trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && !/^(?:hide|target)\b/i.test(trimmed)) {
    const innerTrimmed = trimmed.slice(1, -1).trim();
    if (/^(?:hide|target)\b/i.test(innerTrimmed) || !innerTrimmed.includes('[')) {
      trimmed = innerTrimmed;
    }
  }
  // Trim dangling outer quotes
  trimmed = trimmed.replace(/^["'`]+|["'`]+$/g, '').trim();

  // Pattern 1: hide:besides(Player1, Player2)[Secret location] or hide:except(...)
  const besidesMatch = trimmed.match(/(?:secret[:=\s]*)?hide:(?:besides|except)\(([^)]*)\)\[([^\]]*)\]/i);
  if (besidesMatch) {
    const targetsStr = besidesMatch[1].trim();
    const secretContent = besidesMatch[2].trim();
    const isTargeted = userMatchesList(targetsStr, currentUsername);
    const isVisible = debugMode || isTargeted;

    const allowed = targetsStr.split(',').map(t => t.trim());
    const display = isVisible
      ? (debugMode && !isTargeted
          ? `Secret (Visible to: ${targetsStr}): ${secretContent}`
          : `Secret: ${secretContent}`)
      : `Secret: [Hidden from your character]`;

    return {
      isSecret: true,
      isVisibleToPlayer: isVisible,
      cleanLocation: isVisible ? secretContent : '[Hidden from your character]',
      displayFormatted: display,
      allowedPlayers: allowed,
      visibilityType: 'besides'
    };
  }

  // Pattern 2: target(Player1, Player2)[Secret location]
  const targetMatch = trimmed.match(/(?:secret[:=\s]*)?target\(([^)]*)\)\[([^\]]*)\]/i);
  if (targetMatch) {
    const targetsStr = targetMatch[1].trim();
    const secretContent = targetMatch[2].trim();
    const isTargeted = userMatchesList(targetsStr, currentUsername);
    const isVisible = debugMode || isTargeted;

    const allowed = targetsStr.split(',').map(t => t.trim());
    const display = isVisible
      ? (debugMode && !isTargeted
          ? `Secret (Target: ${targetsStr}): ${secretContent}`
          : `Secret: ${secretContent}`)
      : `Secret: [Hidden from your character]`;

    return {
      isSecret: true,
      isVisibleToPlayer: isVisible,
      cleanLocation: isVisible ? secretContent : '[Hidden from your character]',
      displayFormatted: display,
      allowedPlayers: allowed,
      visibilityType: 'target'
    };
  }

  // Pattern 3: hide:for(Player1, Player2)[Secret location]
  const hideForMatch = trimmed.match(/(?:secret[:=\s]*)?hide:for\(([^)]*)\)\[([^\]]*)\]/i);
  if (hideForMatch) {
    const targetsStr = hideForMatch[1].trim();
    const secretContent = hideForMatch[2].trim();
    const isSpecificallyHidden = userMatchesList(targetsStr, currentUsername);
    const isVisible = debugMode || !isSpecificallyHidden;

    const hiddenList = targetsStr.split(',').map(t => t.trim());
    const display = isVisible
      ? (debugMode && isSpecificallyHidden
          ? `Secret (Hidden for: ${targetsStr}): ${secretContent}`
          : `Secret: ${secretContent}`)
      : `Secret: [Hidden from your character]`;

    return {
      isSecret: true,
      isVisibleToPlayer: isVisible,
      cleanLocation: isVisible ? secretContent : '[Hidden from your character]',
      displayFormatted: display,
      hiddenPlayers: hiddenList,
      visibilityType: 'for'
    };
  }

  // Pattern 4: hide[Secret location] or hide:all[Secret location] (Hidden for all players; known only to NPC & AI)
  const hideAllMatch = trimmed.match(/(?:secret[:=\s]*)?hide(?::all)?\[([^\]]*)\]/i);
  if (hideAllMatch) {
    const secretContent = hideAllMatch[1].trim();
    // Context check: Things the character/player should naturally know based on context
    // (such as their home, residence, quarters, cottage, personal dwelling) are NOT hidden unless context dictates otherwise
    const isKnown = isCharacterKnownContext(secretContent, currentUsername);
    const isVisible = debugMode || isKnown;
    const display = isVisible
      ? (debugMode && !isKnown
          ? `Secret (AI/NPC Only): ${secretContent}`
          : (isKnown ? secretContent : `Secret: ${secretContent}`))
      : `Secret: [Hidden location (Unknown to players)]`;

    return {
      isSecret: !isKnown,
      isVisibleToPlayer: isVisible,
      cleanLocation: isVisible ? secretContent : '[Hidden location]',
      displayFormatted: display,
      visibilityType: isKnown ? 'public' : 'all_players_hidden'
    };
  }

  // Pattern 5: Unclosed hide[... or hide: [tag]
  const hideUnclosedMatch = trimmed.match(/(?:secret[:=\s]*)?hide(?::all)?\s*\[\s*([^\]]+)/i);
  if (hideUnclosedMatch) {
    const secretContent = hideUnclosedMatch[1].replace(/\]+$/, '').trim();
    const isKnown = isCharacterKnownContext(secretContent, currentUsername);
    const isVisible = debugMode || isKnown;
    const display = isVisible
      ? (debugMode && !isKnown
          ? `Secret (AI/NPC Only): ${secretContent}`
          : (isKnown ? secretContent : `Secret: ${secretContent}`))
      : `Secret: [Hidden location (Unknown to players)]`;

    return {
      isSecret: !isKnown,
      isVisibleToPlayer: isVisible,
      cleanLocation: isVisible ? secretContent : '[Hidden location]',
      displayFormatted: display,
      visibilityType: isKnown ? 'public' : 'all_players_hidden'
    };
  }

  // Check if string is simply marked as secret
  const isGenericSecret = trimmed.toLowerCase().startsWith('secret:');
  let clean = trimmed.replace(/^secret[:=\s]+/i, '').trim();
  // Strip dangling outer brackets if unmatched
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1).trim();
  } else if (clean.endsWith(']') && !clean.includes('[')) {
    clean = clean.slice(0, -1).trim();
  }

  return {
    isSecret: isGenericSecret,
    isVisibleToPlayer: true,
    cleanLocation: clean,
    displayFormatted: isGenericSecret ? `Secret: ${clean}` : clean,
    visibilityType: 'public'
  };
}

/**
 * Transforms narrative text, sidebar text, or markdown replacing secret tags:
 * - hide:besides(Players)[content]
 * - target(Players)[content]
 * - hide:for(Players)[content]
 * - hide[content]
 */
export function formatVisibilityMarkup(
  content: string,
  currentUsername: string,
  debugMode: boolean = false
): string {
  if (!content) return '';
  let formatted = content;

  // 1. hide:besides(...) or hide:except(...)
  formatted = formatted.replace(/hide:(?:besides|except)\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    const isAllowed = userMatchesList(targets, currentUsername);
    if (debugMode || isAllowed) {
      return `<span class="text-emerald-300 bg-emerald-950/40 px-1 border border-dashed border-emerald-700/80 rounded" title="Secret (Visible to: ${targets})">${innerText}</span>`;
    }
    return '<span class="text-gray-600 italic font-mono">&#91;hidden&#93;</span>';
  });

  // 2. target(...)
  formatted = formatted.replace(/target\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    const isAllowed = userMatchesList(targets, currentUsername);
    if (debugMode || isAllowed) {
      return `<span class="text-purple-300 bg-purple-900/20 px-1 border border-dashed border-purple-800 rounded" title="Target: ${targets}">${innerText}</span>`;
    }
    return ''; // Target is completely omitted for non-targets
  });

  // 3. hide:for(...)
  formatted = formatted.replace(/hide:for\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    const isHiddenForUser = userMatchesList(targets, currentUsername);
    if (!debugMode && isHiddenForUser) {
      return '<span class="text-gray-600 italic font-mono">&#91;hidden&#93;</span>';
    }
    if (debugMode && isHiddenForUser) {
      return `<span class="text-amber-300 bg-amber-950/40 px-1 border border-dashed border-amber-700/80 rounded" title="Hidden for: ${targets}">${innerText}</span>`;
    }
    return innerText;
  });

  // 4. hide[...] or hide:all[...]
  formatted = formatted.replace(/hide(?::all)?\[([^\]]*)\]/gi, (match, innerText) => {
    if (isCharacterKnownContext(innerText, currentUsername)) {
      return innerText;
    }
    if (debugMode) {
      return `<span class="text-yellow-300 bg-yellow-900/20 px-1 border border-dashed border-yellow-800 rounded" title="AI/NPC Secret (Hidden from all players)">${innerText}</span>`;
    }
    return '<span class="text-gray-600 italic font-mono">&#91;hidden&#93;</span>';
  });

  return formatted;
}

/**
 * Evaluates whether a file should be visible to the current player
 */
export function isFileVisible(
  filename: string,
  currentUsername: string,
  debugMode: boolean = false,
  isHost: boolean = false
): boolean {
  if (debugMode || isHost) return true;

  // Check if filename has hide[] or hide:all[]
  if (/hide(?::all)?\[/i.test(filename)) {
    // If the file represents the character/player's known home, dwelling, or possessions, don't hide it
    const innerMatch = filename.match(/hide(?::all)?\[([^\]]+)\]/i);
    if ((innerMatch && isCharacterKnownContext(innerMatch[1], currentUsername)) || isCharacterKnownContext(filename, currentUsername)) {
      return true;
    }
    return false;
  }

  // Check if filename has hide:besides(...) or hide:except(...)
  const hideBesidesMatch = filename.match(/hide:(?:besides|except)\((.*?)\)/i);
  if (hideBesidesMatch) {
    if (!userMatchesList(hideBesidesMatch[1], currentUsername)) {
      return false;
    }
  }

  // Check if filename has hide:for(...)
  const hideForMatch = filename.match(/hide:for\((.*?)\)/i);
  if (hideForMatch) {
    if (userMatchesList(hideForMatch[1], currentUsername)) {
      return false;
    }
  }

  // Check if filename has target()
  const targetMatch = filename.match(/target\((.*?)\)/i);
  if (targetMatch) {
    if (!userMatchesList(targetMatch[1], currentUsername)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves an entity/area name for map display taking hide and target tags into account
 */
export function resolveMapEntityName(
  rawName: string,
  currentUsername?: string,
  debugMode: boolean = false
): { displayName: string; isHidden: boolean; isSecret: boolean } {
  if (!rawName) return { displayName: 'Unknown Area', isHidden: true, isSecret: false };

  let processed = rawName;
  let isSecret = false;

  // 1. hide:besides(...) or hide:except(...)
  processed = processed.replace(/hide:(?:besides|except)\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    isSecret = true;
    const isAllowed = userMatchesList(targets, currentUsername);
    if (debugMode || isAllowed) {
      return debugMode && !isAllowed ? `${innerText} (Secret: ${targets})` : innerText;
    }
    return '__HIDDEN_ENTITY__';
  });

  // 2. target(...)
  processed = processed.replace(/target\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    isSecret = true;
    const isAllowed = userMatchesList(targets, currentUsername);
    if (debugMode || isAllowed) {
      return innerText;
    }
    return '__HIDDEN_ENTITY__';
  });

  // 3. hide:for(...)
  processed = processed.replace(/hide:for\(([^)]*)\)\[([^\]]*)\]/gi, (match, targets, innerText) => {
    isSecret = true;
    const isHiddenForUser = userMatchesList(targets, currentUsername);
    if (!debugMode && isHiddenForUser) {
      return '__HIDDEN_ENTITY__';
    }
    return innerText;
  });

  // 4. hide[...] or hide:all[...]
  if (processed.match(/hide(?::all)?\[/i)) {
    isSecret = true;
    const hideInner = processed.match(/hide(?::all)?\[([^\]]*)\]/i);
    const innerText = hideInner ? hideInner[1].trim() : '';
    // Context check: Things the character/player should naturally know based on context
    // (such as their home, residence, cottage, quarters) are NOT hidden unless context dictates otherwise
    if (isCharacterKnownContext(innerText, currentUsername)) {
      return { displayName: innerText, isHidden: false, isSecret: false };
    }

    if (debugMode) {
      processed = processed.replace(/hide(?::all)?\[([^\]]*)\]/gi, '$1 (Hidden)');
    } else {
      processed = processed.replace(/hide(?::all)?\[[^\]]*\]/gi, '__HIDDEN_ENTITY__');
    }
  }

  const isHidden = processed.includes('__HIDDEN_ENTITY__') || (!debugMode && processed === 'Unknown Area');
  const displayName = isHidden ? (debugMode ? `${rawName} (Hidden)` : 'Unknown Area') : processed;

  return { displayName, isHidden, isSecret };
}
