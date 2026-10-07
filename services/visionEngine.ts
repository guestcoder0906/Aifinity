/**
 * Vision & Range of Sight Engine
 * Dynamically resolves vision cones, view ranges, facing directions,
 * and environmental/condition-based sight loss (e.g. blindness, darkness, unconsciousness)
 * for both players and NPCs.
 */

export interface EntityVision {
  mainAngle: number;         // Focused/detailed angle in degrees (default ~66°)
  peripheralAngle: number;   // Peripheral vision angle in degrees (default ~90°)
  detailedRange: number;     // Range in meters of clear/detailed sight (default ~15-20m)
  maxRange: number;          // Total maximum detection range in meters (default ~35-50m)
  isBlind?: boolean;         // True if entity currently has zero view range (blindness, eyes closed, unconscious)
}

/**
 * Checks whether an entity or character sheet indicates blindness or lack of sight.
 */
export function isEntityBlind(entity: any, charSheetContent?: string | null): boolean {
  if (!entity && !charSheetContent) return false;

  // 1. Direct flags on map entity object
  if (entity) {
    if (entity.blind === true || entity.isBlind === true) return true;
    if (entity.vision?.blind === true || entity.vision?.isBlind === true) return true;

    // Zero range explicitly defined
    if (
      entity.vision &&
      entity.vision.maxRange !== undefined &&
      Number(entity.vision.maxRange) <= 0 &&
      (entity.vision.detailedRange === undefined || Number(entity.vision.detailedRange) <= 0)
    ) {
      return true;
    }

    // Status or condition string flags on entity
    const entityStatus = String(entity.status || entity.condition || entity.state || '').toLowerCase();
    if (
      entityStatus.includes('blind') ||
      entityStatus.includes('sightless') ||
      entityStatus.includes('unconscious') ||
      entityStatus.includes('dead')
    ) {
      return true;
    }
  }

  // 2. Character sheet text inspection
  if (charSheetContent) {
    const lower = charSheetContent.toLowerCase();

    // Check for clear dead or unconscious status
    if (/status:\s*(?:dead|unconscious)\b/i.test(charSheetContent)) {
      return true;
    }

    // Check for blindness in status/conditions/body parts
    const blindStatusPattern = /(?:status|condition|effect|state|injury|wound|affliction|eyes?|vision)\s*[:=-]\s*[^.\n\r]*(?:blind|blinded|blindness|sightless|can'?t\s*see|cannot\s*see|no\s*vision|vision\s*loss)/i;
    if (blindStatusPattern.test(charSheetContent)) {
      return true;
    }

    // Explicit Eyes / Vision: Blind / 0
    if (/(?:eyes|eyesight|vision)\s*[:=-]\s*(?:blind|none|0\b|lost|gouged|destroyed|0m|0\s*ft)/i.test(charSheetContent)) {
      return true;
    }

    // Check within [STATUS EFFECTS] or [CONDITIONS] sections
    const statusSectionMatch = charSheetContent.match(/\[(?:STATUS EFFECTS|CONDITIONS|BODY PARTS|HEALTH|STATS & MODIFIERS)[\s\S]*?(?:(?=\n\[[A-Z])|$)/i);
    if (statusSectionMatch) {
      const sectionText = statusSectionMatch[0].toLowerCase();
      if (
        sectionText.includes('blind') ||
        sectionText.includes('blinded') ||
        sectionText.includes('blindness') ||
        sectionText.includes('sightless')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Resolves an entity's facing angle in degrees (0 = East/Right, 90 = South/Down, 180 = West/Left, 270 = North/Up).
 * Supports cardinal direction strings, numbers, and context targets (e.g. facing towards closest player).
 */
export function resolveEntityFacing(
  entity: any,
  context?: { targetX?: number; targetY?: number; defaultFacing?: number }
): number {
  if (!entity && !context) return 0;

  const rawFacing = entity?.facing ?? entity?.angle ?? entity?.rotation ?? entity?.direction;

  if (rawFacing !== undefined && rawFacing !== null) {
    if (typeof rawFacing === 'number' && !isNaN(rawFacing)) {
      return ((rawFacing % 360) + 360) % 360;
    }

    const str = String(rawFacing).trim().toLowerCase();
    const num = parseFloat(str);
    if (!isNaN(num)) {
      return ((num % 360) + 360) % 360;
    }

    // Cardinal / compass directions
    switch (str) {
      case 'e':
      case 'east':
      case 'right':
        return 0;
      case 'se':
      case 'southeast':
      case 'down-right':
        return 45;
      case 's':
      case 'south':
      case 'down':
        return 90;
      case 'sw':
      case 'southwest':
      case 'down-left':
        return 135;
      case 'w':
      case 'west':
      case 'left':
        return 180;
      case 'nw':
      case 'northwest':
      case 'up-left':
        return 225;
      case 'n':
      case 'north':
      case 'up':
        return 270;
      case 'ne':
      case 'northeast':
      case 'up-right':
        return 315;
    }
  }

  // If no explicit facing is given, dynamically orient towards the context target if available
  if (
    entity &&
    context &&
    context.targetX !== undefined &&
    context.targetY !== undefined
  ) {
    const ex = Number(entity.x) || 0;
    const ey = Number(entity.y) || 0;
    const dx = context.targetX - ex;
    const dy = context.targetY - ey;

    if (Math.hypot(dx, dy) > 0.05) {
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      return Math.round(angle);
    }
  }

  return context?.defaultFacing ?? 0;
}

/**
 * Resolves an entity's dynamic vision capabilities.
 * If the entity is blind, returns zero-range vision with isBlind=true.
 */
export function resolveEntityVision(
  entity: any,
  charSheetContent?: string | null,
  isPlayer: boolean = false
): EntityVision {
  // 1. Blindness check
  if (isEntityBlind(entity, charSheetContent)) {
    return {
      mainAngle: 0,
      peripheralAngle: 0,
      detailedRange: 0,
      maxRange: 0,
      isBlind: true
    };
  }

  const defaultMainAngle = 66;
  const defaultPeripheralAngle = 90;
  const defaultDetailedRange = isPlayer ? 20 : 15;
  const defaultMaxRange = isPlayer ? 50 : 35;

  // 2. Parse from entity.vision object if present
  if (entity && entity.vision && typeof entity.vision === 'object') {
    const mainAngle = Number(entity.vision.mainAngle) || defaultMainAngle;
    const peripheralAngle = Number(entity.vision.peripheralAngle) || defaultPeripheralAngle;

    const rawMax = entity.vision.maxRange !== undefined ? Number(entity.vision.maxRange) : undefined;
    const rawDet = entity.vision.detailedRange !== undefined ? Number(entity.vision.detailedRange) : undefined;

    // Check if explicitly 0
    if (rawMax !== undefined && rawMax <= 0 && (rawDet === undefined || rawDet <= 0)) {
      return {
        mainAngle: 0,
        peripheralAngle: 0,
        detailedRange: 0,
        maxRange: 0,
        isBlind: true
      };
    }

    const maxRange = rawMax !== undefined && !isNaN(rawMax) ? Math.max(0, rawMax) : defaultMaxRange;
    const detailedRange = rawDet !== undefined && !isNaN(rawDet)
      ? Math.max(0, rawDet)
      : Math.min(maxRange, Math.round(maxRange * 0.45));

    if (maxRange <= 0) {
      return {
        mainAngle: 0,
        peripheralAngle: 0,
        detailedRange: 0,
        maxRange: 0,
        isBlind: true
      };
    }

    return {
      mainAngle,
      peripheralAngle,
      detailedRange,
      maxRange,
      isBlind: false
    };
  }

  // 3. Fallback: Check character sheet text for custom perception or sight range
  let maxRange = defaultMaxRange;
  let detailedRange = defaultDetailedRange;

  if (charSheetContent) {
    const sightRangeMatch = charSheetContent.match(/(?:vision|view|sight)\s*range[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*m/i);
    if (sightRangeMatch) {
      const parsed = parseFloat(sightRangeMatch[1]);
      if (!isNaN(parsed) && parsed > 0) {
        maxRange = parsed;
        detailedRange = Math.round(parsed * 0.45);
      }
    }
  }

  return {
    mainAngle: defaultMainAngle,
    peripheralAngle: defaultPeripheralAngle,
    detailedRange,
    maxRange,
    isBlind: false
  };
}

/**
 * Synchronizes and validates vision and facing on all map pages, players, and NPCs.
 */
export function syncMapEntitiesVision(
  mapObj: any,
  fileSystem?: { read: (filename: string) => string | null }
): boolean {
  if (!mapObj || typeof mapObj !== 'object') return false;

  const pages = Array.isArray(mapObj.pages) ? mapObj.pages : (Array.isArray(mapObj) ? mapObj : [mapObj]);
  let modified = false;

  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;

    // Collect first player coords as a reference target for NPC facing
    let primaryPlayer: { x: number; y: number } | null = null;
    if (Array.isArray(page.players) && page.players.length > 0) {
      const p0 = page.players[0];
      if (p0.x !== undefined && p0.y !== undefined) {
        primaryPlayer = { x: Number(p0.x) || 0, y: Number(p0.y) || 0 };
      }
    }

    // 1. Synchronize players
    if (Array.isArray(page.players)) {
      for (const pl of page.players) {
        if (!pl || typeof pl !== 'object') continue;
        const charName = pl.characterName || pl.username || '';
        let fileContent: string | null = null;
        if (fileSystem && charName) {
          fileContent = fileSystem.read(`${charName}.txt`) ||
            fileSystem.read(`${charName}-${pl.username}.txt`) ||
            fileSystem.read(`${pl.username}.txt`);
        }

        const vision = resolveEntityVision(pl, fileContent, true);
        const facing = resolveEntityFacing(pl);

        if (pl.facing !== facing) {
          pl.facing = facing;
          modified = true;
        }

        if (vision.isBlind) {
          if (!pl.vision || pl.vision.maxRange !== 0 || !pl.vision.blind) {
            pl.vision = {
              mainAngle: 0,
              peripheralAngle: 0,
              detailedRange: 0,
              maxRange: 0,
              blind: true
            };
            modified = true;
          }
        } else {
          if (!pl.vision || pl.vision.maxRange === undefined) {
            pl.vision = {
              mainAngle: vision.mainAngle,
              peripheralAngle: vision.peripheralAngle,
              detailedRange: vision.detailedRange,
              maxRange: vision.maxRange
            };
            modified = true;
          }
        }
      }
    }

    // 2. Synchronize NPCs
    const npcsList = [
      ...(Array.isArray(page.npcs) ? page.npcs : []),
      ...(Array.isArray(page.creatures) ? page.creatures : []),
      ...(Array.isArray(page.entities) ? page.entities : []),
      ...(Array.isArray(page.areas) ? page.areas.filter((a: any) => a && /npc|enemy|ally|creature|boss/i.test(a.type || '')) : [])
    ];

    for (const npc of npcsList) {
      if (!npc || typeof npc !== 'object') continue;
      const nName = String(npc.name || npc.id || '').trim();
      const cleanName = nName.replace(/-npc$/i, '');
      let fileContent: string | null = null;
      if (fileSystem && nName) {
        fileContent = fileSystem.read(`${nName}.txt`) ||
          fileSystem.read(`${cleanName}-npc.txt`) ||
          fileSystem.read(`${cleanName}.txt`);
      }

      const facing = resolveEntityFacing(npc, primaryPlayer ? { targetX: primaryPlayer.x, targetY: primaryPlayer.y } : undefined);
      const vision = resolveEntityVision(npc, fileContent, false);

      if (npc.facing !== facing) {
        npc.facing = facing;
        modified = true;
      }

      if (vision.isBlind) {
        if (!npc.vision || npc.vision.maxRange !== 0 || !npc.vision.blind) {
          npc.vision = {
            mainAngle: 0,
            peripheralAngle: 0,
            detailedRange: 0,
            maxRange: 0,
            blind: true
          };
          modified = true;
        }
      } else {
        if (!npc.vision || npc.vision.maxRange === undefined) {
          npc.vision = {
            mainAngle: vision.mainAngle,
            peripheralAngle: vision.peripheralAngle,
            detailedRange: vision.detailedRange,
            maxRange: vision.maxRange
          };
          modified = true;
        }
      }
    }
  }

  return modified;
}
