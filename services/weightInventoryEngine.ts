/**
 * Weight, Dimension, Container, and Encumbrance Engine for Aifinity
 *
 * Implements:
 * 1. Standardized parsing for item weights (e.g. "0 weight", "1 pound and 3x5 inches", "5 lbs", "feather 0 weight 3x0 inch")
 * 2. Item & Container dimensions parsing (e.g. "3x0 inch", "18 inches tall by 12 inches area", "18x12x8 inches")
 * 3. Container holding limits and overflow detection (e.g. staff protruding from backpack risking dropping)
 * 4. Character dimensions (Height, Width, Depth) & Body Weight
 * 5. Total carried weight calculation across all equipped items, armor, containers, and inventory inside containers
 * 6. Exclusion of owned/stored items not on person (home, vault, camp, wagon)
 * 7. Encumbrance & Speed: <= 20% good, 21%+ slower speed effect until weight drops below 21%
 * 8. Max lift strength: 100% of body weight for average human with 1.0x strength modifier (anything heavier is impossible)
 * 9. Temporary spell/effect reversions (e.g. lightweight spell on a boulder reverting when expired)
 */

export interface ParsedDimensions {
  height?: number; // inches
  width?: number;  // inches
  depth?: number;  // inches
  raw: string;
  applies: boolean;
  unit: string;
}

export interface ItemUsageInfo {
  current: number;
  max?: number;
  unit?: string; // e.g. "uses", "charges", "doses", "sips", "hours", "arrows", "durability", "shots", "servings"
  isRefillable: boolean;
  refillType?: string; // e.g. "Water", "Oil", "Mana", "Herbs", "Arrows", "Fuel"
  rawText?: string;
}

export interface ItemInfo {
  name: string;
  weight: number; // lbs
  dimensions: ParsedDimensions;
  category: 'equipped' | 'carried' | 'container' | 'stored';
  containerName?: string;
  location?: string;
  isHiddenLocation?: boolean;
  isFoldable?: boolean;
  isOverflow?: boolean;
  doesNotFit?: boolean;
  fitStatus?: 'fits' | 'overflow' | 'does_not_fit';
  overflowReason?: string;
  dropChancePercent?: number; // Scaled random accidental drop probability %
  dropRiskScore?: number; // Relative vulnerability score based on weight and dimensions
  rawText: string;
  usage?: ItemUsageInfo;
  temporaryEffect?: {
    name: string;
    expires?: string;
    tempWeight: number;
    baseWeight: number;
  };
}

export interface ContainerInfo {
  name: string;
  weight: number; // empty weight in lbs
  dimensions: ParsedDimensions;
  maxDimensions: ParsedDimensions;
  currentDimensions?: ParsedDimensions; // dynamic active size (updates when stretched!)
  stretchedDimensions?: ParsedDimensions; // size when stretched
  currentStretchRatio?: number; // current stretch multiplier (e.g. 1.35x)
  maxWeightCapacity?: number;
  maxVolume?: number; // base internal volume in cubic inches
  stretchFactor?: number; // dynamically determined by AI/context (1.0 for rigid, 1.5 for wallet, 1.3 for pouch, etc.)
  effectiveMaxVolume?: number; // maxVolume * stretchFactor (stretchable space limit)
  isRigid?: boolean; // true if rigid - only holds 1.0x space
  isStretched?: boolean; // true if currentVolume > maxVolume but <= effectiveMaxVolume
  stretchReason?: string;
  currentVolume?: number; // current volume used by items + physical currency
  currencyCount?: number;
  currencyWeight?: number;
  currencyVolume?: number;
  items: ItemInfo[];
  currentItemsWeight: number;
  totalWeight: number; // container weight + items weight
  hasOverflow: boolean;
  hasDoesNotFit?: boolean;
  overflowReason?: string;
  overflowDropChancePercent?: number;
  rawText: string;
}

export interface HeldItemInfo extends ItemInfo {
  holdingLimb?: string; // e.g. "Right Hand", "Left Hand", "Both Hands", "Mouth / Jaws", "Tentacle 1", "Under Arm (Overflow)"
  isOverflowHold?: boolean;
  overflowWarning?: string;
}

export interface HoldingCapacityInfo {
  applies: boolean;
  holdingLimbsDescription: string; // e.g. "2 Hands / Arms", "Jaws / Mouth (Quadruped)", "4 Arms", "None (Limbless/Amorphous)"
  maxStandardHoldCount: number;
  currentHeldCount: number;
  isFull: boolean;
  hasOverflowHold: boolean;
  overflowReason?: string;
  freeSlots: number;
  overflowDropChancePercent?: number; // Overall scaled accidental drop chance for overflow items
  totalOverflowCount?: number;
  maxStartingCarryingItems?: number; // <= 2x hand slots limit at start
}

export interface CurrencyEntry {
  name: string; // e.g. "1921 Morgan Dollar Coin", "Gold Coin", "Digital Credits", "Dollars"
  amount: number;
  worth?: string; // e.g. "$1.00", "1 GP", "50 Credits", "$1.00 each ($1.00 total)"
  worthValue?: number; // numeric face value/worth per unit or total
  dimensions?: ParsedDimensions; // multiplied total dimensions of the stack/bundle of currency
  singleDimensions?: ParsedDimensions; // dimensions of a single coin/unit
  singleDimensionsRaw?: string; // e.g. "1.5x1.5x0.09 inches"
  isDigital?: boolean; // true if digital money, taking 0 volume/dimensions
  unitVolume?: number; // cubic inches per single unit
  totalVolume?: number; // total cubic inches occupied by this stack in container
  singleWeight?: number; // weight of a single coin/unit in lbs
  weight?: number; // total lbs for this stack
  container?: string; // e.g. "Coin Pouch", "Wallet", "Backpack"
  location?: string; // Attached location e.g. "Player's Cottage, Riverwood", "Gringotts Vault 687"
  isHiddenLocation?: boolean; // true if location is wrapped in hide[...]
  rawText: string;
}

export interface CharacterCurrencyData {
  currencyType: string; // e.g. "Gold, Silver, and Copper Coins" or "Credits"
  carriedCurrencies: CurrencyEntry[];
  carriedSummary: string; // e.g. "1 Gold Coin, 5 Silver Coins" or "250 Credits" or "0"
  storedCurrencies: CurrencyEntry[];
  storedSummary: string; // e.g. "150 Gold Coins [Player's Cottage]" or "None"
  totalNetWorthSummary: string;
  hasCurrency: boolean;
}

export interface ActiveStatusEffect {
  name: string;
  rawText: string;
  duration?: string;
  expires?: string;
  began?: string;
  stage?: string;
  description?: string;
  appearance?: string; // temporary appearance alteration e.g. "Towering 7ft bipedal wolf with obsidian fur"
  tempWeight?: number;
  baseWeight?: number;
  tempDimensions?: string;
  baseDimensions?: string;
  stats?: string;
  revert?: string;
  chainedEffect?: string; // effect that activates when this one expires e.g. "Overcharge_Burnout(Duration: 10s; ...)"
  isExpired?: boolean;
}

export interface CharacterPhysicalStats {
  characterName: string;
  username?: string;
  characterType?: string; // e.g. "Slime", "Ghost", "Humanoid", "Golem", "Robot"
  height?: string;
  width?: string;
  depth?: string;
  dimensionsRaw: string;
  dimensionsApply: boolean;
  bodyWeight: number; // lbs, default 160 for human if unspecified
  strengthMultiplier: number; // default 1.0x
  maxLiftStrength: number; // lbs (100% of body weight for 1.0x baseline human)
  baseWalkingSpeed: number; // m/s, default 1.5
  baseRunningSpeed: number; // m/s, default 4.5
  currentWalkingSpeed: number; // m/s
  currentRunningSpeed: number; // m/s
  isEncumbered: boolean;
  encumbranceRatio: number; // carriedWeight / bodyWeight (e.g. 0.18 = 18%)
  encumbranceThreshold: number; // default 20% (0.20) for standard human, or custom / None / immune
  encumbranceApplies: boolean; // false for Slimes, Incorporeal/Ghosts, Telekinetic, or immune entities
  encumbranceImmunityReason?: string; // e.g. "Slime biology absorbs items internally without standard encumbrance/slowing"
  encumbranceEffectDescription: string; // Dynamic description of what carrying weight does to this specific entity
  totalCarriedWeight: number; // lbs
  currency: CharacterCurrencyData;
  isMounted: boolean;
  mountedEntityName?: string;
  mountedStatusDescription?: string;
  passengersOrRiders: Array<{ name: string; weight?: number }>;
  passengerWeight: number;
  currentlyHolding: HeldItemInfo[];
  holdingCapacity: HoldingCapacityInfo;
  handSlots: number;
  maxStartingCarryingItems: number; // <= 2x hand slots limit at start
  totalOverflowCount: number; // total items in overflow across hands & containers
  overallOverflowDropChancePercent: number; // scaled random chance of accidental drop
  containers: ContainerInfo[];
  equippedGear: ItemInfo[];
  carriedItems: ItemInfo[];
  storedItems: ItemInfo[]; // owned, but NOT on person
  activeWeightEffects: Array<{
    name: string;
    expires?: string;
    target: string;
    tempVal: number;
    baseVal: number;
  }>;
  activeStatusEffects?: ActiveStatusEffect[];
  temporaryAppearance?: string; // Active temporary appearance from transformations or spells
  baseAppearance?: string; // Original base appearance before transformation
  healthState?: {
    isUnconscious: boolean;
    isDead: boolean;
    unconsciousExpires?: string;
    unconsciousDurationRemainingMinutes?: number;
    rotStage?: number;
    rotStageName?: string;
    rotDescription?: string;
    deathReason?: string;
  };
}

export class WeightInventoryEngine {
  /**
   * Cleans accidental repeating phrases, duplicated text lines, or concatenated duplicate substrings.
   * e.g. "Location: XYZ Location: XYZ Location: XYZ" or repeated piped segments.
   */
  public static cleanDuplicateRepeatedPhrases(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let cleaned = text;

    // 1. Remove back-to-back duplicate bracketed tags: e.g. "[Location: XYZ] [Location: XYZ]" -> "[Location: XYZ]"
    cleaned = cleaned.replace(/(\[[^\]]{3,}\])(?:\s*\1)+/gi, '$1');

    // 2. Remove back-to-back duplicate pipe fragments: e.g. "| Amount: 1 | Worth: Digital ... | Amount: 1 | Worth: Digital ..."
    cleaned = cleaned.replace(/((?:\|\s*[^|\n\r]+){2,})(?:\s*\1)+/gi, '$1');

    // 3. Remove repeated identical sentences or long phrase blocks (8+ chars) repeated consecutively
    let prevCleaned = '';
    let iterations = 0;
    while (prevCleaned !== cleaned && iterations < 4) {
      prevCleaned = cleaned;
      iterations++;

      // Match repeated phrases >= 8 characters long that repeat 2 or more times
      cleaned = cleaned.replace(/([A-Za-z0-9#_ \-\.]{8,}?)(?:\s*(?:\|\s*)?\1){1,}/g, (match, p1) => {
        if (/[a-zA-Z]{3,}/.test(p1)) {
          return p1.trim();
        }
        return match;
      });

      // Collapse duplicate prefix labels: "Location: Location:" -> "Location:"
      cleaned = cleaned.replace(/(?:Location:\s*){2,}/gi, 'Location: ');
      cleaned = cleaned.replace(/(?:Container:\s*){2,}/gi, 'Container: ');
      cleaned = cleaned.replace(/(?:Name:\s*){2,}/gi, 'Name: ');
    }

    return cleaned;
  }

  /**
   * Identifies whether a given name or phrase describes a physical container, wallet, pouch, purse, holder, or clip
   * rather than money/currency itself.
   */
  public static isContainerName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const lower = name.toLowerCase().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '').trim();
    if (!lower) return false;
    return /\b(?:wallet|chit\s*wallet|credit\s*wallet|pouch|purse|money\s*belt|money\s*clip|cardholder|card\s*holder|chit\s*holder|billfold|coin\s*bag|coin\s*sack|coin\s*pouch|coin\s*purse|backpack|satchel|bag|haversack|rucksack|quiver|bandolier|scabbard|pocket|trunk|crate|case|box|chest|container|lockbox|safe|vault|strongbox)\b/i.test(lower);
  }

  /**
   * Sanitizes a currency worth/value string to eliminate unparsed placeholders like "Credits", "Digital", "Coin", "None",
   * or redundant strings identical to the currency's own name.
   */
  public static sanitizeCurrencyWorth(worth?: string, currencyName?: string): string | undefined {
    if (!worth || typeof worth !== 'string') return undefined;
    let trimmed = worth.trim().replace(/^[-*•>\s]+/, '').replace(/^[\(\[]|[\)\]]$/g, '').trim();
    trimmed = trimmed.replace(/^worth[:=\s]+/i, '').trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    if (/^(?:credits?|digital|coins?|currency|money|cash|none|n\/a|unparsed)$/i.test(lower)) {
      return undefined;
    }
    if (currencyName && lower === currencyName.trim().toLowerCase()) {
      return undefined;
    }
    return trimmed;
  }

  /**
   * Sanitizes a currency name to prevent leaking field prefixes or location names into the currency label.
   */
  public static sanitizeCurrencyName(name: string): string {
    if (!name || typeof name !== 'string') return '';
    let cleaned = name.trim();

    // Strip outer brackets/quotes
    cleaned = cleaned.replace(/^[\["'`]+|[\]"'`]+$/g, '').trim();

    // Strip leading headers like Location:, Container:, Item:, Name:, etc.
    cleaned = cleaned.replace(/^(?:name|location|container|stored|carried|item|balance)[:=\s]+/i, '').trim();

    // Strip any trailing pipes and attributes that leaked into the name
    cleaned = cleaned.replace(/\|.*$/i, '').trim();
    cleaned = cleaned.replace(/(?:\[\s*)?location[:=\s]+[^\]\n\r]+/gi, '').trim();
    cleaned = cleaned.replace(/(?:\[\s*)?container[:=\s]+[^\]\n\r]+/gi, '').trim();
    cleaned = cleaned.replace(/(?:worth|value|dimensions?|dims?|size|weight|wt)[:=\s]+[^|;,()]+/gi, '').trim();

    // Collapse repeated duplicate phrases
    cleaned = WeightInventoryEngine.cleanDuplicateRepeatedPhrases(cleaned);
    cleaned = cleaned.replace(/^[\["'`]+|[\]"'`]+$/g, '').trim();

    return cleaned;
  }

  /**
   * Infers single-unit dimensions, volume, weight, and digital status for currency items,
   * and calculates the multiplied total dimensions and volume for the full currency stack (amount pieces).
   * Physical currency is NOT infinite space and has dimensions/volume.
   * Digital money (credits, crypto, bank deposits) takes 0 volume/space.
   */
  public static inferCurrencyDefaults(
    name: string,
    explicitDims?: string,
    explicitWeight?: number,
    amount: number = 1
  ): {
    dimensions: ParsedDimensions;
    singleDimensions: ParsedDimensions;
    singleDimensionsRaw: string;
    isDigital: boolean;
    singleWeight: number;
    totalWeight: number;
    unitVolume: number;
    totalVolume: number;
    defaultWorth?: string;
  } {
    const lower = (name || '').toLowerCase();
    const explicitLower = (explicitDims || '').toLowerCase();

    // Check if explicitly digital or matching digital keywords
    const isDigital =
      explicitLower.includes('digital') ||
      explicitLower.includes('incorporeal') ||
      explicitLower.includes('none') ||
      explicitLower.includes('0x0') ||
      /digital|credit|creds|cyber|crypto|electronic|virtual|bank|account|wire|direct\s*deposit|ethereal|ledger/i.test(lower);

    if (isDigital) {
      const dim: ParsedDimensions = {
        height: 0,
        width: 0,
        depth: 0,
        raw: explicitDims || 'Digital (None)',
        applies: false,
        unit: 'inches'
      };
      return {
        dimensions: dim,
        singleDimensions: dim,
        singleDimensionsRaw: 'Digital',
        isDigital: true,
        singleWeight: 0,
        totalWeight: 0,
        unitVolume: 0,
        totalVolume: 0,
        defaultWorth: undefined
      };
    }

    let singleDim: ParsedDimensions;
    let singleW = 0.02;
    let unitVol = 0.115;
    let defaultWorth = '$1.00';

    // If explicit dimensions are supplied, parse them
    if (explicitDims && explicitDims.trim()) {
      const parsedDim = this.parseDimensions(explicitDims);
      const h = parsedDim.height || 1.2;
      const w = parsedDim.width || 1.2;
      const d = parsedDim.depth || 0.08;
      unitVol = Math.round(h * w * d * 10000) / 10000;
      singleDim = {
        height: h,
        width: w,
        depth: d,
        raw: parsedDim.raw || `${h}x${w}x${d} inches`,
        applies: true,
        unit: 'inches'
      };
      singleW = explicitWeight !== undefined && amount > 0
        ? Math.round((explicitWeight / amount) * 10000) / 10000
        : (lower.includes('morgan') || lower.includes('dollar') ? 0.06 : 0.02);
      defaultWorth = lower.includes('dollar') ? '$1.00' : '1 Coin';
    } else if (/morgan|silver\s*dollar|large\s*dollar|trade\s*dollar|peace\s*dollar|double\s*eagle/i.test(lower)) {
      // 1. Large historical coins (e.g. Morgan Dollar, Peace Dollar, Silver Dollar, Double Eagle)
      singleDim = this.parseDimensions('1.5x1.5x0.09 inches');
      singleW = 0.06; // ~26.7g
      unitVol = 0.2025;
      defaultWorth = '$1.00';
    } else if (/banknote|bill|cash|scrip|paper\s*money|dollar\s*bill/i.test(lower)) {
      // 2. Paper currency / Banknotes / Dollar bills / Scrip / Cash
      singleDim = this.parseDimensions('3x2.6x0.02 inches');
      singleW = 0.002;
      unitVol = 0.156;
      defaultWorth = '$1.00';
    } else if (/penny|cent|dime|nickel|quarter|small\s*coin/i.test(lower)) {
      // 3. Small coins (penny, cent, dime, nickel, quarter)
      singleDim = this.parseDimensions('0.95x0.95x0.06 inches');
      singleW = 0.012;
      unitVol = 0.054;
      defaultWorth = '$0.01';
    } else if (/bar|ingot|bullion/i.test(lower)) {
      // 4. Bullion / Ingots / Bars
      singleDim = this.parseDimensions('7x3.6x1.75 inches');
      singleW = explicitWeight !== undefined && amount > 0 ? explicitWeight / amount : 27.0;
      unitVol = 44.1;
      defaultWorth = undefined;
    } else if (/gem|jewel|ruby|diamond|emerald|sapphire/i.test(lower)) {
      // 5. Gems / Jewels / Trade stones
      singleDim = this.parseDimensions('0.8x0.8x0.8 inches');
      singleW = 0.03;
      unitVol = 0.512;
      defaultWorth = undefined;
    } else if (/cap|bottle\s*cap/i.test(lower)) {
      // 6. Bottle caps
      singleDim = this.parseDimensions('1.1x1.1x0.15 inches');
      singleW = 0.005;
      unitVol = 0.18;
      defaultWorth = undefined;
    } else {
      // 7. Standard fantasy/historical coins (Gold, Silver, Copper, Electrum, Platinum, Crowns, Ducats, etc.)
      singleDim = this.parseDimensions('1.1x1.1x0.07 inches');
      singleW = 0.02; // ~50 coins per pound
      unitVol = 0.065; // ~1.1" dia x 0.07" thickness with circular packing
      defaultWorth = lower.includes('gold') ? '1 GP' : lower.includes('silver') ? '1 SP' : lower.includes('copper') ? '1 CP' : (lower.includes('dollar') ? '$1.00' : undefined);
    }

    const singleRaw = singleDim.raw || `${singleDim.height}x${singleDim.width}x${singleDim.depth} inches`;
    const totalW = explicitWeight !== undefined ? explicitWeight : Math.round(amount * singleW * 100) / 100;
    const totalVol = Math.round(amount * unitVol * 1.15 * 100) / 100;

    // Calculate multiplied 3D stack/bundle dimensions for amount pieces of physical currency
    // Loose coins in a pouch/container pack together flexibly rather than forming a rigid oversized slab
    let stackDim: ParsedDimensions = singleDim;
    if (amount > 1) {
      const stackH = Math.min(4.0, Math.round((singleDim.height + Math.cbrt(amount) * 0.25) * 10) / 10);
      const stackW = Math.min(4.0, Math.round((singleDim.width + Math.cbrt(amount) * 0.25) * 10) / 10);
      const stackD = Math.min(4.0, Math.round((singleDim.depth * Math.sqrt(amount) * 0.4) * 10) / 10);
      stackDim = {
        height: stackH,
        width: stackW,
        depth: stackD,
        raw: `${stackH}x${stackW}x${stackD} inches`,
        applies: true,
        unit: 'inches'
      };
    }

    return {
      dimensions: stackDim,
      singleDimensions: singleDim,
      singleDimensionsRaw: singleRaw,
      isDigital: false,
      singleWeight: singleW,
      totalWeight: totalW,
      unitVolume: unitVol,
      totalVolume: totalVol,
      defaultWorth
    };
  }

  /**
   * Parses currency entries from lines, item descriptions, and balance notes:
   * e.g.:
   * - "* 1x 1921 Morgan Dollar Coin | Worth: $1.00 | Dimensions: 1.5x1.5x0.09 inches | Weight: 0.06 lbs [Container: Coin Pouch]"
   * - "1921 Morgan Dollar Coin" (Quantity: 1, NOT 1,921 coins!)
   * - "1 1921 Morgan Dollar Coin" (Quantity: 1)
   * - "1 Gold Coin, 5 Silver Coins: 0.15 lbs. Container: [Coin Pouch]"
   * - "150 Gold Coins: Location: [Iron Treasure Chest in Player's Cottage]"
   * - "50 Silver Coins: Location: hide[Buried under tree at coords (120, 340)]"
   * - "250 Credits"
   * - "$500" / "500 Dollars"
   */
  public static parseCurrencyEntries(
    line: string,
    defaultLocation?: string,
    defaultContainer?: string
  ): CurrencyEntry[] {
    const entries: CurrencyEntry[] = [];
    if (!line || !line.trim()) return entries;

    // Clean broken HTML artifacts, entity remnants, and tags that might have leaked into the line
    let cleanedLine = line
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#91;/gi, '[')
      .replace(/&#93;/gi, ']')
      .replace(/\[hidden\]">/gi, '[hidden] ')
      .replace(/">/g, ' ')
      .replace(/^[-*•>\s]+/, '')
      .trim();

    // Strip leading container prefix if present (e.g. "• (Inside Leather Bifold Wallet: 1 Digital Credit ...)" or "• (Inside Leather Bifold Wallet): ...")
    const insidePrefix = cleanedLine.match(/^(?:\(|\[)?\s*(?:inside|in(?:\s*container)?|stored\s+in)\s+([a-zA-Z0-9_\s'-]+?)(?:\)|\])?\s*[:=-]\s*(.+)$/i);
    if (insidePrefix) {
      if (!defaultContainer) {
        defaultContainer = insidePrefix[1].trim();
      }
      cleanedLine = insidePrefix[2].trim();
    }

    // Strip section balance prefixes while dynamically preserving any currency on the line
    // e.g. "Carried Balance (Coin Pouch): 20 GP, 15 SP" or "- Carried Balance: 100 Gold Coins" or "- Stored Balance: 150 Gold Coins [Location: ...]"
    const headerPrefixMatch = cleanedLine.match(/^(?:carried|stored(?:\s*\/\s*remote)?)\s*balance(?:\s*\(([^)]+)\)|\s*\[([^\]]+)\])?\s*[:=-]\s*(.*)$/i);
    if (headerPrefixMatch) {
      if (headerPrefixMatch[1] || headerPrefixMatch[2]) {
        const contFromHeader = (headerPrefixMatch[1] || headerPrefixMatch[2]).trim();
        if (!/^(?:on\s*person|not\s*on\s*person|remote|cash|coins?|funds?|wealth)$/i.test(contFromHeader) && !defaultContainer) {
          defaultContainer = contFromHeader;
        }
      }
      cleanedLine = headerPrefixMatch[3].trim();
    }

    const lower = cleanedLine.toLowerCase();

    // Skip purely structural headers, accounting summaries, or empty value indicators
    if (
      !cleanedLine ||
      lower === 'none' ||
      lower === 'none (0)' ||
      lower === '0' ||
      lower.startsWith('currency type:') ||
      lower.startsWith('- currency type:') ||
      lower.startsWith('currency:') ||
      lower.startsWith('- currency:') ||
      lower.startsWith('total carried wealth:') ||
      lower.startsWith('total stored wealth:') ||
      lower.startsWith('total net worth:') ||
      (lower.startsWith('(') && lower.endsWith(')') && !lower.includes('gold') && !lower.includes('coin') && !lower.includes('credit') && !lower.includes('dollar') && !lower.includes('scrip') && !lower.includes('cash'))
    ) {
      return entries;
    }

    // Skip container definition lines that do not contain explicit currency
    const isContDefLine = /^(?:\[[^\]]+\]|[a-zA-Z0-9_\s'-]+)\s*:\s*(?:dimensions|capacity|stretch|max\s*capacity|empty\s*weight)/i.test(cleanedLine);
    if (isContDefLine && !lower.includes('contains:') && !lower.includes('contents:')) {
      return entries;
    }

    // Starting Carried Item Limit Compliance lines: strip leading compliance prefix if present
    if (
      lower.includes('starting carried item') ||
      lower.includes('starting item limit') ||
      lower.includes('item limit compliance') ||
      lower.includes('limit compliance') ||
      lower.includes('items accounting') ||
      lower.includes('carrying limit')
    ) {
      if (/net[:=\s]+/i.test(cleanedLine)) {
        cleanedLine = cleanedLine.replace(/^.*?net[:=\s]+/i, '').trim();
      } else {
        return entries;
      }
    }

    // Helper to sanitize extracted location
    const sanitizeLoc = (locStr: string): string => {
      let loc = locStr.trim();
      loc = loc.replace(/^location[:=\s]+/i, '').trim();
      loc = loc.replace(/^[">:\s]+/, '').trim();
      // Remove trailing unbalanced bracket like "Account #****-9014]"
      const openCount = (loc.match(/\[/g) || []).length;
      const closeCount = (loc.match(/\]/g) || []).length;
      if (closeCount > openCount && loc.endsWith(']')) {
        loc = loc.substring(0, loc.length - 1).trim();
      }
      return loc;
    };

    // Extract location if present
    let location = defaultLocation ? sanitizeLoc(defaultLocation) : undefined;
    let isHiddenLocation = false;
    const locPattern = /(?:\[\s*)?(?:location|secret)[:=\s]+(hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)/i;
    const locMatch = cleanedLine.match(locPattern);
    if (locMatch) {
      location = sanitizeLoc(locMatch[1]);
      if (/hide[:\[]|target\(|\[hidden\]/i.test(location)) {
        isHiddenLocation = true;
      }
    } else if (/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i.test(cleanedLine)) {
      const match = cleanedLine.match(/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = sanitizeLoc(match[0]);
        isHiddenLocation = true;
      }
    } else if (/target\([^)]+\)\[[^\]]+\]/i.test(cleanedLine)) {
      const match = cleanedLine.match(/target\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = sanitizeLoc(match[0]);
        isHiddenLocation = true;
      }
    } else if (cleanedLine.toLowerCase().includes('hide[')) {
      const hideMatch = cleanedLine.match(/hide\[([^\]]+)\]/i);
      if (hideMatch) {
        location = `hide[${hideMatch[1].trim()}]`;
        isHiddenLocation = true;
      }
    } else if (cleanedLine.toLowerCase().includes('[hidden]')) {
      location = '[hidden]';
      isHiddenLocation = true;
    }

    // Extract container if present
    let container = defaultContainer;
    const bracketedContMatch = cleanedLine.match(/(?:\[\s*)?container[:=\s]+\[([^\]]+)\]/i) || cleanedLine.match(/\[\s*container[:=\s]+([^\]]+)\]/i);
    if (bracketedContMatch) {
      container = bracketedContMatch[1].trim();
    } else {
      const contMatch = cleanedLine.match(/container[:=\s]+([^|;,\(\)\[\]\r\n]+)/i);
      if (contMatch) {
        container = contMatch[1].trim();
      } else {
        const bracketMatch = cleanedLine.match(/\[([a-zA-Z0-9_\s'&-]+)\]/i);
        if (bracketMatch && !locMatch) {
          const inner = bracketMatch[1].trim();
          if (/pouch|wallet|purse|backpack|chest|bag|sack|bankroll/i.test(inner)) {
            container = inner;
          }
        }
      }
    }

    // Extract weight if specified
    let entryWeight: number | undefined;
    const weightMatch = cleanedLine.match(/(?:weight|wt)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?|kg|grams?)\b/i) || cleanedLine.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?|kg|grams?)\b/i);
    if (weightMatch) {
      entryWeight = parseFloat(weightMatch[1]);
    }

    // Extract dimensions if specified on line
    let entryDimsStr: string | undefined;
    const dimMatch = cleanedLine.match(/(?:dimensions?|dims?|size)[:=\s]+([^|;,\(\)]+)/i);
    if (dimMatch) {
      entryDimsStr = dimMatch[1].trim();
    }

    // Extract worth if specified on line: e.g. "Worth: $1.00" or "Value: 1 GP"
    let entryWorthStr: string | undefined;
    const worthMatch = cleanedLine.match(/(?:worth|value|face\s*value|market\s*value)[:=\s]+([^|;,()]+)/i);
    if (worthMatch) {
      entryWorthStr = WeightInventoryEngine.sanitizeCurrencyWorth(worthMatch[1].trim());
    }

    // Extract explicit quantity if specified: e.g. "Quantity: 1", "Qty: 5", "Count: 10"
    let explicitQty: number | undefined;
    const qtyMatch = cleanedLine.match(/(?:quantity|qty|count|amount)[:=\s]+([0-9]+)/i);
    if (qtyMatch) {
      explicitQty = parseInt(qtyMatch[1], 10);
    }

    // Prepare contentToScan:
    // CRITICAL: Strip out "Worth: ..." so that dollar signs inside "Worth: $1.00" are NOT parsed as separate phantom dollar entries!
    let contentToScan = cleanedLine;
    const containsMatch = cleanedLine.match(/contains[:=\s]+([^)]+)/i);
    if (containsMatch) {
      contentToScan = containsMatch[1];
    } else {
      contentToScan = contentToScan
        .replace(/\[\s*(?:location|secret)[:=\s]+(?:hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^\]]+)\]/gi, ' ')
        .replace(/(?:\[\s*)?(?:location|secret)[:=\s]+(?:hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)(?:\])?/gi, ' ')
        .replace(/(?:\[\s*)?container[:=\s]+\[[^\]]+\]/gi, ' ')
        .replace(/\[\s*container[:=\s]+[^\]]+\]/gi, ' ')
        .replace(/container[:=\s]+[^|;,\(\)\[\]\r\n]+/gi, ' ')
        .replace(/(?:worth|value|face\s*value|market\s*value)[:=\s]+[^|;,()]+/gi, ' ')
        .replace(/(?:dimensions?|dims?|size)[:=\s]+[^|;,()]+/gi, ' ')
        .replace(/(?:weight|wt)[:=\s]*[0-9]+(?:\.[0-9]+)?\s*(?:lbs?|pounds?|kg|grams?)\b/gi, ' ')
        .replace(/:?\s*[0-9]+(?:\.[0-9]+)?\s*(?:lbs?|pounds?|kg|grams?)\b/gi, ' ');
    }

    // Extract and strip containers from contentToScan so wallet/pouch names aren't parsed as currency
    // Use non-greedy precise matching so currency amounts and names preceding the container are NOT swallowed!
    contentToScan = contentToScan.replace(/(?:\b(?:in|into|inside|from|within|to)\s+(?:the\s+|a\s+|an\s+|my\s+|his\s+|her\s+|their\s+)?)?(?:\b(?:leather|bifold|hardened|cloth|velvet|canvas|silk|wooden|iron|small|large|cyber[- ]?credit|credit|coin|money)\s+)*(?:chit\s*wallet|credit\s*wallet|wallet|coin\s*pouch|pouch|coin\s*purse|purse|money\s*belt|money\s*clip|cardholder|card\s*holder|chit\s*holder|billfold|coin\s*bag)\b/gi, (match) => {
      const stripped = match.replace(/^(?:in|into|inside|from|within|to|\s+|the|a|an|my|his|her|their)+/i, '').trim();
      if (WeightInventoryEngine.isContainerName(stripped) && !container) {
        container = stripped;
      }
      return ' ';
    });

    // Clean pipes, brackets, and delimiters for structured lines
    const strippedScan = contentToScan.replace(/[|;()\[\]]+/g, ' ').replace(/^[-*•>\s]+/, '').replace(/\s+/g, ' ').trim();

    // =========================================================================
    // Format A: Explicit Name format and Amount format separated!
    // e.g.:
    // "* Name: [1921 Morgan Dollar Coin] | Amount: 1 | Worth: $1.00 | Dimensions: ... | Weight: ... [Container: ...]"
    // "* Name: 1921 Morgan Dollar Coin | Amount: 1 | Worth: ..."
    // User Mandate: "the year of the coin should be in the name format part of the currency while the amount is separate format for that coin and etc."
    // =========================================================================
    const explicitNameMatch = cleanedLine.match(/(?:^|\||;)\s*name[:=\s]+(?:\[([^\]]+)\]|"([^"]+)"|'([^']+)'|([^|;,()\[\]]+))/i);
    const explicitAmtMatch = cleanedLine.match(/(?:^|\||;)\s*(?:amount|quantity|qty|count)[:=\s]+([0-9]+(?:\.[0-9]+)?)/i);

    if (explicitNameMatch) {
      let rawName = (explicitNameMatch[1] || explicitNameMatch[2] || explicitNameMatch[3] || explicitNameMatch[4] || '').trim();
      rawName = WeightInventoryEngine.sanitizeCurrencyName(rawName);
      if (rawName && rawName.toLowerCase() !== 'none' && rawName !== '0' && !WeightInventoryEngine.isContainerName(rawName)) {
        let amt = explicitAmtMatch ? parseFloat(explicitAmtMatch[1]) : (explicitQty !== undefined ? explicitQty : 1);
        if (isNaN(amt) || amt <= 0) amt = 1;
        const defs = this.inferCurrencyDefaults(rawName, entryDimsStr, entryWeight, amt);
        entries.push({
          name: rawName,
          amount: amt,
          worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, rawName),
          dimensions: defs.dimensions,
          singleDimensions: defs.singleDimensions,
          singleDimensionsRaw: defs.singleDimensionsRaw,
          isDigital: defs.isDigital,
          unitVolume: defs.unitVolume,
          totalVolume: defs.totalVolume,
          singleWeight: defs.singleWeight,
          weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
          container,
          location,
          isHiddenLocation,
          rawText: cleanedLine
        });
        return entries;
      } else if (rawName && WeightInventoryEngine.isContainerName(rawName) && !container) {
        container = rawName;
      }
    }

    // Format B: Bracketed name enclosing coin name & year: e.g. "1x [1921 Morgan Dollar Coin]", "[1921 Morgan Dollar Coin] x1", or "• 1x [Digital Credits / Electronic Scrip"
    const bracketCoinMatch = cleanedLine.match(/(?:([0-9]+(?:\.[0-9]+)?)\s*x\s*)?\[([0-9]{4}\s+[^\]\r\n]+|[^\]\r\n]+)(?:\]|$)(?:\s*x?\s*([0-9]+(?:\.[0-9]+)?))?/i);
    if (bracketCoinMatch) {
      let innerName = bracketCoinMatch[2].trim();
      if (innerName.includes('[Location:')) {
        innerName = innerName.split(/\[Location:/i)[0].trim();
      } else if (innerName.includes('Location:')) {
        innerName = innerName.split(/Location:/i)[0].trim();
      }
      innerName = innerName.replace(/[\)\]]+$/, '').trim();
      if (WeightInventoryEngine.isContainerName(innerName)) {
        if (!container) container = innerName;
      } else if (
        !/chase|bank account|vault|stash|home|safe|hide\[/i.test(innerName) &&
        /coin|dollar|morgan|cent|penny|dime|quarter|credit|scrip|gold|silver|copper|ingot|bar|cash|money|\b\d{4}\b/i.test(innerName)
      ) {
        let amt = 1;
        if (bracketCoinMatch[1]) {
          amt = parseFloat(bracketCoinMatch[1]);
        } else if (bracketCoinMatch[3]) {
          amt = parseFloat(bracketCoinMatch[3]);
        } else if (explicitAmtMatch) {
          amt = parseFloat(explicitAmtMatch[1]);
        } else if (explicitQty !== undefined) {
          amt = explicitQty;
        }

        const defs = this.inferCurrencyDefaults(innerName, entryDimsStr, entryWeight, amt);
        entries.push({
          name: innerName,
          amount: amt,
          worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, innerName),
          dimensions: defs.dimensions,
          singleDimensions: defs.singleDimensions,
          singleDimensionsRaw: defs.singleDimensionsRaw,
          isDigital: defs.isDigital,
          unitVolume: defs.unitVolume,
          totalVolume: defs.totalVolume,
          singleWeight: defs.singleWeight,
          weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
          container,
          location,
          isHiddenLocation,
          rawText: cleanedLine
        });
        return entries;
      }
    }

    // =========================================================================
    // Check for Coin Year Pattern (e.g. "1921 Morgan Dollar Coin", "1 1921 Morgan Dollar Coin", "1x 1921 Morgan Dollar Coin")
    // MANDATE: The year of a coin is NEVER its quantity!
    // =========================================================================
    const yearCoinPattern = /^(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:x\s*)?(.*)$/i;
    const yMatch = strippedScan.match(yearCoinPattern);
    if (yMatch) {
      const firstNum = parseFloat(yMatch[1].replace(/,/g, ''));
      const restText = yMatch[2].replace(/[\[\]]+$/, '').trim();

      // Check if restText starts with a 4-digit year like "1 1921 Morgan Dollar Coin" or "5x 1921 Morgan Dollar Coins"
      const secondNumMatch = restText.match(/^(\d{4})\b/);
      // Check if firstNum is itself a 4-digit year (1000 to 2999) without comma
      const isFirstNumYear = firstNum >= 1000 && firstNum <= 2999 && !yMatch[1].includes(',');

      const isCoinDenom = /^(?:morgan|peace|liberty|walking\s*liberty|saint[- ]gaudens|flowing\s*hair|seated\s*liberty|barber|mercury|buffalo|indian\s*head|steel|silver\s*dollar|trade\s*dollar|dollar|gold\s*coin|silver\s*coin|copper\s*coin|double\s*eagle|eagle|half\s*dollar|quarter|dime|nickel|penny|cent|sovereign|ducat|florin|denarius|drachma|shekel|thaler|peseta|peso|franc|mark|shilling|crown)\b/i;

      if (secondNumMatch) {
        // Example: "1 1921 Morgan Dollar Coin" or "5 1921 Morgan Dollar Coins"
        // firstNum is the actual quantity, restText is "1921 Morgan Dollar Coin"
        const amt = explicitQty !== null && explicitQty !== undefined ? explicitQty : firstNum;
        const cName = restText.replace(/[\[\]]+$/, '').replace(/:$/, '').trim();
        if (!WeightInventoryEngine.isContainerName(cName)) {
          const defs = this.inferCurrencyDefaults(cName, entryDimsStr, entryWeight, amt);
          entries.push({
            name: cName,
            amount: amt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, cName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: cleanedLine
          });
          return entries;
        }
      } else if (isFirstNumYear && isCoinDenom.test(restText)) {
        // Example: "1921 Morgan Dollar Coin"
        // 1921 is the YEAR in the coin's name! Quantity is 1!
        const amt = explicitQty !== null && explicitQty !== undefined ? explicitQty : 1;
        const cName = `${yMatch[1]} ${restText}`.replace(/:$/, '').trim();
        if (!WeightInventoryEngine.isContainerName(cName)) {
          const defs = this.inferCurrencyDefaults(cName, entryDimsStr, entryWeight, amt);
          entries.push({
            name: cName,
            amount: amt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, cName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: cleanedLine
          });
          return entries;
        }
      } else if (cleanedLine.includes('|') && restText && !secondNumMatch) {
        // Structured pipe format e.g. "1x Morgan Dollar | Worth: $1.00" or "50x Gold Coins | Worth: 50 GP"
        const isCurrencyName =
          /coin|dollar|morgan|peace|cent|penny|dime|nickel|quarter|credit|gold|silver|copper|electrum|platinum|ingot|bar|bullion|cash|money|chit|scrip|currency|drachma|denarius|florin|ducat|shekel|sovereign|crown|shilling|peso|peseta|franc|mark|thaler|yen|yuan|ruble|rupee|pound\s*sterling/i.test(restText) ||
          cleanedLine.toLowerCase().includes('worth:') ||
          cleanedLine.toLowerCase().includes('face value:') ||
          cleanedLine.toLowerCase().includes('market value:');

        if (isCurrencyName && !WeightInventoryEngine.isContainerName(restText)) {
          const amt = explicitQty !== null && explicitQty !== undefined ? explicitQty : firstNum;
          const cName = restText.replace(/:$/, '').trim();
          const defs = this.inferCurrencyDefaults(cName, entryDimsStr, entryWeight, amt);
          entries.push({
            name: cName,
            amount: amt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, cName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: cleanedLine
          });
          return entries;
        }
      }
    }

    // Dollar sign pattern: e.g. "$50", "-$20", "+$100", "$50 Cash", "-$20 (from wallet)"
    const dollarRegex = /[-+]?\s*[$]\s*(\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(cash|dollars?|bucks?|cents?|bills?|scrip))?/gi;
    let dMatch;
    while ((dMatch = dollarRegex.exec(contentToScan)) !== null) {
      const dAmt = parseFloat(dMatch[1].replace(/,/g, ''));
      if (!isNaN(dAmt) && dAmt > 0) {
        const subName = dMatch[2] ? (/cash/i.test(dMatch[2]) ? 'Cash' : (/scrip/i.test(dMatch[2]) ? 'Scrip' : 'Dollars')) : 'Dollars';
        if (!entries.some(e => e.amount === dAmt)) {
          const defs = this.inferCurrencyDefaults(subName, entryDimsStr, entryWeight, dAmt);
          entries.push({
            name: subName,
            amount: dAmt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || `$${dAmt.toFixed(2)}`, subName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: dMatch[0].trim()
          });
        }
      }
    }

    // Short coin notation pattern: e.g. "50gp", "15sp", "100cp", "5pp", "500cr" (with or without space)
    const shortCoinRegex = /\b([-+]?\d+(?:,\d+)*(?:\.\d+)?)\s*(gp|sp|cp|pp|cr)\b/gi;
    let scMatch;
    while ((scMatch = shortCoinRegex.exec(contentToScan)) !== null) {
      const sAmt = parseFloat(scMatch[1].replace(/,/g, ''));
      const sAbbr = scMatch[2].toUpperCase();
      if (!isNaN(sAmt) && sAmt > 0) {
        const fullNameMap: Record<string, string> = {
          GP: 'Gold Pieces',
          SP: 'Silver Pieces',
          CP: 'Copper Pieces',
          PP: 'Platinum Pieces',
          CR: 'Credits'
        };
        const sName = fullNameMap[sAbbr] || sAbbr;
        if (!entries.some(e => e.amount === sAmt && (e.name.toLowerCase() === sName.toLowerCase() || e.name.toLowerCase() === sAbbr.toLowerCase() || e.name.toLowerCase().includes(sAbbr.toLowerCase())))) {
          const defs = this.inferCurrencyDefaults(sName, entryDimsStr, entryWeight, sAmt);
          entries.push({
            name: sName,
            amount: sAmt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, sName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: scMatch[0].trim()
          });
        }
      }
    }

    // Comprehensive currency regex including Cash, Scrip, Cyber-Credits, Digital Credits / Electronic Scrip, etc.
    const currencyRegex = /([-+]?\s*\$?\s*\d+(?:,\d+)*(?:\.\d+)?)\s*(?:x\s*)?\[?([a-zA-Z\s\/-]+?(?:coins?|credits?|creds?|gold(?:\s+pieces?|\s+coins?)?|silver(?:\s+pieces?|\s+coins?)?|copper(?:\s+pieces?|\s+coins?)?|electrum(?:\s+pieces?|\s+coins?)?|platinum(?:\s+pieces?|\s+coins?)?|dollars?|bucks?|cash|scrip|cents?|caps?|crowns?|sovereigns?|ducats?|septims?|yen|euros?|rubles?|rupees?|zenny|gil|pieces?\s+of\s+eight|pieces?\s+of\s+(?:gold|silver|copper)|shillings?|pence|penny|\b(?:gp|sp|cp|pp|cr)\b)\b)/gi;

    let match;
    while ((match = currencyRegex.exec(contentToScan)) !== null) {
      const rawNum = match[1].replace(/[$,\s+-]/g, '');
      const rawAmt = parseFloat(rawNum);
      const name = match[2].replace(/^[-*•>\s]+|[-*\s\]]+$/g, '').trim();
      if (!isNaN(rawAmt) && rawAmt > 0 && name) {
        const lowerName = name.toLowerCase();
        if (
          lowerName.includes('inch') ||
          lowerName.includes('lbs') ||
          lowerName.includes('pound') ||
          lowerName.includes('weight') ||
          lowerName.includes('tall') ||
          lowerName.includes('wide') ||
          lowerName.includes('depth') ||
          lowerName.includes('m/s') ||
          lowerName.includes('damage') ||
          lowerName.includes('health') ||
          lowerName.includes('mana') ||
          lowerName.includes('stamina') ||
          lowerName.includes('energy') ||
          lowerName.includes('level') ||
          lowerName.includes('slot') ||
          lowerName.includes('round') ||
          lowerName.includes('turn')
        ) {
          continue;
        }

        let cleanName = name.replace(/^of\s+/i, '').trim();
        if (/^cash$/i.test(cleanName)) cleanName = 'Cash';
        if (/^scrip$/i.test(cleanName)) cleanName = 'Scrip';
        if (/^digital credits?$/i.test(cleanName) && cleanedLine.toLowerCase().includes('electronic scrip')) {
          cleanName = 'Digital Credits / Electronic Scrip';
        }

        // Check if rawAmt is a 4-digit coin mintage year (1000-2999) e.g. "1921 Morgan Dollar"
        let actualAmt = rawAmt;
        if (rawAmt >= 1000 && rawAmt <= 2999 && !rawNum.includes(',') && /^(?:morgan|peace|liberty|dollar|steel|gold|silver)/i.test(cleanName)) {
          cleanName = `${rawNum} ${cleanName}`;
          actualAmt = explicitQty !== null && explicitQty !== undefined ? explicitQty : 1;
        }

        if (WeightInventoryEngine.isContainerName(cleanName)) {
          if (!container) container = cleanName;
          continue;
        }

        const nextChars = contentToScan.substring(currencyRegex.lastIndex, currencyRegex.lastIndex + 30);
        if (/^\s*(?:chit\s*wallet|wallet|pouch|purse|clip|holder|bag|belt|case|box|container|cardholder|billfold)\b/i.test(nextChars)) {
          continue;
        }

        if (!entries.some(e => e.amount === actualAmt && (e.name.toLowerCase() === cleanName.toLowerCase() || (e.name === 'Dollars' && /dollar/i.test(cleanName))))) {
          const defs = this.inferCurrencyDefaults(cleanName, entryDimsStr, entryWeight, actualAmt);
          entries.push({
            name: cleanName,
            amount: actualAmt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, cleanName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: match[0].trim()
          });
        }
      }
    }

    // Also support prefix currency format: e.g. "Cash: $50" or "Gold Coins: 25" or "Money: $100"
    const prefixRegex = /\b(cash|money|dollars?|coins?|gold(?:\s+coins?)?|silver(?:\s+coins?)?|copper(?:\s+coins?)?|(?:cyber[- ]?)?credits?|scrip|funds?|wealth|balance)\s*[:=]\s*\$?\s*(\d+(?:,\d+)*(?:\.\d+)?)/gi;
    let pMatch;
    while ((pMatch = prefixRegex.exec(contentToScan)) !== null) {
      const pName = pMatch[1].trim();
      const pAmt = parseFloat(pMatch[2].replace(/,/g, ''));
      if (!isNaN(pAmt) && pAmt > 0) {
        const cleanName = /cash|money/i.test(pName) ? 'Cash' : (/scrip/i.test(pName) ? 'Scrip' : pName);
        if (WeightInventoryEngine.isContainerName(cleanName)) {
          if (!container) container = cleanName;
          continue;
        }
        if (!entries.some(e => e.amount === pAmt && e.name.toLowerCase() === cleanName.toLowerCase())) {
          const defs = this.inferCurrencyDefaults(cleanName, entryDimsStr, entryWeight, pAmt);
          entries.push({
            name: cleanName,
            amount: pAmt,
            worth: WeightInventoryEngine.sanitizeCurrencyWorth(entryWorthStr || defs.defaultWorth, cleanName),
            dimensions: defs.dimensions,
            singleDimensions: defs.singleDimensions,
            singleDimensionsRaw: defs.singleDimensionsRaw,
            isDigital: defs.isDigital,
            unitVolume: defs.unitVolume,
            totalVolume: defs.totalVolume,
            singleWeight: defs.singleWeight,
            weight: entryWeight !== undefined ? entryWeight : defs.totalWeight,
            container,
            location,
            isHiddenLocation,
            rawText: pMatch[0].trim()
          });
        }
      }
    }

    return entries.filter(e => !WeightInventoryEngine.isContainerName(e.name));
  }

  /**
   * Formats a list of currency entries into a clean aggregated summary string:
   * e.g. "1 Gold Coin, 5 Silver Coins" or "250 Credits" or "0"
   */
  public static formatCurrencySummary(entries: CurrencyEntry[]): string {
    if (!entries || entries.length === 0) return '0';
    // Uncountable / mass currency nouns that should NEVER have an 's' appended
    const UNCOUNTABLE = new Set(['cash', 'gold', 'silver', 'copper', 'platinum', 'electrum', 'money', 'scrip', 'currency', 'wealth', 'funds', 'yen', 'mana', 'credits']);

    const totals: { [name: string]: number } = {};
    for (const e of entries) {
      let norm = e.name;
      const lowerNorm = norm.toLowerCase();
      if (e.amount === 1) {
        norm = norm.replace(/\bCoins\b/i, 'Coin').replace(/\bCredits\b/i, 'Credit').replace(/\bDollars\b/i, 'Dollar');
      } else {
        if (!UNCOUNTABLE.has(lowerNorm)) {
          if (!lowerNorm.endsWith('s') && !lowerNorm.endsWith('coin') && !lowerNorm.endsWith('credit')) {
            norm = `${norm}s`;
          } else if (lowerNorm.endsWith('coin')) {
            norm = `${norm}s`;
          }
        }
      }
      totals[norm] = (totals[norm] || 0) + e.amount;
    }
    const parts = Object.entries(totals).map(([name, amt]) => {
      // User mandate: the year of the coin is in the name part, while amount is separate format
      if (/^\d{4}\b/i.test(name) || /morgan|dollar\s*coin|commemorative/i.test(name)) {
        return `${amt.toLocaleString()}x [${name}]`;
      }
      return `${amt.toLocaleString()} ${name}`;
    });
    return parts.length > 0 ? parts.join(', ') : '0';
  }

  /**
   * Parses weights in diverse formats:
   * - "feather 0 weight 3x0 inch" -> 0
   * - "Medium geode 1 pound and 3x5 inches" -> 1
   * - "2.5 lbs", "2.5 lb", "2.5 pounds", "10 kg", "500 grams", "0 weight", "None"
   */
  public static parseWeight(text: string): { weight: number; applies: boolean } {
    if (!text) return { weight: 0, applies: false };
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('none') ||
      lower.includes('incorporeal') ||
      lower.includes('ghost') ||
      lower.includes('intangible') ||
      lower.includes('energy') ||
      lower.includes('formless')
    ) {
      return { weight: 0, applies: false };
    }

    // Helper to clean commas in numbers
    const cleanNum = (val: string) => parseFloat(val.replace(/,/g, ''));
    const numRegex = '([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)';

    // Pattern 1: "X weight" or "0 weight"
    const weightWordMatch = lower.match(new RegExp(`${numRegex}\\s*(?:weight)`));
    if (weightWordMatch) {
      return { weight: cleanNum(weightWordMatch[1]), applies: true };
    }

    // Pattern 2: "X pound(s)" or "X lbs" or "X lb"
    const poundMatch = lower.match(new RegExp(`${numRegex}\\s*(?:lbs?|pounds?)`));
    if (poundMatch) {
      return { weight: cleanNum(poundMatch[1]), applies: true };
    }

    // Pattern 3: "Weight:\s*X"
    const colonWeightMatch = lower.match(new RegExp(`(?:weight|wt)[:=]\\s*${numRegex}`));
    if (colonWeightMatch) {
      return { weight: cleanNum(colonWeightMatch[1]), applies: true };
    }

    // Pattern 4: Kilograms "X kg"
    const kgMatch = lower.match(new RegExp(`${numRegex}\\s*(?:kg|kilograms?)`));
    if (kgMatch) {
      return { weight: cleanNum(kgMatch[1]) * 2.20462, applies: true };
    }

    // Pattern 5: Grams "X grams" / "X g"
    const gMatch = lower.match(new RegExp(`${numRegex}\\s*(?:grams?|g\\b)`));
    if (gMatch) {
      return { weight: cleanNum(gMatch[1]) * 0.00220462, applies: true };
    }

    // Pattern 6: Ounces "X oz"
    const ozMatch = lower.match(new RegExp(`${numRegex}\\s*(?:oz|ounces?)`));
    if (ozMatch) {
      return { weight: cleanNum(ozMatch[1]) * 0.0625, applies: true };
    }

    // Standalone number before/after common text
    const standaloneMatch = lower.match(new RegExp(`\\b${numRegex}\\s*(?:and|\\/|$)`));
    if (standaloneMatch && (lower.includes('weight') || lower.includes('heavy'))) {
      return { weight: cleanNum(standaloneMatch[1]), applies: true };
    }

    return { weight: 0, applies: true };
  }

  /**
   * Parses dimensions in diverse formats:
   * - "3x0 inch", "3x5 inches", "18x12 inches", "18x12x8 inches"
   * - "18 inches tall by 12 inches area", "18 inches tall x 12 inches width"
   * - "Height: 5'11", Width: 20", Depth: 12""
   * - "None" or "Incorporeal"
   */
  public static parseDimensions(text: string): ParsedDimensions {
    if (!text) return { raw: 'None', applies: false, unit: 'inches' };
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('none') ||
      lower.includes('incorporeal') ||
      lower.includes('ghost') ||
      lower.includes('formless')
    ) {
      return { raw: text, applies: false, unit: 'inches' };
    }

    let height: number | undefined;
    let width: number | undefined;
    let depth: number | undefined;

    // Pattern A: "18 inches tall by 12 inches area/wide" or "18 tall x 12 wide x 8 deep"
    const tallByMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:tall|height|long|length)\s*(?:by|x|\band\b)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:area|wide|width)?(?:\s*(?:by|x|\band\b)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:deep|depth)?)?/);
    if (tallByMatch) {
      height = parseFloat(tallByMatch[1]);
      width = parseFloat(tallByMatch[2]);
      if (tallByMatch[3]) depth = parseFloat(tallByMatch[3]);
      return { height, width, depth, raw: tallByMatch[0].trim(), applies: true, unit: 'inches' };
    }

    // Pattern B: "3x5x8" or "3x5" or "3 x 5 inches" or "3x0 inch"
    const xPattern = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*x\s*([0-9]+(?:\.[0-9]+)?)(?:\s*x\s*([0-9]+(?:\.[0-9]+)?))?\s*(?:in|inch|inches|cm|m|ft)?/);
    if (xPattern) {
      const dim1 = parseFloat(xPattern[1]);
      const dim2 = parseFloat(xPattern[2]);
      const dim3 = xPattern[3] ? parseFloat(xPattern[3]) : undefined;
      const cleanRaw = dim3 !== undefined ? `${dim1}x${dim2}x${dim3} inches` : `${dim1}x${dim2} inches`;
      return { height: dim1, width: dim2, depth: dim3, raw: cleanRaw, applies: true, unit: 'inches' };
    }

    // Pattern C: "Height: 5'11", Width: 20", Depth: 12"" or "Height: 6ft, Width: 2ft"
    const hMatch = lower.match(/height[:=\s]+([0-9]+)'?([0-9]+)?"?|\bheight[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:ft|feet|cm|m|in|inches)?/);
    if (hMatch) {
      if (hMatch[1] && hMatch[2]) {
        height = parseInt(hMatch[1]) * 12 + parseInt(hMatch[2]);
      } else if (hMatch[3]) {
        height = parseFloat(hMatch[3]);
        if (lower.includes('ft') || lower.includes('feet')) height *= 12;
        if (lower.includes('cm')) height /= 2.54;
        if (lower.includes('m') && !lower.includes('cm')) height *= 39.37;
      }
    }

    const wMatch = lower.match(/width[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches|cm|m|ft)?/);
    if (wMatch) {
      width = parseFloat(wMatch[1]);
      if (lower.includes('ft')) width *= 12;
      if (lower.includes('cm')) width /= 2.54;
    }

    const dMatch = lower.match(/depth[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches|cm|m|ft)?/);
    if (dMatch) {
      depth = parseFloat(dMatch[1]);
      if (lower.includes('ft')) depth *= 12;
      if (lower.includes('cm')) depth /= 2.54;
    }

    let cleanRaw = 'None';
    if (height !== undefined || width !== undefined || depth !== undefined) {
      const parts: string[] = [];
      if (height !== undefined) parts.push(`${height}"H`);
      if (width !== undefined) parts.push(`${width}"W`);
      if (depth !== undefined) parts.push(`${depth}"D`);
      cleanRaw = parts.join(' x ');
    } else {
      const dimMatch = text.match(/dimensions?[:=\s]+([^,;()\n]+)/i);
      if (dimMatch) {
        cleanRaw = dimMatch[1].trim();
      } else if (text.length <= 25 && !text.includes(':') && !text.toLowerCase().includes('overflow')) {
        cleanRaw = text.trim();
      } else {
        cleanRaw = 'Standard size';
      }
    }

    return {
      height,
      width,
      depth,
      raw: cleanRaw,
      applies: height !== undefined || width !== undefined || depth !== undefined || !lower.includes('none'),
      unit: 'inches'
    };
  }

  /**
   * Tests whether an item name or fragment is actually limb, handedness, or grip residue
   * (e.g. "Both Hands (Two-Handed Grip)", "Two-Handed Grip", "(Two-Handed)", "Right Hand", "Hands", "/ Arms").
   */
  public static isLimbOrGripResidue(name: string): boolean {
    if (!name) return true;
    const trimmed = name.trim().replace(/^\[|\]$/g, '').trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    if (
      lower === 'hands' ||
      lower === 'hand' ||
      lower === 'arms' ||
      lower === '/ arms' ||
      lower === 'two-handed' ||
      lower === '(two-handed)' ||
      lower === 'two-handed grip' ||
      lower === '(two-handed grip)' ||
      lower === 'both hands (two-handed grip)' ||
      lower === 'both hands (two-handed)' ||
      lower === 'both hands' ||
      lower === 'one-handed' ||
      lower === 'one-handed grip' ||
      lower === 'right hand' ||
      lower === 'left hand' ||
      lower === 'main hand' ||
      lower === 'off hand' ||
      lower === 'held in jaws' ||
      lower === 'held item' ||
      lower === 'two-handed weapon' ||
      lower === 'overflow hold'
    ) {
      return true;
    }
    return /^(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|both\s*hands(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|one[- ]handed(?:\s*grip)?|\(one[- ]handed(?:\s*grip)?\)|grip|\/\s*arms?|arms?|hands?|held\s*item|two[- ]handed\s*weapon|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow(?:\s*hold)?)$/i.test(trimmed);
  }

  /**
   * Unwraps recursively nested held item strings and detects the true holding limb and item description.
   * Cleans chains like "Hands: Weight: 0.2 lbs. Dimensions: Hands: Weight: ... Held in Jaws: ... Red Rubber Ball..."
   * Also filters out rule lines, mandates, status headers, and repeated overflow warnings.
   */
  public static unwrapHeldItem(rawText: string, defaultLimb: string = 'Hands'): { cleanText: string; holdingLimb: string; isOverflow: boolean } | null {
    let text = rawText.trim().replace(/^[-*•>\s]+/, '').trim();
    const lower = text.toLowerCase();

    // 1. Immediately reject rule / mandate / guideline / capacity / header lines
    if (
      lower.startsWith('holding anatomy') ||
      lower.startsWith('holding capacity') ||
      lower.startsWith('capacity & status') ||
      lower.startsWith('capacity status') ||
      lower.startsWith('holding status') ||
      lower.startsWith('- capacity') ||
      lower.startsWith('capacity:') ||
      lower.startsWith('hand slots & starting capacity') ||
      lower.startsWith('- hand slots & starting capacity') ||
      lower.startsWith('slots & starting capacity') ||
      lower.startsWith('- slots & starting capacity') ||
      lower.startsWith('hand slots') ||
      lower.startsWith('- hand slots') ||
      lower.startsWith('starting capacity') ||
      lower.startsWith('- starting capacity') ||
      lower.includes('hand slots & starting capacity') ||
      lower.includes('slots & starting capacity') ||
      lower.startsWith('items currently held') ||
      lower.startsWith('held items') ||
      lower.startsWith('currently holding') ||
      lower.includes('overflow rule') ||
      lower.includes('overflow mechanics') ||
      lower.includes('overflow strain') ||
      lower.includes('weight & size scaling') ||
      lower.includes('scaled accidental drop') ||
      lower.includes('scaled random chance') ||
      lower.includes('starting carried items limit') ||
      lower.includes('starting carrying limit') ||
      lower.includes('starting carrying items limit') ||
      lower.includes('during adventure rule') ||
      lower.includes('holding anatomy') ||
      lower.includes('holding limbs') ||
      lower.includes('holding appendages') ||
      lower.startsWith('anatomy:') ||
      lower.startsWith('- anatomy') ||
      lower.startsWith('* anatomy') ||
      lower.includes('2 hands / arms (humanoid)') ||
      lower.includes('dynamic overflow') ||
      lower.includes('weight mandate') ||
      lower.includes('capacity mandate') ||
      lower.includes('holding mandate') ||
      lower.includes('weight & capacity') ||
      lower.includes('cannot hold additional') ||
      lower.includes('occupied by') ||
      lower.includes('without dropping') ||
      lower.includes('(none') ||
      lower.includes('appendages free') ||
      lower.includes('hands free') ||
      lower === 'none' ||
      lower === '(none)' ||
      /^[-\s*•]*\d+\.\s*(?:overflow|weight|context|drop)/i.test(rawText)
    ) {
      return null;
    }

    let detectedLimb = defaultLimb;
    let explicitOverflow = false;

    // Detect if "Held in Jaws", "Jaws", "Mouth", "Right Hand", "Left Hand", "Both Hands (Two-Handed Grip)", etc. is mentioned in the line
    const limbSearch = text.match(/\b(held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+teeth|held\s+in\s+beak|held\s+in\s+talons?|held\s+in\s+hands?|in\s+jaws?|in\s+mouth|both\s+hands\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip)?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|right\s+hand(?:\s*\(one[- ]handed(?:\s*grip)?\))?|left\s+hand(?:\s*\(one[- ]handed(?:\s*grip)?\))?|main\s+hand(?:\s*grip)?|off\s+hand(?:\s*grip)?|jaws?|mouth|teeth|beak|talons?|tentacles?\s*\d*|claws?\s*\d*|trunk|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold|hands?)\b/i);
    if (limbSearch) {
      const matchLower = limbSearch[1].toLowerCase();
      if (matchLower.includes('jaw') || matchLower.includes('mouth') || matchLower.includes('teeth')) {
        detectedLimb = 'Held in Jaws';
      } else if (matchLower.includes('both hands') || matchLower.includes('two-handed')) {
        detectedLimb = 'Both Hands (Two-Handed)';
      } else if (matchLower.includes('right hand')) {
        detectedLimb = 'Right Hand';
      } else if (matchLower.includes('left hand')) {
        detectedLimb = 'Left Hand';
      } else if (matchLower.includes('main hand')) {
        detectedLimb = 'Main Hand';
      } else if (matchLower.includes('off hand')) {
        detectedLimb = 'Off Hand';
      } else if (matchLower.includes('beak')) {
        detectedLimb = 'Beak';
      } else if (matchLower.includes('talon')) {
        detectedLimb = 'Talons';
      } else if (matchLower.includes('tentacle')) {
        detectedLimb = 'Tentacles';
      } else if (matchLower.includes('claws')) {
        detectedLimb = 'Claws';
      } else if (matchLower.includes('trunk')) {
        detectedLimb = 'Trunk';
      } else if ((matchLower.includes('overflow hold') || matchLower.includes('under arm')) && !/\b(no\s*overflow|0\s*overflow|overflow:\s*no)\b/i.test(text)) {
        detectedLimb = 'Overflow Hold';
        explicitOverflow = true;
      } else if (matchLower.includes('hand')) {
        detectedLimb = defaultLimb.toLowerCase().includes('jaw') || defaultLimb.toLowerCase().includes('mouth') ? defaultLimb : 'Hands';
      }
    }

    // 2. Iteratively strip leading limb, handedness, brackets, grip, and wrapper prefixes
    let prevText = '';
    while (text !== prevText) {
      prevText = text;
      text = text
        .replace(/^[-*•>\s]+/, '')
        .replace(/^\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow(?:\s*hold)?)\](?:\s*(?:\/\s*arms?|\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|grip))?\s*[:=-]?\s*/i, '')
        .replace(/^(?:(?:right|left|main|off|both)\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|both\s*hands(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|one[- ]handed(?:\s*grip)?|\(one[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold|hands?)(?:\s*(?:\/\s*arms?|\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|grip))?\s*[:=-]\s*/i, '')
        .replace(/^(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip)\s*[:=-]?\s*/i, '')
        .trim();
    }

    // If after stripping limb prefixes, text immediately starts with Weight: or dimensions (meaning the original line omitted the item name, e.g. "* [Both Hands (Two-Handed)] (Two-Handed): Weight: 20 lbs..."):
    if (/^(?:weight\s*[:=]|\b[0-9]+(?:\.[0-9]+)?\s*(?:lbs?|pounds?|kg|oz)\b|dimensions?\s*[:=])/i.test(text)) {
      const fallbackName = detectedLimb.includes('Two-Handed') ? 'Two-Handed Weapon' : 'Held Item';
      text = `${fallbackName}: ${text}`;
    }

    // 3. Strip trailing repeated overflow warnings
    text = text.replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '').trim();
    // Clean multiple trailing periods
    text = text.replace(/\.{2,}$/, '.').trim();

    // 4. Check if the remaining core text is a rule, mandate, or empty
    const cleanLower = text.toLowerCase();
    if (
      cleanLower.startsWith('dynamic overflow rule') ||
      cleanLower.startsWith('weight & capacity mandate') ||
      cleanLower.startsWith('overflow rule') ||
      cleanLower.startsWith('weight mandate') ||
      cleanLower.startsWith('capacity mandate') ||
      cleanLower.startsWith('slots & starting capacity') ||
      cleanLower.startsWith('hand slots & starting capacity') ||
      cleanLower.startsWith('hand slots') ||
      cleanLower.startsWith('starting capacity') ||
      cleanLower.includes('slots & starting capacity') ||
      cleanLower.includes('hand slots') ||
      cleanLower.includes('starting carrying limit') ||
      cleanLower.includes('jaws are occupied') ||
      cleanLower.includes('held in jaws..') ||
      cleanLower.includes('held in mouth without dropping') ||
      cleanLower === 'hands' ||
      cleanLower === 'hand' ||
      cleanLower === '(two-handed)' ||
      cleanLower === 'two-handed' ||
      cleanLower === '(two-handed grip)' ||
      cleanLower === 'two-handed grip' ||
      cleanLower === 'both hands (two-handed grip)' ||
      cleanLower === 'both hands (two-handed)' ||
      cleanLower === '/ arms' ||
      cleanLower === 'arms' ||
      cleanLower === '' ||
      WeightInventoryEngine.isLimbOrGripResidue(text)
    ) {
      return null;
    }

    return {
      cleanText: text,
      holdingLimb: detectedLimb,
      isOverflow: explicitOverflow
    };
  }

  /**
   * Determines whether an item is pliable, flexible, or foldable (e.g. leather tunic, cloth clothing,
   * cloaks, robes, bedrolls, blankets, ropes, bandages, parchment) versus a rigid item
   * (e.g. iron armor, steel plate, breastplate, shield, helmet, sword, staff, chest).
   *
   * Foldable items fold and compress to fit inside containers and do NOT cause overflow
   * simply because their flat unfolded dimensions exceed the container dimensions.
   */
  public static isFoldableItem(name: string, rawText: string = ''): boolean {
    const text = `${name} ${rawText}`.toLowerCase();

    // Explicit rigidity markers
    if (
      text.includes('rigid') ||
      text.includes('inflexible') ||
      text.includes('unbendable') ||
      text.includes('solid metal') ||
      text.includes('solid wood') ||
      text.includes('solid stone')
    ) {
      return false;
    }

    // Explicit foldability & pliable granular markers (coins, currency, arrows in quiver, soft goods)
    if (
      text.includes('foldable') ||
      text.includes('folded') ||
      text.includes('flexible') ||
      text.includes('pliable') ||
      text.includes('rollable') ||
      text.includes('rolled') ||
      text.includes('soft') ||
      text.includes('coin') ||
      text.includes('currency') ||
      text.includes('money') ||
      text.includes('cash') ||
      text.includes('gold') ||
      text.includes('silver') ||
      text.includes('copper') ||
      text.includes('credits') ||
      text.includes('arrow') ||
      text.includes('bolt') ||
      text.includes('quiver') ||
      text.includes('ammunition') ||
      text.includes('ammo')
    ) {
      return true;
    }

    // Rigid armor & items (cannot fold down to fit)
    if (
      text.includes('iron armor') ||
      text.includes('steel armor') ||
      text.includes('plate armor') ||
      text.includes('breastplate') ||
      text.includes('cuirass') ||
      text.includes('full plate') ||
      text.includes('plate mail') ||
      text.includes('metal armor') ||
      text.includes('chainmail') ||
      text.includes('shield') ||
      text.includes('helmet') ||
      text.includes('helm') ||
      text.includes('greathelm') ||
      text.includes('sword') ||
      text.includes('blade') ||
      text.includes('staff') ||
      text.includes('stave') ||
      text.includes('spear') ||
      text.includes('polearm') ||
      text.includes('halberd') ||
      text.includes('mace') ||
      text.includes('warhammer') ||
      (/\b(?:longbow|shortbow|crossbow|recurve\s*bow|composite\s*bow)\b/i.test(text) && !text.includes('arrow') && !text.includes('quiver')) ||
      text.includes('chest') ||
      text.includes('crate') ||
      text.includes('vial') ||
      text.includes('bottle') ||
      text.includes('flask') ||
      text.includes('ingot') ||
      text.includes('anvil') ||
      text.includes('statue') ||
      text.includes('lantern')
    ) {
      return false;
    }

    // Pliable/foldable clothing and soft gear
    if (
      text.includes('tunic') || // e.g. "Reinforced Leather Tunic"
      text.includes('leather tunic') ||
      text.includes('leather jacket') ||
      text.includes('leather vest') ||
      text.includes('robe') ||
      text.includes('cloak') ||
      text.includes('cape') ||
      text.includes('shirt') ||
      text.includes('pants') ||
      text.includes('trousers') ||
      text.includes('vest') ||
      text.includes('garment') ||
      text.includes('clothing') ||
      text.includes('clothes') ||
      text.includes('dress') ||
      text.includes('skirt') ||
      text.includes('shawl') ||
      text.includes('scarf') ||
      text.includes('blanket') ||
      text.includes('bedroll') ||
      text.includes('sleeping bag') ||
      text.includes('cloth') ||
      text.includes('fabric') ||
      text.includes('linen') ||
      text.includes('silk') ||
      text.includes('cotton') ||
      text.includes('wool') ||
      text.includes('pelt') ||
      text.includes('hide') ||
      text.includes('fur') ||
      text.includes('rope') ||
      text.includes('bandages') ||
      text.includes('bandage') ||
      text.includes('parchment') ||
      text.includes('paper') ||
      text.includes('scroll') ||
      text.includes('sack') ||
      text.includes('pouch') ||
      text.includes('bag')
    ) {
      return true;
    }

    // Leather items without plate/rigid terms are pliable
    if (text.includes('leather') && !text.includes('hardened plate') && !text.includes('rigid')) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates container elasticity and stretch factor dynamically:
   * - AI-driven: reads explicit stretch multipliers (e.g. "Stretch: 1.5x", "1.3x stretch", "Elasticity: 1.4x", "Capacity: 1.5x")
   * - Rigid containers: reads explicit rigid tags (e.g. "Rigid (1.0x)", "Rigid", "Hard-shell") or rigid context (1.0x space max)
   * - Stretchable containers: expands up to the AI-defined multiplier (e.g. wallet = 1.5x, pouch = 1.3x, soft bag = 1.25x)
   */
  public static getContainerStretchability(containerName: string, rawText: string = ''): {
    isRigid: boolean;
    stretchFactor: number;
    description: string;
  } {
    const combined = `${containerName} ${rawText}`.toLowerCase();

    // 1. Explicit stretch/elasticity/multiplier tag set dynamically by AI or context:
    // e.g. "stretch: 1.5x", "stretch: 1.3", "1.5x stretch", "max stretch: 1.5x", "elasticity: 1.4x"
    const explicitStretch = combined.match(/(?:stretch(?:able|ability)?|elastic(?:ity)?|expand(?:able|ability)?|flex(?:ibility)?|hold\s*(?:multiplier|factor)|stretch\s*factor|capacity\s*multiplier)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*x?/i)
      || combined.match(/([0-9]+(?:\.[0-9]+)?)\s*x\s*(?:stretch|elastic|expandable)/i);
    if (explicitStretch) {
      const factor = parseFloat(explicitStretch[1]);
      if (factor <= 1.0) {
        return { isRigid: true, stretchFactor: 1.0, description: 'Rigid container (1.0x capacity max)' };
      }
      return {
        isRigid: false,
        stretchFactor: Math.round(factor * 100) / 100,
        description: `Stretchable container (${factor}x capacity max)`
      };
    }

    // 2. Explicit rigid notation (e.g. "rigid: yes", "rigid (1.0x)", "rigid", "hard-sided", "inflexible")
    if (/(?:^|[^a-z])(?:rigid|hard[- ]sided|inflexible|solid|unyielding|stiff)(?:[^a-z]|$)/i.test(combined)) {
      return { isRigid: true, stretchFactor: 1.0, description: 'Rigid container (1.0x capacity max)' };
    }

    // 3. Dynamic contextual fallback based on container name/context:
    // Hard/rigid materials/containers:
    if (/\b(?:box|chest|crate|bottle|vial|safe|cage)\b/i.test(combined)) {
      return { isRigid: true, stretchFactor: 1.0, description: 'Rigid container (1.0x capacity max)' };
    }

    // Wallets & bankrolls: 1.5x dynamic default
    if (/\b(?:wallet|billfold|bankroll)\b/i.test(combined)) {
      return { isRigid: false, stretchFactor: 1.5, description: 'Stretchable wallet / bankroll (1.5x max space)' };
    }

    // Pouches & coin purses: 1.3x dynamic default
    if (/\b(?:pouch|purse)\b/i.test(combined)) {
      return { isRigid: false, stretchFactor: 1.3, description: 'Stretchable pouch (1.3x max space)' };
    }

    // General flexible / soft containers: 1.25x
    return { isRigid: false, stretchFactor: 1.25, description: 'Stretchable container (1.25x max space)' };
  }

  /**
   * Dynamically updates a container's physical size and dimensions based on how much it is stretched.
   * If current volume exceeds max base volume (while within effectiveMaxVolume):
   * - Calculates currentStretchRatio = currentVolume / maxVolume
   * - Dynamically expands dimensions (bulging thickness/depth and overall size based on stretch ratio)
   * - Updates cont.stretchedDimensions and cont.currentDimensions
   */
  public static updateContainerStretchDimensions(cont: ContainerInfo): void {
    if (!cont.maxVolume || cont.maxVolume <= 0 || !cont.currentVolume || cont.currentVolume <= cont.maxVolume) {
      cont.isStretched = false;
      cont.currentStretchRatio = 1.0;
      cont.currentDimensions = cont.dimensions;
      cont.stretchedDimensions = undefined;
      return;
    }

    cont.isStretched = true;
    const maxStretch = cont.stretchFactor || 1.3;
    const rawRatio = cont.currentVolume / cont.maxVolume;
    const stretchRatio = Math.round(Math.min(rawRatio, maxStretch) * 100) / 100;
    cont.currentStretchRatio = stretchRatio;

    const baseH = cont.dimensions?.height || 12;
    const baseW = cont.dimensions?.width || 8;
    const baseD = cont.dimensions?.depth || 4;
    const unit = cont.dimensions?.unit || 'inches';

    let stretchedH = baseH;
    let stretchedW = baseW;
    let stretchedD = baseD;

    if (baseD <= 1.5 || baseD < Math.min(baseH, baseW) / 2) {
      // Thin / flat container (wallet, pouch, pocket, bankroll):
      // Stretches primarily by bulging outward in depth/thickness, with slight strain on height and width
      const sDepth = Math.pow(stretchRatio, 0.7);
      const sFace = Math.pow(stretchRatio, 0.15);
      stretchedH = Math.round(baseH * sFace * 10) / 10;
      stretchedW = Math.round(baseW * sFace * 10) / 10;
      stretchedD = Math.round(baseD * sDepth * 10) / 10;
      if (stretchedD <= baseD) {
        stretchedD = Math.round(baseD * stretchRatio * 10) / 10;
      }
    } else {
      // 3D volumetric container (backpack, bag, sack):
      // Expands uniformly in 3D volume based on cube root of stretch ratio
      const k = Math.cbrt(stretchRatio);
      stretchedH = Math.round(baseH * k * 10) / 10;
      stretchedW = Math.round(baseW * k * 10) / 10;
      stretchedD = Math.round(baseD * k * 10) / 10;
    }

    const stretchedRaw = `${stretchedH}x${stretchedW}x${stretchedD} ${unit}`;
    cont.stretchedDimensions = {
      height: stretchedH,
      width: stretchedW,
      depth: stretchedD,
      raw: stretchedRaw,
      applies: true,
      unit
    };
    cont.currentDimensions = cont.stretchedDimensions;

    // Enforce invariant: When containers stretch, ONLY multiply and expand physical size/dimensions.
    // NEVER multiply or increase the container's own empty tare weight with it!
    // cont.weight remains strictly the base empty weight.
  }

  /**
   * Evaluates container fit and overflow:
   * 1. Foldable items (leather tunic, cloth clothing, robes, cloaks, blankets) fold and compress
   *    to fit inside containers without overflowing, provided total container volume/weight is not exceeded.
   * 2. Rigid items (iron armor, plate, shields, staves, spears) cannot fold.
   * 3. Cannot Fit Rule: "If an item has all dimensions bigger than smallest dimension of the container
   *    then it doesn't fit at all in first place." (i.e. even its smallest dimension exceeds the container's
   *    smallest dimension; it cannot enter or fit inside).
   * 4. Protruding Overflow Rule: If a rigid item can enter (its cross section fits through the opening),
   *    but its length exceeds container depth (e.g. 60-inch staff in 18-inch backpack), it protrudes/overflows
   *    and risks dropping during movement or combat.
   * 5. Elasticity / Stretchability: Rigid containers hold strictly 1.0x their volume. Stretchable containers
   *    (wallets = 1.5x, pouches = 1.3x) can stretch beyond base space up to their multiplier before overflowing.
   */
  public static checkContainerFit(
    item: { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string },
    containerMaxDim: ParsedDimensions,
    containerCapacity?: {
      maxWeight?: number;
      currentWeight?: number;
      maxVolume?: number;
      currentVolume?: number;
      stretchFactor?: number;
      effectiveMaxVolume?: number;
      isRigid?: boolean;
    }
  ): {
    canFit: boolean;
    isOverflow: boolean;
    doesNotFit: boolean;
    isFoldable: boolean;
    isStretched?: boolean;
    status: 'fits' | 'overflow' | 'does_not_fit';
    reason?: string;
  } {
    const rawText = (item.rawText || '').toLowerCase();
    const isFoldable = this.isFoldableItem(item.name, item.rawText);

    // Check explicit narrative tags in raw text
    if (rawText.includes('does not fit') || rawText.includes('cannot fit') || rawText.includes('too big to enter')) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable,
        status: 'does_not_fit',
        reason: 'Item explicitly does not fit inside container.'
      };
    }
    if (rawText.includes('overflow: yes') || rawText.includes('overflowing') || rawText.includes('sticks out') || rawText.includes('protruding')) {
      return {
        canFit: true,
        isOverflow: true,
        doesNotFit: false,
        isFoldable,
        status: 'overflow',
        reason: 'Item protrudes from container opening; risks falling or dropping.'
      };
    }

    if (!item.dimensions.applies || !containerMaxDim.applies) {
      return { canFit: true, isOverflow: false, doesNotFit: false, isFoldable, status: 'fits' };
    }

    const itemDims = [item.dimensions.height || 0, item.dimensions.width || 0, item.dimensions.depth || 0]
      .filter(d => d > 0)
      .sort((a, b) => b - a);
    const contDims = [containerMaxDim.height || 0, containerMaxDim.width || 0, containerMaxDim.depth || 0]
      .filter(d => d > 0)
      .sort((a, b) => b - a);

    if (itemDims.length === 0 || contDims.length === 0) {
      return { canFit: true, isOverflow: false, doesNotFit: false, isFoldable, status: 'fits' };
    }

    const cMax = contDims[0];
    const cMid = contDims.length > 1 ? contDims[1] : contDims[0];
    const cMin = contDims[contDims.length - 1]; // Smallest dimension of the container!

    // Check container weight limit if provided
    if (containerCapacity?.maxWeight && containerCapacity.maxWeight > 0) {
      const current = containerCapacity.currentWeight || 0;
      const itWeight = item.weight || 0;
      if (current + itWeight > containerCapacity.maxWeight) {
        return {
          canFit: true,
          isOverflow: true,
          doesNotFit: false,
          isFoldable,
          status: 'overflow',
          reason: `Container weight capacity exceeded (${current + itWeight} lbs > ${containerCapacity.maxWeight} lbs max).`
        };
      }
    }

    // Check container volume limit with stretchability / elasticity
    const itemVol = itemDims.reduce((a, b) => a * b, 1);
    let itemIsStretched = false;
    if (containerCapacity?.maxVolume && containerCapacity.maxVolume > 0) {
      const baseVol = containerCapacity.maxVolume;
      const curVol = containerCapacity.currentVolume || 0;
      const isRigid = containerCapacity.isRigid ?? false;
      const stretchFactor = containerCapacity.stretchFactor || (isRigid ? 1.0 : 1.15);
      const effectiveMaxVol = containerCapacity.effectiveMaxVolume || Math.round(baseVol * stretchFactor * 100) / 100;

      if (curVol + itemVol > effectiveMaxVol) {
        if (isRigid) {
          return {
            canFit: true,
            isOverflow: true,
            doesNotFit: false,
            isFoldable,
            status: 'overflow',
            reason: `Rigid container cannot stretch (strictly 1.0x space max). Exceeded volume capacity (${Math.round((curVol + itemVol) * 10) / 10} cu in > ${Math.round(baseVol * 10) / 10} cu in max).`
          };
        } else {
          return {
            canFit: true,
            isOverflow: true,
            doesNotFit: false,
            isFoldable,
            status: 'overflow',
            reason: `Container exceeded maximum stretch capacity (${Math.round((curVol + itemVol) * 10) / 10} cu in > ${Math.round(effectiveMaxVol * 10) / 10} cu in at ${stretchFactor}x max stretch). Items overflow!`
          };
        }
      } else if (curVol + itemVol > baseVol) {
        itemIsStretched = true;
      }
    }

    // 1. Foldable / Pliable items (e.g. Leather Tunic, Cloak, Robes, Clothes, Blankets, Ropes)
    if (isFoldable) {
      // Foldable items fold and compress to fit inside typical containers.
      // They do NOT overflow simply because flat unfolded length/width exceeds the container.
      const itemVol = itemDims.reduce((a, b) => a * b, 1);
      const contVol = contDims.reduce((a, b) => a * b, 1);

      // Only if raw uncompressed material volume itself exceeds the container internal volume by a wide margin
      if (contVol > 0 && itemVol > contVol * 1.5) {
        return {
          canFit: false,
          isOverflow: false,
          doesNotFit: true,
          isFoldable: true,
          status: 'does_not_fit',
          reason: `Folded volume of item exceeds total container volume.`
        };
      }

      return {
        canFit: true,
        isOverflow: false,
        doesNotFit: false,
        isFoldable: true,
        status: 'fits',
        reason: 'Item is flexible and folds cleanly to fit inside container.'
      };
    }

    // 2. Rigid items (e.g. Iron Armor, Steel Breastplate, Shield, Staff, Spear, Greatsword, Chest)
    // CRITICAL MANDATE: "If an item has all dimensions bigger than smallest dimension of the container then it doesn't fit at all in first place."
    const allDimsExceedCMin = itemDims.every(d => d > cMin);
    if (allDimsExceedCMin) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable: false,
        status: 'does_not_fit',
        reason: `Rigid item has all dimensions (${itemDims.join('x')}") larger than container's smallest dimension (${cMin}"). It cannot enter or fit in the container at all!`
      };
    }

    const iMax = itemDims[0];
    const iMid = itemDims.length > 1 ? itemDims[1] : itemDims[0];

    // Check if the rigid item's cross-section is too wide to enter the container opening
    if (iMid > cMid && iMid > cMax) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable: false,
        status: 'does_not_fit',
        reason: `Rigid item cannot fold; width (${iMid}") exceeds container opening (${cMid}"). Does not fit in container.`
      };
    }

    // If rigid item can enter the opening, but its length exceeds container depth/max dimension:
    // It cannot fold down, so it protrudes/overflows out the opening (e.g. staff, spear, greatsword sticking out of backpack).
    if (cMax > 0 && iMax > cMax) {
      return {
        canFit: true,
        isOverflow: true,
        doesNotFit: false,
        isFoldable: false,
        status: 'overflow',
        reason: `Rigid item cannot fold; length (${iMax}") exceeds container depth (${cMax}"). It protrudes out of the container and risks dropping!`
      };
    }

    return {
      canFit: true,
      isOverflow: false,
      doesNotFit: false,
      isFoldable: false,
      status: 'fits'
    };
  }

  /**
   * Backwards-compatible checkOverflow delegating to checkContainerFit.
   */
  public static checkOverflow(
    itemDimOrItem: ParsedDimensions | { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string },
    containerMaxDim: ParsedDimensions,
    itemName?: string
  ): {
    isOverflow: boolean;
    doesNotFit?: boolean;
    canFit?: boolean;
    isFoldable?: boolean;
    reason?: string;
  } {
    const item = 'raw' in itemDimOrItem && 'applies' in itemDimOrItem
      ? { name: itemName || 'Item', dimensions: itemDimOrItem as ParsedDimensions }
      : itemDimOrItem as { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string };

    const fit = this.checkContainerFit(item, containerMaxDim);
    return {
      isOverflow: fit.isOverflow,
      doesNotFit: fit.doesNotFit,
      canFit: fit.canFit,
      isFoldable: fit.isFoldable,
      reason: fit.reason
    };
  }

  /**
   * Calculates an item's vulnerability/risk score for slipping or being dropped accidentally when in overflow.
   * Scaled so that heavier and bigger (longer/bulkier) items have a significantly higher score than smaller, lighter ones.
   */
  public static calculateItemDropRisk(item: { weight?: number; dimensions?: ParsedDimensions }): number {
    const weight = Math.max(0.1, item.weight !== undefined && !isNaN(item.weight) ? item.weight : 0.5);

    // Extract dimensions
    let maxDim = 4; // default minimum baseline 4 inches
    let volumeEst = 8; // default baseline cubic inches
    if (item.dimensions) {
      const h = item.dimensions.height || 0;
      const w = item.dimensions.width || 0;
      const d = item.dimensions.depth || 0;
      const validDims = [h, w, d].filter(v => v > 0);
      if (validDims.length > 0) {
        maxDim = Math.max(2, ...validDims);
        volumeEst = validDims.reduce((acc, val) => acc * Math.max(0.5, val), 1);
      }
    }

    // Weight factor: scales progressively (heavier items are much harder to balance awkwardly)
    // Small dagger / feather (0.1 - 1 lb) -> 0.3 - 1.0
    // Longsword / Shield (3 - 6 lbs) -> 2.2 - 3.8
    // Warhammer / Greatsword / Plate (8 - 25 lbs) -> 4.7 - 11.2
    const weightFactor = Math.pow(weight, 0.75);

    // Dimension / Size factor: scales with maximum dimension and cubic bulk
    // Longer/bulkier items catch on scenery, terrain, limbs, and lack secure grip
    const lengthFactor = Math.max(0.5, maxDim / 12); // relative to 1 foot
    const bulkFactor = Math.pow(Math.max(1, volumeEst) / 64, 0.33); // relative to 4x4x4" block
    const sizeFactor = lengthFactor * bulkFactor;

    // Combined risk index
    const risk = weightFactor * sizeFactor;
    return Math.max(0.1, Math.round(risk * 100) / 100);
  }

  /**
   * Calculates the overall accidental drop chance and per-item drop probability for all items in overflow.
   *
   * User mandate:
   * "the more items added to overflow and the heavier and bigger each item, the bigger chance of dropping
   *  by accident based on context and the scaled random chance which scales for heavier bigger items
   *  and bigger heavier items have higher chance of dropping than smaller/lighter ones."
   *
   * @param overflowItems Array of items currently in overflow (held or in containers)
   * @param context Strenuousness of the situation ('calm' | 'normal' | 'strenuous' | 'combat' or custom numeric multiplier)
   */
  public static calculateOverflowDropProbabilities(
    overflowItems: Array<ItemInfo | HeldItemInfo>,
    context: 'calm' | 'normal' | 'strenuous' | 'combat' | number = 'normal'
  ): {
    overallChancePercent: number;
    totalOverflowCount: number;
    itemDropChances: Array<{
      item: ItemInfo | HeldItemInfo;
      dropChancePercent: number;
      riskScore: number;
      relativeWeightPercent: number;
    }>;
  } {
    const totalOverflowCount = overflowItems.length;
    if (totalOverflowCount === 0) {
      return {
        overallChancePercent: 0,
        totalOverflowCount: 0,
        itemDropChances: []
      };
    }

    // Context multiplier:
    // calm: standing, resting, light dialogue
    // normal: walking, searching, examining, routine tasks
    // strenuous: jogging, climbing, jumping, hauling, dodging
    // combat: melee fighting, sprinting, taking hits, explosive collisions
    let contextMult = 1.0;
    if (typeof context === 'number') {
      contextMult = Math.max(0.2, context);
    } else if (context === 'calm') {
      contextMult = 0.5;
    } else if (context === 'strenuous') {
      contextMult = 1.6;
    } else if (context === 'combat') {
      contextMult = 2.4;
    }

    // 1. More items added to overflow -> scales overall chance up!
    // Base chance starts at 15% with 1 item, and increases by ~12% per additional overflow item
    const countScaling = 15 + (totalOverflowCount - 1) * 12;

    // 2. Individual item risk calculation (heavier and bigger items have higher risk score)
    const itemRisks = overflowItems.map(item => {
      const risk = WeightInventoryEngine.calculateItemDropRisk(item);
      return { item, risk };
    });

    const totalRiskScore = itemRisks.reduce((sum, r) => sum + r.risk, 0);
    const avgRiskScore = totalRiskScore / totalOverflowCount;

    // Heavier/bulkier overall load increases the baseline chance:
    // Baseline avgRisk ~ 1.0 for medium items; heavy loads scale this up
    const loadWeightSizeMultiplier = Math.min(2.5, Math.max(0.6, 0.6 + avgRiskScore * 0.4));

    // Calculate overall accidental drop chance in this turn/action
    const rawOverallChance = countScaling * contextMult * loadWeightSizeMultiplier;
    const overallChancePercent = Math.min(95, Math.max(5, Math.round(rawOverallChance)));

    // 3. Scaled random chance per item:
    // Bigger and heavier items have a significantly HIGHER chance of dropping than smaller/lighter ones!
    const itemDropChances = itemRisks.map(({ item, risk }) => {
      const relativeWeight = totalRiskScore > 0 ? (risk / totalRiskScore) : (1 / totalOverflowCount);
      const relativeWeightPercent = Math.round(relativeWeight * 1000) / 10;

      // Each item's individual drop probability if tested:
      // An item's individual chance scales with its relative weight/size share
      const itemChance = Math.min(95, Math.max(3, Math.round(overallChancePercent * relativeWeight * Math.min(2.5, Math.sqrt(totalOverflowCount)))));

      return {
        item,
        riskScore: risk,
        dropChancePercent: itemChance,
        relativeWeightPercent
      };
    });

    // Sort item chances descending so the heaviest/biggest items are listed first
    itemDropChances.sort((a, b) => b.dropChancePercent - a.dropChancePercent);

    return {
      overallChancePercent,
      totalOverflowCount,
      itemDropChances
    };
  }

  /**
   * Helper to get the maximum carrying items a character can start with (<= 2x hand slots).
   */
  public static getMaxStartingCarryingItems(handSlots: number): number {
    return Math.max(0, Math.round(handSlots * 2));
  }

  /**
   * Enforces the starting carrying items limit rule:
   * "Make max carrying items a character can start with is less than or equal to 2x their hand slots (but during adventure they can carry more than limit)"
   *
   * If a starting character file has more than 2x hand slots items in equipped/carried gear,
   * cleanly moves the excess items to [OWNED / STORED ITEMS (NOT ON PERSON)] with an attached starting location.
   */
  public static enforceStartingInventoryLimit(fileContent: string): {
    updatedContent: string;
    modified: boolean;
    handSlots: number;
    maxAllowed: number;
    totalCarriedCount: number;
    movedItems: string[];
  } {
    if (!fileContent || !fileContent.trim()) {
      return { updatedContent: fileContent, modified: false, handSlots: 2, maxAllowed: 4, totalCarriedCount: 0, movedItems: [] };
    }

    const stats = WeightInventoryEngine.parseCharacterStatsAndInventory(fileContent);
    const handSlots = stats.handSlots !== undefined ? stats.handSlots : (stats.holdingCapacity.maxStandardHoldCount || 2);
    const maxAllowed = WeightInventoryEngine.getMaxStartingCarryingItems(handSlots);

    // Collect all carried/equipped items (equipped gear, containers, carried loose, and held items not already in equipped)
    // CRITICAL: Currency, cash, coins, and coin pouches/wallets are wealth, NOT equipment items, and MUST NEVER be counted or moved to remote storage!
    const isCurrencyOrPouch = (it: ItemInfo) => {
      const nameLower = it.name.toLowerCase();
      return (
        WeightInventoryEngine.parseCurrencyEntries(it.name).length > 0 ||
        /coins?|gold|silver|copper|credits?|dollars?|cash|wealth|balance|\b(?:gp|sp|cp|pp|cr)\b/i.test(nameLower) ||
        (/pouch|wallet|purse|money\s*belt/i.test(nameLower) && stats.currency.hasCurrency)
      );
    };

    const isAccountingOrMetaItem = (it: ItemInfo) => {
      const nameLower = it.name.toLowerCase().replace(/^\[|\]$/g, '').trim();
      return (
        nameLower.startsWith('total starting') ||
        nameLower.includes('initialized starting gear') ||
        nameLower.includes('starting gear') ||
        nameLower.includes('starting equipment') ||
        nameLower.includes('initialized gear') ||
        nameLower.includes('gear initialized') ||
        nameLower.startsWith('initialized') ||
        nameLower.startsWith('starting inventory') ||
        nameLower.startsWith('starting loadout') ||
        nameLower.includes('starting carried items') ||
        nameLower.includes('items accounting') ||
        nameLower.includes('starting carrying limit') ||
        WeightInventoryEngine.isLimbOrGripResidue(nameLower) ||
        (it.weight === 0 && (!it.dimensions?.raw || it.dimensions.raw === 'Standard size') && /^\d+\.\s*/.test(it.name))
      );
    };

    const normalizeItemKey = (name: string) => name.toLowerCase().replace(/^[-*•>\s\d.]+/, '').replace(/^\[|\]$/g, '').replace(/[-–—\s]+$/, '').trim();

    // Priority ordering for retention:
    // 1. Currently held weapons/tools in hands (most essential to survival and immediate action)
    // 2. Worn armor/clothing
    // 3. Equipped containers
    // 4. Container items / loose items (least essential background items moved first if over limit)
    const carriedList: Array<{ item: ItemInfo; section: 'equipped' | 'container_item' | 'loose' | 'held' }> = [];
    const seenItemNames = new Set<string>();

    const addCarried = (item: ItemInfo, section: 'equipped' | 'container_item' | 'loose' | 'held') => {
      if (isCurrencyOrPouch(item) || isAccountingOrMetaItem(item)) return;
      const key = normalizeItemKey(item.name);
      if (!key || seenItemNames.has(key)) return;
      seenItemNames.add(key);
      carriedList.push({ item, section });
    };

    // First add held items (Priority 1: active weapons/tools in hands must never be stripped first)
    for (const held of stats.currentlyHolding) addCarried(held, 'held');

    // Next add equipped gear & armor (Priority 2: worn protective gear)
    for (const eq of stats.equippedGear) addCarried(eq, 'equipped');

    // Next add containers themselves (Priority 3: worn/carried bags)
    for (const cont of stats.containers) {
      addCarried({ name: cont.name, weight: cont.weight, dimensions: cont.dimensions }, 'equipped');
    }

    // Finally add container contents & loose items (Priority 4: excess background items moved first)
    for (const cont of stats.containers) {
      for (const it of cont.items) addCarried(it, 'container_item');
    }
    for (const loose of stats.carriedItems) addCarried(loose, 'loose');

    if (carriedList.length <= maxAllowed) {
      return {
        updatedContent: fileContent,
        modified: false,
        handSlots,
        maxAllowed,
        totalCarriedCount: carriedList.length,
        movedItems: []
      };
    }

    // Need to move excess items! Keep the first maxAllowed most essential items (e.g. worn armor, primary weapon, containers)
    const itemsToMove = carriedList.slice(maxAllowed);
    const movedNames = itemsToMove.map(m => m.item.name);

    let updated = fileContent;

    // Ensure [OWNED / STORED ITEMS (NOT ON PERSON)] exists
    if (!updated.includes('[OWNED / STORED ITEMS (NOT ON PERSON)]')) {
      const insertPos = updated.indexOf('[CURRENCY & FINANCIAL BALANCE]') !== -1
        ? updated.indexOf('[CURRENCY & FINANCIAL BALANCE]')
        : updated.indexOf('[ATTACKS & COMBAT ACTIONS]') !== -1
          ? updated.indexOf('[ATTACKS & COMBAT ACTIONS]')
          : updated.length;
      const storedSection = `[OWNED / STORED ITEMS (NOT ON PERSON)]\n- (Items owned by character stored at home, vault, camp, or stash. Their weight is NOT added to carried weight)\n\n`;
      updated = updated.substring(0, insertPos) + storedSection + updated.substring(insertPos);
    }

    // For each moved item, remove from its original line in file and append to stored section
    for (const moveEntry of itemsToMove) {
      const it = moveEntry.item;
      if (it.rawText && updated.includes(it.rawText)) {
        updated = updated.replace(it.rawText, '');
      } else {
        const escaped = it.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const itemLineRegex = new RegExp(`^[\\t ]*[-*•>\\s]*${escaped}[^\\n\\r]*[\\r\\n]*`, 'gmi');
        updated = updated.replace(itemLineRegex, '');
      }

      // Add to [OWNED / STORED ITEMS (NOT ON PERSON)]
      const cleanDim = it.dimensions?.raw || (it.dimensions?.height ? `${it.dimensions.height}x${it.dimensions.width} in` : 'Standard size');
      const storedLine = `- ${it.name}: Weight: ${it.weight} lbs. Dimensions: ${cleanDim}. [Location: Starting Home / Stash (Stored to respect starting carried item limit <= 2x hand slots: max ${maxAllowed} items)]\n`;

      const storedIdx = updated.indexOf('[OWNED / STORED ITEMS (NOT ON PERSON)]');
      if (storedIdx !== -1) {
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, storedIdx + 38);
        const insertAt = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, insertAt) + storedLine + updated.substring(insertAt);
      }
    }

    // Re-sync file
    const resynced = WeightInventoryEngine.syncCharacterFileContent(updated);
    return {
      updatedContent: resynced.updatedContent,
      modified: true,
      handSlots,
      maxAllowed,
      totalCarriedCount: maxAllowed,
      movedItems: movedNames
    };
  }

  /**
   * Intelligently finds the container matching a target container name.
   * Handles partial matching, keyword matching (backpack, pouch, satchel, etc.),
   * and falls back gracefully to the first available container.
   */
  public static findMatchingContainer(containers: ContainerInfo[], targetName?: string): ContainerInfo | undefined {
    if (!containers || containers.length === 0) return undefined;
    if (!targetName || !targetName.trim()) return undefined;

    const clean = (s: string) => s.trim().toLowerCase().replace(/^\[|\]$/g, '').trim();
    const target = clean(targetName);
    if (!target) return undefined;

    // 1. Exact match (case insensitive, stripped brackets)
    const exact = containers.find(c => clean(c.name) === target);
    if (exact) return exact;

    // 2. Contains match (either container name contains target or target contains container name)
    const contains = containers.find(c => {
      const cName = clean(c.name);
      return cName.includes(target) || target.includes(cName);
    });
    if (contains) return contains;

    // 3. Keyword matching (backpack, satchel, pouch, bag, sack, quiver, chest, etc.)
    const keywords = ['backpack', 'satchel', 'pouch', 'sack', 'bag', 'haversack', 'rucksack', 'chest', 'quiver', 'bandolier', 'scabbard', 'pocket', 'trunk', 'crate', 'case', 'holster'];
    const matchedKey = keywords.find(k => target.includes(k));
    if (matchedKey) {
      const keyMatch = containers.find(c => clean(c.name).includes(matchedKey));
      if (keyMatch) return keyMatch;
    }

    return undefined;
  }

  /**
   * Parses item usage, charges, doses, ammo, fuel, and refillable attributes dynamically.
   * Handles patterns like:
   * - "Uses: 3/5", "[Uses: 4/5]", "Charges: 2/3", "4 sips", "Sips: 3/4"
   * - "Fuel: 2/4 hours", "Ammo: 18/20 arrows", "Durability: 85/100"
   * - "Refillable: Yes (Resource: Fresh Water)", "[Refillable: Oil]"
   * - "Empty [Refillable: Water]"
   */
  public static parseItemUsage(text: string, itemName?: string): ItemUsageInfo | undefined {
    if (!text) return undefined;
    const lower = text.toLowerCase();

    // 1. Detect refillable status and refill resource
    let isRefillable = false;
    let refillType: string | undefined;

    const refillMatch = text.match(/(?:\[|\(|\b)(?:refillable|rechargeable|restockable)(?:[:=\s]+([a-zA-Z0-9_\s'-]+?))?(?:\)|\]|,|;|\.|$)/i);
    if (refillMatch) {
      isRefillable = true;
      if (refillMatch[1]) {
        const rawType = refillMatch[1].trim();
        if (!/^(?:yes|true|always)$/i.test(rawType)) {
          refillType = rawType;
        }
      }
    } else if (lower.includes('refillable: yes') || lower.includes('[refillable]') || lower.includes('(refillable)')) {
      isRefillable = true;
    }

    // Heuristics for inherently refillable items if described as such
    if (!isRefillable && itemName) {
      const lowerName = itemName.toLowerCase();
      if (
        (lowerName.includes('waterskin') || lowerName.includes('canteen') || lowerName.includes('flask') || lowerName.includes('lantern') || lowerName.includes('quiver') || lowerName.includes('oil lamp')) &&
        (text.includes('/') || lower.includes('sip') || lower.includes('fuel') || lower.includes('ammo') || lower.includes('dose') || lower.includes('charge'))
      ) {
        isRefillable = true;
        if (!refillType) {
          if (lowerName.includes('waterskin') || lowerName.includes('canteen')) refillType = 'Water';
          else if (lowerName.includes('lantern') || lowerName.includes('lamp')) refillType = 'Oil';
          else if (lowerName.includes('quiver')) refillType = 'Arrows';
        }
      }
    }

    // 2. Detect fractional or count usage:
    const fractionMatch = text.match(/(?:uses?|charges?|doses?|sips?|fuel|ammo|arrows?|durability|usage|remaining)[:=\s]*\[?(\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?\]?/i)
      || text.match(/\[(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\]/)
      || text.match(/\((\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\)/)
      || text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(uses?|charges?|doses?|sips?|arrows?|shots?|hours?)/i);

    if (fractionMatch) {
      const current = parseFloat(fractionMatch[1]);
      const max = parseFloat(fractionMatch[2]);
      const unit = fractionMatch[3]?.trim() || (lower.includes('sip') ? 'sips' : lower.includes('charge') ? 'charges' : lower.includes('dose') ? 'doses' : lower.includes('arrow') ? 'arrows' : lower.includes('hour') ? 'hours' : 'uses');
      return {
        current,
        max,
        unit,
        isRefillable,
        refillType,
        rawText: `${current}/${max} ${unit}`
      };
    }

    // b) Single usage count:
    const singleMatch = text.match(/(?:uses?|charges?|doses?|sips?|fuel|ammo)[:=\s]+(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?/i)
      || text.match(/(\d+)\s+(?:uses?|charges?|doses?|sips?|arrows?|shots?)\s+remaining/i);

    if (singleMatch) {
      const current = parseFloat(singleMatch[1]);
      const unit = singleMatch[2]?.trim() || (lower.includes('sip') ? 'sips' : lower.includes('charge') ? 'charges' : lower.includes('dose') ? 'doses' : 'uses');
      return {
        current,
        unit,
        isRefillable,
        refillType,
        rawText: `${current} ${unit}`
      };
    }

    // c) Check if explicitly empty but refillable
    if (lower.includes('empty') && isRefillable) {
      return {
        current: 0,
        unit: refillType ? `${refillType.toLowerCase()}` : 'uses',
        isRefillable: true,
        refillType,
        rawText: 'Empty (0 uses)'
      };
    }

    // d) If just refillable without explicit numbers
    if (isRefillable) {
      return {
        current: 1,
        isRefillable: true,
        refillType,
        rawText: `Refillable${refillType ? ` (${refillType})` : ''}`
      };
    }

    return undefined;
  }

  /**
   * Updates or appends item usage information in an item line.
   */
  public static updateItemUsageInLine(
    line: string,
    newCurrent: number,
    newMax?: number,
    refillType?: string
  ): string {
    let updated = line;
    const fractionRegex = /(?:uses?|charges?|doses?|sips?|fuel|ammo|durability|usage)[:=\s]*\[?(\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?\]?/i;
    const match = updated.match(fractionRegex);
    if (match) {
      const maxVal = newMax !== undefined ? newMax : match[2];
      const unit = match[3] || '';
      const replacement = `Uses: ${newCurrent}/${maxVal}${unit ? ` ${unit}` : ''}`;
      updated = updated.replace(match[0], replacement);
    } else {
      const maxStr = newMax !== undefined ? `/${newMax}` : '';
      const refillStr = refillType ? ` (Refillable: ${refillType})` : '';
      updated = `${updated.trimEnd()} [Uses: ${newCurrent}${maxStr}${refillStr}]`;
    }
    return updated;
  }

  /**
   * Extracts clean Timestamp string from WorldTime content or raw string
   */
  public static extractWorldTimestamp(contentOrTimeStr?: string): string | undefined {
    if (!contentOrTimeStr) return undefined;
    const match = contentOrTimeStr.match(/Timestamp\s*[:=]\s*([^\r\n]+)/i);
    if (match) return match[1].trim();
    const clean = contentOrTimeStr.replace(/\[CURRENT ACTIVE TIME\]/i, '').replace(/^[-*•\s]*/, '').trim();
    if (clean) return clean;
    return undefined;
  }

  /**
   * Universal parser for in-world timestamp representations.
   * Accurately parses:
   * - Full: "3:15:00 PM - Oct 12, 2026"
   * - Time-only: "10:00:03 AM"
   * - Multi-line WorldTime.txt files containing Timestamp line
   */
  public static parseWorldTimestamp(timeStr?: string): { date: Date; totalSeconds: number; hasDate: boolean } | null {
    if (!timeStr) return null;
    let str = timeStr.trim();
    const tsLineMatch = str.match(/Timestamp\s*[:=]\s*([^\r\n]+)/i);
    if (tsLineMatch) {
      str = tsLineMatch[1].trim();
    } else {
      str = str.replace(/\[CURRENT ACTIVE TIME\]/i, '').replace(/\[STATUS[^\]]*\]/i, '').replace(/^[-*•\s]*/, '').trim();
    }

    const fullMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*-\s*([A-Za-z]+ \d{1,2},? \d{4}))?/i);
    if (fullMatch) {
      const hStr = fullMatch[1];
      const mStr = fullMatch[2];
      const sStr = fullMatch[3];
      const ampm = fullMatch[4];
      const datePart = fullMatch[5];
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const s = sStr ? parseInt(sStr, 10) : 0;
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      const totalSeconds = h * 3600 + m * 60 + s;
      if (datePart) {
        const d = new Date(`${datePart} ${h}:${m}:${s}`);
        if (!isNaN(d.getTime())) {
          return { date: d, totalSeconds, hasDate: true };
        }
      }
      const baseDate = new Date(2000, 0, 1, h, m, s);
      return { date: baseDate, totalSeconds, hasDate: false };
    }

    try {
      const directDate = new Date(str);
      if (!isNaN(directDate.getTime())) {
        const totalSec = directDate.getHours() * 3600 + directDate.getMinutes() * 60 + directDate.getSeconds();
        return { date: directDate, totalSeconds: totalSec, hasDate: true };
      }
    } catch {}

    return null;
  }

  /**
   * Checks whether a status effect is expired based on its expiration timestamp, duration, and began timestamp.
   * Supports relative durations (e.g. 3s, 5m) as well as absolute timestamps.
   */
  public static isStatusEffectExpired(
    expiresStr?: string,
    durationStr?: string,
    beganStr?: string,
    currentTimestampStr?: string
  ): boolean {
    if (!currentTimestampStr) return false;
    const current = WeightInventoryEngine.parseWorldTimestamp(currentTimestampStr);
    if (!current) return false;

    // 1. Direct timestamp or relative expiration comparison if expiresStr is given
    if (expiresStr) {
      const cleanExp = expiresStr.trim().replace(/;+$/, '').trim();
      // Relative expiration e.g. "+3s", "3s", "3 seconds", "in 3s", "after 3s", "5m"
      const relMatch = cleanExp.match(/^[+]?\s*(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i) ||
                       cleanExp.match(/(?:in|after|[+])\s*(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/i);
      if (relMatch) {
        const val = parseFloat(relMatch[1]);
        const unit = relMatch[2].toLowerCase();
        let durationSec = val;
        if (unit.startsWith('m')) durationSec = val * 60;
        else if (unit.startsWith('h')) durationSec = val * 3600;
        else if (unit.startsWith('d')) durationSec = val * 86400;

        if (beganStr) {
          const began = WeightInventoryEngine.parseWorldTimestamp(beganStr);
          if (began) {
            const diffSec = current.hasDate && began.hasDate
              ? (current.date.getTime() - began.date.getTime()) / 1000
              : (current.totalSeconds - began.totalSeconds);
            return diffSec >= durationSec;
          }
        }
      }

      const exp = WeightInventoryEngine.parseWorldTimestamp(cleanExp);
      if (exp) {
        if (current.hasDate && exp.hasDate) {
          return current.date.getTime() >= exp.date.getTime();
        }
        if (beganStr) {
          const began = WeightInventoryEngine.parseWorldTimestamp(beganStr);
          if (began && current.hasDate && began.hasDate) {
            // If current date has advanced past began date by 1+ days, it has expired
            const daysDiff = (current.date.getTime() - began.date.getTime()) / (1000 * 86400);
            if (daysDiff >= 1) return true;
          }
        }
        return current.totalSeconds >= exp.totalSeconds;
      }
    }

    // 2. Duration with Began timestamp
    if (durationStr && beganStr) {
      const durMatch = durationStr.match(/(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/i);
      if (durMatch) {
        const val = parseFloat(durMatch[1]);
        const unit = durMatch[2].toLowerCase();
        let durationSec = val;
        if (unit.startsWith('m')) durationSec = val * 60;
        else if (unit.startsWith('h')) durationSec = val * 3600;
        else if (unit.startsWith('d')) durationSec = val * 86400;

        const began = WeightInventoryEngine.parseWorldTimestamp(beganStr);
        if (began) {
          const diffSec = current.hasDate && began.hasDate
            ? (current.date.getTime() - began.date.getTime()) / 1000
            : (current.totalSeconds - began.totalSeconds);
          return diffSec >= durationSec;
        }
      }
    }

    return false;
  }

  /**
   * Advances WorldTime timestamp by a given number of seconds and returns the updated file text
   */
  public static advanceWorldTimestamp(content: string, addSeconds: number): string {
    if (!content || addSeconds <= 0) return content;
    const match = content.match(/Timestamp\s*[:=]\s*([^\r\n]+)/i);
    if (!match) return content;
    const rawTs = match[1].trim();
    const timeMatch = rawTs.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*-\s*([A-Za-z]+ \d{1,2},? \d{4}))?/i);
    if (!timeMatch) return content;
    const hStr = timeMatch[1];
    const mStr = timeMatch[2];
    const sStr = timeMatch[3];
    const ampm = timeMatch[4];
    const datePart = timeMatch[5];
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const s = sStr ? parseInt(sStr, 10) : 0;
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
      if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    }
    let dateObj = datePart ? new Date(`${datePart} ${h}:${m}:${s}`) : new Date(2000, 0, 1, h, m, s);
    dateObj = new Date(dateObj.getTime() + addSeconds * 1000);
    let newH = dateObj.getHours();
    const newM = dateObj.getMinutes();
    const newS = dateObj.getSeconds();
    const newAmpm = newH >= 12 ? 'PM' : 'AM';
    newH = newH % 12 || 12;
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeFormatted = `${newH}:${pad(newM)}:${pad(newS)} ${newAmpm}`;
    const dateFormatted = datePart ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const newTs = datePart ? `${timeFormatted} - ${dateFormatted}` : timeFormatted;
    return content.replace(match[0], `Timestamp: ${newTs}`);
  }

  /**
   * Calculates corpse decomposition/rot stage based on elapsed WorldTime.
   * Rot stages (when biological decomposition applies in context):
   * - Stage 1: Fresh Corpse (< 2 hours)
   * - Stage 2: Early Decomposition (2 - 24 hours)
   * - Stage 3: Active Decay / Bloating (1 - 3 days)
   * - Stage 4: Advanced Decay (3 - 10 days)
   * - Stage 5: Skeletonized / Remains (10+ days)
   */
  public static calculateDecompositionStage(
    beganTimestampStr?: string,
    currentTimestampStr?: string
  ): { stage: number; stageName: string; description: string } {
    if (!beganTimestampStr || !currentTimestampStr) {
      return {
        stage: 1,
        stageName: 'Stage 1 - Fresh Corpse',
        description: 'Warm, no odor, rigor mortis developing gradually.'
      };
    }

    let elapsedHours = 0;
    try {
      const dBegan = WeightInventoryEngine.parseWorldTimestamp(beganTimestampStr);
      const dCurrent = WeightInventoryEngine.parseWorldTimestamp(currentTimestampStr);
      if (dBegan && dCurrent) {
        const diffMs = dCurrent.hasDate && dBegan.hasDate
          ? dCurrent.date.getTime() - dBegan.date.getTime()
          : (dCurrent.totalSeconds - dBegan.totalSeconds) * 1000;
        elapsedHours = Math.max(0, diffMs / (1000 * 60 * 60));
      }
    } catch {
      elapsedHours = 0;
    }

    if (elapsedHours < 2) {
      return {
        stage: 1,
        stageName: 'Stage 1 - Fresh Corpse',
        description: 'Warm, no odor, rigor mortis developing gradually.'
      };
    } else if (elapsedHours < 24) {
      return {
        stage: 2,
        stageName: 'Stage 2 - Early Decomposition',
        description: 'Algor mortis (cooling), rigor mortis present then releasing, initial pallor/lividity.'
      };
    } else if (elapsedHours < 72) {
      return {
        stage: 3,
        stageName: 'Stage 3 - Active Decay / Bloating',
        description: 'Abdominal distension, biological decomposition, strong decay odor, marbling.'
      };
    } else if (elapsedHours < 240) {
      return {
        stage: 4,
        stageName: 'Stage 4 - Advanced Decay',
        description: 'Tissue softening and purge fluids, significant structural tissue breakdown, exposed bone.'
      };
    } else {
      return {
        stage: 5,
        stageName: 'Stage 5 - Skeletonized / Remains',
        description: 'Organic tissue fully decayed; dry skeletal remains and apparel/gear persist.'
      };
    }
  }

  /**
   * Parses an item line, extracting name, weight, dimensions, container, and overflow notes.
   * Example lines:
   * - "feather 0 weight 3x0 inch"
   * - "Medium geode 1 pound and 3x5 inches"
   * - "- Iron Dagger: 2 lbs, 12x2 inches. Container: Backpack"
   * - "Staff of Power: Weight: 4 lbs. Dimensions: 60x2x2 inches. Container: Backpack (Overflow: Yes - sticks out)"
   */
  public static parseItemLine(line: string, defaultContainer?: string): ItemInfo | null {
    const trimmed = line.trim().replace(/^[-*•>\s]+/, '').replace(/^\d+[\.)]\s*/, '');
    if (!trimmed || (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.includes(':') && !/\b(?:weight|lbs?|dimensions?)\b/i.test(trimmed))) return null;

    // Reject or strip sub-container headers / container prefixes (e.g. "• (Inside Leather Bifold Wallet)", "(Inside Leather Bifold Wallet):", "Inside Backpack:")
    const insidePrefixMatch = trimmed.match(/^(?:\(|\[)?\s*(?:inside|in(?:\s*container)?|stored\s+in)\s+([a-zA-Z0-9_\s'-]+?)(?:\)|\])?\s*[:=-]?\s*(.*)$/i);
    if (insidePrefixMatch) {
      const containerPrefix = insidePrefixMatch[1].trim();
      const remainder = insidePrefixMatch[2].trim().replace(/^[:=-]+/, '').trim().replace(/^[\)\]]+/, '').trim();
      // If there's no remainder or remainder is just empty brackets/punctuation, this is purely a container header, NOT an item!
      if (!remainder || remainder === ')' || remainder === ']' || /^[:=\s\(\)\[\]]+$/.test(remainder)) {
        return null;
      }
      // If remainder contains currency (e.g. "1 Digital Credit / Electronic Scrip: 0.05 lbs, 3x2 inches" or "10 Gold Coins"), it is currency, NOT an item!
      if (WeightInventoryEngine.parseCurrencyEntries(remainder).length > 0) {
        return null;
      }
      // If remainder only contains stats without an item name (e.g. "0.05 lbs (3x2 inches)" or "Weight: 0.05 lbs"), it has no valid item name, NOT an item!
      const hasItemName = /^[a-zA-Z0-9_\s'-]+[:=]/i.test(remainder) || /^[a-zA-Z]{2,}\b/i.test(remainder.replace(/^[\(\[]/, ''));
      const isOnlyStats = /^(?:weight\s*[:=]|dimensions?\s*[:=]|[0-9.]+\s*(?:lbs?|pounds?|kg|oz|x|[0-9.]+\s*x))\b/i.test(remainder);
      if (isOnlyStats || !hasItemName) {
        return null;
      }
      // Otherwise recursively parse the remainder with defaultContainer set to containerPrefix
      return this.parseItemLine(remainder, containerPrefix || defaultContainer);
    }

    // Check if it's a category header or section line
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('equipped:') ||
      lower.startsWith('items:') ||
      lower.startsWith('containers:') ||
      lower.startsWith('total carried weight') ||
      lower.startsWith('encumbrance') ||
      lower.includes('starting carried item') ||
      lower.includes('starting carried items') ||
      lower.includes('starting item limit') ||
      lower.includes('starting items limit') ||
      lower.includes('item limit compliance') ||
      lower.includes('limit compliance') ||
      lower.includes('compliance. net') ||
      lower.includes('compliance:') ||
      lower.startsWith('compliance') ||
      lower.includes('starting items accounting') ||
      lower.includes('starting item accounting') ||
      lower.includes('items accounting') ||
      lower.includes('item accounting') ||
      lower.includes('starting carried items limit') ||
      lower.includes('total starting carried items count') ||
      lower.includes('total starting carried item count') ||
      lower.includes('starting carried items count') ||
      lower.includes('starting carried item count') ||
      lower.includes('starting carrying limit') ||
      lower.includes('starting carried items rule') ||
      lower.includes('starting carried item rule') ||
      lower.includes('stored to respect starting carried item limit') ||
      lower.includes('stored to respect starting') ||
      /^[-\s*•]*\d+\.\s*\[?[^\]:]+\]?\s*\((?:Equipped|Carried|Held|Inside).*?\)$/i.test(line) ||
      lower === 'none' ||
      lower === '(none)' ||
      lower === 'none.' ||
      lower === '0 lbs' ||
      lower.startsWith('0 lbs (none') ||
      lower.startsWith('0 lbs (none)') ||
      lower.startsWith('(none)') ||
      lower.startsWith('created character file') ||
      lower.startsWith('created file') ||
      lower.startsWith('updated file') ||
      lower.startsWith('saved file') ||
      lower.startsWith('tool result') ||
      lower.includes('created character file') ||
      lower.startsWith('holding anatomy') ||
      lower.startsWith('holding capacity') ||
      lower.startsWith('items currently held') ||
      lower.startsWith('currently holding') ||
      lower.includes('overflow rule') ||
      lower.includes('dynamic overflow') ||
      lower.includes('weight mandate') ||
      lower.includes('capacity mandate') ||
      lower.includes('holding mandate') ||
      lower.includes('weight & capacity') ||
      lower.includes('cannot hold additional') ||
      lower.includes('occupied by') ||
      lower.includes('without dropping') ||
      // Character's own body weight or physical stats lines must NEVER be parsed as items
      lower.startsWith('body weight') ||
      lower.startsWith('body:') ||
      lower === 'body' ||
      lower.startsWith('body ') ||
      lower.startsWith('own weight') ||
      lower.startsWith('own body weight') ||
      lower.startsWith('character weight') ||
      lower.startsWith('character body weight') ||
      lower.startsWith('player weight') ||
      lower.startsWith('player body weight') ||
      lower.startsWith('entity weight') ||
      lower.startsWith('total weight') ||
      lower.startsWith('total body weight') ||
      lower.startsWith('total weight on person') ||
      lower.startsWith('weight on person') ||
      lower.startsWith('current carried weight') ||
      lower.startsWith('total occupant weight') ||
      lower.startsWith('occupant weight') ||
      lower.startsWith('rider') ||
      lower.startsWith('driver') ||
      lower.startsWith('passenger') ||
      lower.startsWith('occupant') ||
      lower.startsWith('weight:') ||
      lower.startsWith('- weight:') ||
      lower.startsWith('physical dimension') ||
      lower.startsWith('dimensions:') ||
      lower.startsWith('max lift') ||
      lower.startsWith('lift strength') ||
      lower.startsWith('speed:')
    ) {
      return null;
    }

    // Extract item name
    let name = '';
    let rest = trimmed;
    const closingBracket = trimmed.indexOf(']');
    const colonIdx = trimmed.indexOf(':');

    if (trimmed.startsWith('[') && closingBracket > 1) {
      name = trimmed.substring(1, closingBracket).trim();
      rest = trimmed.substring(closingBracket + 1).replace(/^[:\s-]+/, '').trim();
    } else {
      const pipeIdx = trimmed.indexOf('|');
      if (pipeIdx > 0 && (colonIdx === -1 || pipeIdx < colonIdx)) {
        name = trimmed.substring(0, pipeIdx).trim();
        rest = trimmed.substring(pipeIdx + 1).trim();
      } else if (colonIdx > 0 && colonIdx < 100) {
        name = trimmed.substring(0, colonIdx).trim();
        rest = trimmed.substring(colonIdx + 1).trim();
      } else {
        // e.g. "feather 0 weight 3x0 inch"
        const weightIdx = trimmed.search(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:weight|pound|lbs?|kg|oz)/i);
        if (weightIdx > 0) {
          name = trimmed.substring(0, weightIdx).trim();
          rest = trimmed.substring(weightIdx).trim();
        } else {
          name = trimmed.split(/[(,]/)[0].trim();
        }
      }
    }

    // If the extracted "name" is actually a limb prefix (e.g. "Hands", "Held in Jaws", "Both Hands (Two-Handed)", "[Both Hands (Two-Handed)]", "Both Hands (Two-Handed Grip)"), strip it and continue extracting the real item name from rest
    const isLimbPrefix = WeightInventoryEngine.isLimbOrGripResidue(name) || /^(?:\[)?(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|both\s*hands(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|one[- ]handed(?:\s*grip)?|\(one[- ]handed(?:\s*grip)?\)|grip|\/\s*arms?|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow(?:\s*hold)?)(?:\])?$/i.test(name);
    if (isLimbPrefix) {
      let prevRest = '';
      while (rest !== prevRest) {
        prevRest = rest;
        rest = rest
          .replace(/^[-*•>\s]+/, '')
          .replace(/^\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow(?:\s*hold)?)\](?:\s*(?:\/\s*arms?|\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|grip))?\s*[:=-]?\s*/i, '')
          .replace(/^(?:(?:right|left|main|off|both)\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|both\s*hands(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|one[- ]handed(?:\s*grip)?|\(one[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold|hands?)(?:\s*(?:\/\s*arms?|\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|grip))?\s*[:=-]\s*/i, '')
          .replace(/^(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip)\s*[:=-]?\s*/i, '')
          .replace(/^weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*(?:dimensions?\s*[:=]\s*)?/i, '')
          .trim();
      }
      const nextColon = rest.indexOf(':');
      if (nextColon > 0 && nextColon < 40) {
        name = rest.substring(0, nextColon).trim();
        rest = rest.substring(nextColon + 1).trim();
      } else {
        const nextWeight = rest.search(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:weight|pound|lbs?|kg|oz)/i);
        if (nextWeight > 0) {
          name = rest.substring(0, nextWeight).trim();
          rest = rest.substring(nextWeight).trim();
        } else {
          name = rest.split(/[(,]/)[0].trim();
        }
      }
    }

    const cleanNameLower = name.toLowerCase().replace(/^[-*•>\s\d.]+/, '').replace(/^\[|\]$/g, '').trim();
    if (
      !name ||
      name.toLowerCase() === 'none' ||
      name.toLowerCase() === '0 lbs' ||
      cleanNameLower.startsWith('total starting') ||
      cleanNameLower.includes('initialized starting gear') ||
      cleanNameLower.includes('starting gear') ||
      cleanNameLower.includes('starting equipment') ||
      cleanNameLower.includes('initialized gear') ||
      cleanNameLower.includes('gear initialized') ||
      cleanNameLower.startsWith('initialized') ||
      cleanNameLower.startsWith('starting inventory') ||
      cleanNameLower.startsWith('starting loadout') ||
      cleanNameLower.includes('starting carried item') ||
      cleanNameLower.includes('starting carried items') ||
      cleanNameLower.includes('starting item limit') ||
      cleanNameLower.includes('starting items limit') ||
      cleanNameLower.includes('item limit compliance') ||
      cleanNameLower.includes('limit compliance') ||
      cleanNameLower.includes('compliance') ||
      cleanNameLower.includes('items accounting') ||
      cleanNameLower.includes('item accounting') ||
      cleanNameLower.includes('starting items accounting') ||
      cleanNameLower.includes('starting item accounting') ||
      cleanNameLower.includes('starting carrying limit') ||
      cleanNameLower.startsWith('net:') ||
      cleanNameLower.includes('. net:') ||
      name.toLowerCase() === 'hands' ||
      name.toLowerCase() === 'hand' ||
      name.toLowerCase() === '(two-handed)' ||
      name.toLowerCase() === 'two-handed' ||
      name.toLowerCase() === '(two-handed grip)' ||
      name.toLowerCase() === 'two-handed grip' ||
      name.toLowerCase() === 'both hands (two-handed grip)' ||
      name.toLowerCase() === 'both hands (two-handed)' ||
      name.toLowerCase() === '/ arms' ||
      name.toLowerCase() === 'arms' ||
      name.toLowerCase().includes('overflow rule') ||
      name.toLowerCase().includes('overflow mechanics') ||
      name.toLowerCase().includes('overflow strain') ||
      name.toLowerCase().includes('weight & size scaling') ||
      name.toLowerCase().includes('scaled accidental drop') ||
      name.toLowerCase().includes('scaled random chance') ||
      name.toLowerCase().includes('weight mandate') ||
      name.toLowerCase().includes('capacity mandate') ||
      name.toLowerCase().includes('holding mandate') ||
      name.toLowerCase().includes('weight & capacity') ||
      name.toLowerCase().includes('hand slots') ||
      name.toLowerCase().includes('starting capacity') ||
      name.toLowerCase().includes('slots & starting capacity') ||
      name.toLowerCase().includes('starting carrying limit') ||
      name.toLowerCase().includes('starting carried items limit') ||
      name.toLowerCase().includes('during adventure rule') ||
      name.toLowerCase().includes('holding anatomy') ||
      name.toLowerCase().includes('holding limbs') ||
      name.toLowerCase().includes('holding appendages') ||
      name.toLowerCase().includes('2 hands / arms') ||
      name.toLowerCase().includes('holding capacity') ||
      cleanNameLower === 'body weight' ||
      cleanNameLower === 'body' ||
      cleanNameLower === 'own weight' ||
      cleanNameLower === 'own body weight' ||
      cleanNameLower === 'character weight' ||
      cleanNameLower === 'character body weight' ||
      cleanNameLower === 'player weight' ||
      cleanNameLower === 'player body weight' ||
      cleanNameLower === 'entity weight' ||
      cleanNameLower === 'total weight' ||
      cleanNameLower === 'total body weight' ||
      cleanNameLower === 'total weight on person' ||
      cleanNameLower === 'total carried weight' ||
      cleanNameLower === 'weight on person' ||
      cleanNameLower === 'current carried weight' ||
      cleanNameLower === 'self' ||
      cleanNameLower === 'own body' ||
      cleanNameLower === 'weight' ||
      cleanNameLower.startsWith('total occupant') ||
      cleanNameLower.startsWith('occupant weight') ||
      cleanNameLower.startsWith('rider') ||
      cleanNameLower.startsWith('driver') ||
      cleanNameLower.startsWith('passenger') ||
      cleanNameLower.startsWith('(inside') ||
      cleanNameLower.startsWith('inside ') ||
      cleanNameLower.startsWith('(in ') ||
      cleanNameLower.startsWith('in container') ||
      cleanNameLower.startsWith('stored in') ||
      cleanNameLower.includes('inside leather bifold wallet') ||
      cleanNameLower.includes('leather bifold wallet') ||
      cleanNameLower === 'wallet' ||
      cleanNameLower === 'coin pouch' ||
      cleanNameLower === 'chit wallet' ||
      WeightInventoryEngine.isContainerName(cleanNameLower.replace(/^[\(\[]?(?:inside|in(?:\s*container)?|stored\s+in)\s+/i, '').replace(/[\)\]]$/, '').trim())
    ) {
      return null;
    }

    // Parse weight
    const weightResult = this.parseWeight(rest);
    let weight = weightResult.weight;

    // Check for temporary effect inside item text:
    // e.g. [Status:Lightweight(Expires: 3:00 PM; TempWeight: 1 lb; BaseWeight: 500 lbs)]
    let temporaryEffect: ItemInfo['temporaryEffect'] | undefined;
    const statusMatch = rest.match(/\[Status:([^()]+)\(([^)]+)\)\]/i);
    if (statusMatch) {
      const effectName = statusMatch[1];
      const effectBody = statusMatch[2];
      const tempMatch = effectBody.match(/tempweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
      const baseMatch = effectBody.match(/baseweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
      const expMatch = effectBody.match(/expires[:=\s]*([^;)]+)/i);

      if (tempMatch && baseMatch) {
        const tempW = parseFloat(tempMatch[1]);
        const baseW = parseFloat(baseMatch[1]);
        weight = tempW; // active weight is the temporary weight
        temporaryEffect = {
          name: effectName,
          expires: expMatch ? expMatch[1].trim() : undefined,
          tempWeight: tempW,
          baseWeight: baseW
        };
      }
    }

    // Parse dimensions
    const dimensions = this.parseDimensions(rest);

    // Check foldability
    const isFoldable = this.isFoldableItem(name, line);

    // Parse container
    let containerName = defaultContainer;
    const containerMatch = rest.match(/container[:=\s]*\[?([a-zA-Z0-9_\s'-]+)\]?/i);
    if (containerMatch) {
      containerName = containerMatch[1].trim();
    } else {
      const insideMatch = rest.match(/(?:inside|in container|stored in|in:)\s*\[?([a-zA-Z0-9_\s'-]+)\]?/i);
      if (insideMatch) {
        containerName = insideMatch[1].trim();
      } else {
        const bracketMatch = rest.match(/\[([a-zA-Z0-9_\s'-]+)\]/i);
        if (bracketMatch) {
          const inner = bracketMatch[1].trim().toLowerCase();
          if (inner.includes('backpack') || inner.includes('pouch') || inner.includes('satchel') || inner.includes('bag') || inner.includes('sack') || inner.includes('chest') || inner.includes('quiver') || inner.includes('haversack')) {
            containerName = bracketMatch[1].trim();
          }
        } else {
          const parenMatch = rest.match(/\((?:in:?\s*)?([A-Za-z0-9\s'-]+(?:backpack|pouch|satchel|bag|chest|sack|quiver|haversack|case)[A-Za-z0-9\s'-]*)\)/i);
          if (parenMatch) {
            containerName = parenMatch[1].replace(/^(?:in|inside|stored in)\s+/i, '').trim();
          }
        }
      }
    }

    // Parse location (especially for stored items or remote caches)
    let location: string | undefined;
    let isHiddenLocation = false;
    const locPattern = /(?:\[\s*)?(?:location|secret)[:=\s]+(hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)/i;
    const locMatch = rest.match(locPattern);
    if (locMatch) {
      location = locMatch[1].trim();
      if (/hide[:\[]|target\(/i.test(location)) {
        isHiddenLocation = true;
      }
    } else if (/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i.test(rest)) {
      const match = rest.match(/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (/target\([^)]+\)\[[^\]]+\]/i.test(rest)) {
      const match = rest.match(/target\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (rest.toLowerCase().includes('hide[')) {
      const hideMatch = rest.match(/hide\[([^\]]+)\]/i);
      if (hideMatch) {
        location = `hide[${hideMatch[1].trim()}]`;
        isHiddenLocation = true;
      }
    }

    if (location) {
      if (location.endsWith(']') && !location.includes('[')) {
        location = location.slice(0, -1).trim();
      }
      if (location.startsWith('[') && location.endsWith(']') && !/hide|target/i.test(location)) {
        location = location.slice(1, -1).trim();
      }
    }

    // Check overflow & does not fit notes in text
    let doesNotFit = false;
    let isOverflow = false;
    let overflowReason: string | undefined;
    if (lower.includes('does not fit') || lower.includes('cannot fit') || lower.includes('too big to enter')) {
      doesNotFit = true;
      overflowReason = 'Item does not fit inside container dimensions.';
    } else if (lower.includes('overflow: yes') || lower.includes('overflowing') || lower.includes('protruding') || lower.includes('sticks out')) {
      isOverflow = true;
      overflowReason = 'Item exceeds container space; risks falling or dropping during actions/movement.';
    }

    // Dynamic item usage & refillable detection
    const usage = this.parseItemUsage(rest, name);

    return {
      name,
      weight,
      dimensions,
      category: defaultContainer ? 'carried' : 'equipped',
      containerName,
      location,
      isHiddenLocation,
      isFoldable,
      isOverflow,
      doesNotFit,
      fitStatus: doesNotFit ? 'does_not_fit' : isOverflow ? 'overflow' : 'fits',
      overflowReason,
      rawText: line,
      usage,
      temporaryEffect
    };
  }

  /**
   * Alias for parseCharacterStatsAndInventory
   */
  public static parseCharacterFile(
    fileContent: string,
    currentTimestamp?: string
  ): CharacterPhysicalStats {
    return WeightInventoryEngine.parseCharacterStatsAndInventory(fileContent, currentTimestamp);
  }

  public parseCharacterFile(
    fileContent: string,
    currentTimestamp?: string
  ): CharacterPhysicalStats {
    return WeightInventoryEngine.parseCharacterStatsAndInventory(fileContent, currentTimestamp);
  }

  public parseCharacterStatsAndInventory(
    fileContent: string,
    currentTimestamp?: string
  ): CharacterPhysicalStats {
    return WeightInventoryEngine.parseCharacterStatsAndInventory(fileContent, currentTimestamp);
  }

  /**
   * Evaluates all items, containers, character dimensions, body weight, strength, and encumbrance.
   */
  public static parseCharacterStatsAndInventory(
    fileContent: string,
    currentTimestamp?: string
  ): CharacterPhysicalStats {
    const lines = fileContent.split('\n');

    let characterName = 'Character';
    const initialNameMatch = fileContent.match(/(?:^|\n)\s*[-*•#\s]*(?:character\s*name|full\s*name|name)\s*[:=]\s*([^\n\r]+)/i);
    if (initialNameMatch) {
      const cleanN = initialNameMatch[1].replace(/[*_#`[\]]/g, '').trim();
      if (cleanN && !cleanN.toLowerCase().startsWith('character') && cleanN.toLowerCase() !== 'unknown') {
        characterName = cleanN;
      }
    }
    let characterType = 'Humanoid';
    let height: string | undefined;
    let width: string | undefined;
    let depth: string | undefined;
    let dimensionsRaw = 'Height: 5\'11", Width: 20", Depth: 12"';
    let dimensionsApply = true;
    let bodyWeight = 160; // lbs default for average human
    let strengthMultiplier = 1.0;
    let baseWalkingSpeed = 1.5; // m/s
    let baseRunningSpeed = 4.5; // m/s
    let currentWalkingSpeed = 1.5;
    let currentRunningSpeed = 4.5;
    let maxLiftStrength = 160; // 100% of body weight for 1.0x baseline

    // Dynamic encumbrance parameters
    let encumbranceApplies = true;
    let encumbranceThreshold = 0.20; // 20% default baseline human
    let encumbranceImmunityReason: string | undefined;
    let encumbranceEffectDescription = 'Speed penalty applies when carried weight exceeds threshold.';

    const containers: ContainerInfo[] = [];
    const equippedGear: ItemInfo[] = [];
    const carriedItems: ItemInfo[] = [];
    const storedItems: ItemInfo[] = [];
    const currentlyHolding: HeldItemInfo[] = [];
    let customHoldingAnatomy: string | undefined;
    let customHoldingMax: number | undefined;
    let customHoldingApplies: boolean | undefined;
    const activeWeightEffects: CharacterPhysicalStats['activeWeightEffects'] = [];
    const activeStatusEffectsList: ActiveStatusEffect[] = [];
    let temporaryAppearance: string | undefined;
    let baseAppearance: string | undefined;

    const tempAppMatchInit = fileContent.match(/[-*•]?\s*Temporary\s+Appearance\s*[:=]\s*([^\r\n]+)/i);
    if (tempAppMatchInit) temporaryAppearance = tempAppMatchInit[1].trim();
    const baseAppMatchInit = fileContent.match(/[-*•]?\s*(?:Base\s+Appearance|Original\s+Appearance)\s*[:=]\s*([^\r\n]+)/i);
    if (baseAppMatchInit) baseAppearance = baseAppMatchInit[1].trim();

    // Currency & balance data
    let currencyType = 'Standard World Currency';
    const carriedCurrencies: CurrencyEntry[] = [];
    const storedCurrencies: CurrencyEntry[] = [];
    let activeCurrencySub: 'carried' | 'stored' | 'general' = 'carried';
    const hasDedicatedCurrencySection = fileContent.includes('[CURRENCY & FINANCIAL BALANCE]') || fileContent.includes('[CURRENCY');
    let explicitCarriedNone = false;

    let isMounted = false;
    let mountedEntityName: string | undefined;
    let mountedStatusDescription: string | undefined;
    const passengersOrRiders: Array<{ name: string; weight?: number }> = [];
    let passengerWeight = 0;

    let currentSection = '';
    let activeContainerName = '';
    let activeSubsection: 'containers' | 'equipped' | 'inside_containers' | 'holding' | 'general' | 'accounting' = 'general';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Section Headers (with or without brackets, markdown `#`, asterisks `**`, colons)
      let detectedSection: string | null = null;
      let cleanHeader = '';
      const bracketMatch = line.match(/^\[(.*?)\]:?$/);
      if (bracketMatch) {
        cleanHeader = bracketMatch[1].trim().toUpperCase();
        detectedSection = cleanHeader;
      } else if (!/^[-*•>]\s+[a-zA-Z]/.test(line)) {
        cleanHeader = line
          .replace(/^#+\s*/, '')
          .replace(/^\*+\s*/, '')
          .replace(/^-+\s*/, '')
          .replace(/^\[+/, '')
          .replace(/\]+:?$/, '')
          .replace(/\*+$/, '')
          .replace(/:$/, '')
          .trim()
          .toUpperCase();
      }

      if (cleanHeader) {
        const canonicalSections: { [k: string]: string } = {
          'NAME & DESCRIPTION': 'NAME & DESCRIPTION',
          'NAME AND DESCRIPTION': 'NAME & DESCRIPTION',
          'CHARACTER PROFILE': 'NAME & DESCRIPTION',
          'PROFILE': 'NAME & DESCRIPTION',
          'BIO': 'NAME & DESCRIPTION',
          'BIOGRAPHY': 'NAME & DESCRIPTION',

          'STATS & MODIFIERS': 'STATS & MODIFIERS',
          'STATS AND MODIFIERS': 'STATS & MODIFIERS',
          'CHARACTER STATS': 'STATS & MODIFIERS',
          'ATTRIBUTES': 'STATS & MODIFIERS',
          'STATS': 'STATS & MODIFIERS',

          'ATTACKS & COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'ATTACKS AND COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'ATTACKS': 'ATTACKS & COMBAT ACTIONS',
          'COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'COMBAT': 'ATTACKS & COMBAT ACTIONS',

          'ABILITIES & MAGIC': 'ABILITIES & MAGIC',
          'ABILITIES AND MAGIC': 'ABILITIES & MAGIC',
          'ABILITIES': 'ABILITIES & MAGIC',
          'MAGIC': 'ABILITIES & MAGIC',
          'SPELLS': 'ABILITIES & MAGIC',

          'INVENTORY & EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'INVENTORY AND EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'INVENTORY': 'INVENTORY & EQUIPMENT',
          'EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'STARTING INVENTORY & CONTAINERS': 'INVENTORY & EQUIPMENT',
          'STARTING INVENTORY AND CONTAINERS': 'INVENTORY & EQUIPMENT',
          'STARTING INVENTORY': 'INVENTORY & EQUIPMENT',
          'STARTING CONTAINERS': 'INVENTORY & EQUIPMENT',
          'EQUIPPED GEAR & ARMOR': 'INVENTORY & EQUIPMENT',
          'EQUIPPED GEAR AND ARMOR': 'INVENTORY & EQUIPMENT',
          'EQUIPPED GEAR': 'INVENTORY & EQUIPMENT',
          'EQUIPPED ARMOR': 'INVENTORY & EQUIPMENT',
          'ARMOR & GEAR': 'INVENTORY & EQUIPMENT',
          'GEAR & ARMOR': 'INVENTORY & EQUIPMENT',
          'CONTAINERS & CARRIED GEAR': 'INVENTORY & EQUIPMENT',
          'CONTAINERS AND CARRIED GEAR': 'INVENTORY & EQUIPMENT',
          'CARRIED GEAR': 'INVENTORY & EQUIPMENT',

          'CURRENTLY HOLDING': 'CURRENTLY HOLDING',
          'ITEMS CURRENTLY HELD': 'CURRENTLY HOLDING',
          'HELD ITEMS': 'CURRENTLY HOLDING',

          'OWNED / STORED ITEMS (NOT ON PERSON)': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'OWNED / STORED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORED ITEMS (NOT ON PERSON)': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'OWNED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORAGE': 'OWNED / STORED ITEMS (NOT ON PERSON)',

          'CURRENCY & FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY AND FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY & BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY': 'CURRENCY & FINANCIAL BALANCE',
          'CARRIED WEALTH': 'CURRENCY & FINANCIAL BALANCE',
          'CARRIED CURRENCY': 'CURRENCY & FINANCIAL BALANCE',
          'WEALTH & CURRENCY': 'CURRENCY & FINANCIAL BALANCE',
          'FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'FINANCES': 'CURRENCY & FINANCIAL BALANCE',
          'WEALTH': 'CURRENCY & FINANCIAL BALANCE',
          'MONEY': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY & WEALTH': 'CURRENCY & FINANCIAL BALANCE',

          'STATUS EFFECTS & LORE': 'STATUS EFFECTS & LORE',
          'STATUS EFFECTS AND LORE': 'STATUS EFFECTS & LORE',
          'STATUS EFFECTS': 'STATUS EFFECTS & LORE',
          'EFFECTS & LORE': 'STATUS EFFECTS & LORE',
          'LORE': 'STATUS EFFECTS & LORE',

          'MOUNT, VEHICLE & TRANSPORT STATUS': 'TRANSPORT',
          'MOUNT, VEHICLE & TRANSPORT': 'TRANSPORT',
          'MOUNT & VEHICLE STATUS': 'TRANSPORT',
          'TRANSPORT & MOUNTS': 'TRANSPORT',
          'MOUNT & VEHICLE': 'TRANSPORT',
          'TRANSPORT': 'TRANSPORT'
        };

        if (canonicalSections[cleanHeader]) {
          detectedSection = canonicalSections[cleanHeader];
        }
      }

      if (detectedSection) {
        currentSection = detectedSection;
        activeContainerName = '';
        if (cleanHeader.includes('EQUIPPED') || cleanHeader.includes('WORN') || cleanHeader.includes('ARMOR')) {
          activeSubsection = 'equipped';
        } else if (cleanHeader.includes('HOLDING') || cleanHeader.includes('HELD') || currentSection.includes('HOLDING') || currentSection.includes('HELD')) {
          activeSubsection = 'holding';
        } else if (cleanHeader.includes('STORED') || cleanHeader.includes('STORAGE') || cleanHeader.includes('OWNED')) {
          activeSubsection = 'stored';
        } else if (cleanHeader.includes('CONTAINER')) {
          activeSubsection = 'containers';
        } else {
          activeSubsection = 'general';
        }
        continue;
      }

      const lower = line.toLowerCase();

      // 1. [NAME & DESCRIPTION] Section
      if (currentSection.includes('NAME') || currentSection.includes('DESCRIPTION')) {
        const nameMatch = line.match(/^[-*•#\s]*(?:character\s*name|full\s*name|name)\s*[:=]\s*([^\n\r]+)/i);
        if (nameMatch) {
          const rawName = nameMatch[1].replace(/[*_#`[\]]/g, '').trim();
          if (rawName && !rawName.toLowerCase().startsWith('character') && rawName.toLowerCase() !== 'unknown') {
            characterName = rawName;
          }
        }

        // Detect creature type / race / biology (e.g. Slime, Ghost, Ooze, Golem, Elemental)
        if (
          lower.includes('slime') ||
          lower.includes('gelatinous') ||
          lower.includes('ooze') ||
          lower.includes('amorphous')
        ) {
          characterType = 'Slime';
          encumbranceApplies = false;
          encumbranceImmunityReason = 'Amorphous/Slime biology: absorbs items into gel matrix without standard movement slowdown';
          encumbranceEffectDescription = 'Slime biology allows carrying objects internally without standard encumbrance speed penalty';
        } else if (
          lower.includes('incorporeal') ||
          lower.includes('ghost') ||
          lower.includes('spirit') ||
          lower.includes('phantom') ||
          lower.includes('formless') ||
          lower.includes('spectral')
        ) {
          characterType = 'Ghost/Incorporeal';
          dimensionsApply = false;
          encumbranceApplies = false;
          encumbranceImmunityReason = 'Incorporeal entity: immune to physical encumbrance';
          encumbranceEffectDescription = 'Incorporeal nature: unaffected by weight or encumbrance';
        }

        if (lower.includes('race:') || lower.includes('species:') || lower.includes('type:')) {
          const typeMatch = line.match(/(?:race|species|type)[:=\s]+([^\n,;]+)/i);
          if (typeMatch) {
            const rawType = typeMatch[1].trim();
            characterType = rawType;
            if (rawType.toLowerCase().includes('slime') || rawType.toLowerCase().includes('ooze')) {
              encumbranceApplies = false;
              encumbranceImmunityReason = 'Amorphous/Slime biology: absorbs items without standard encumbrance slowdown';
            } else if (rawType.toLowerCase().includes('ghost') || rawType.toLowerCase().includes('specter') || rawType.toLowerCase().includes('incorporeal')) {
              encumbranceApplies = false;
              dimensionsApply = false;
              encumbranceImmunityReason = 'Incorporeal entity: unaffected by physical weight';
            }
          }
        }

        if (lower.includes('physical dimension') || lower.startsWith('dimensions:') || lower.startsWith('- dimensions:')) {
          dimensionsRaw = line.split(/[:=]/).slice(1).join(':').trim();
          if (dimensionsRaw.toLowerCase().includes('none') || dimensionsRaw.toLowerCase().includes('incorporeal') || dimensionsRaw.toLowerCase().includes('ghost')) {
            dimensionsApply = false;
          } else {
            dimensionsApply = true;
            const parsed = this.parseDimensions(dimensionsRaw);
            if (parsed.height) height = `${parsed.height}"`;
            if (parsed.width) width = `${parsed.width}"`;
            if (parsed.depth) depth = `${parsed.depth}"`;
          }
        }

        if (lower.includes('height:')) {
          const h = line.match(/height[:=\s]+([^\n,;]+)/i);
          if (h) height = h[1].trim();
        }
        if (lower.includes('width:')) {
          const w = line.match(/width[:=\s]+([^\n,;]+)/i);
          if (w) width = w[1].trim();
        }
        if (lower.includes('depth:')) {
          const d = line.match(/depth[:=\s]+([^\n,;]+)/i);
          if (d) depth = d[1].trim();
        }

        if (lower.includes('body weight') || lower.startsWith('weight:') || lower.startsWith('- weight:')) {
          const wResult = this.parseWeight(line);
          if (wResult.applies && wResult.weight > 0) {
            bodyWeight = wResult.weight;
          }
        }
      }

      // Mount / Vehicle / Riding / Enterable Status Check (can appear in any section e.g. [MOUNT, VEHICLE & TRANSPORT], [STATUS EFFECTS & LORE], or [STATS & MODIFIERS])
      if (
        lower.includes('mounted on') ||
        lower.startsWith('- mounting / riding status:') ||
        lower.startsWith('- mounting/riding status:') ||
        lower.startsWith('mounting / riding status:') ||
        lower.startsWith('- riding status:') ||
        lower.startsWith('riding status:') ||
        lower.startsWith('- mounted:') ||
        lower.startsWith('mounted:') ||
        lower.startsWith('- riding:') ||
        lower.startsWith('riding:') ||
        lower.startsWith('- status / transport:') ||
        lower.startsWith('- status / mounting:') ||
        lower.startsWith('- transport / mount:') ||
        lower.startsWith('- transport:') ||
        lower.startsWith('- inside vehicle:') ||
        lower.startsWith('- inside:') ||
        lower.startsWith('inside:') ||
        lower.startsWith('piloting:') ||
        lower.startsWith('- pilot:')
      ) {
        const val = line.split(/[:=]/).slice(1).join(':').trim();
        if (
          val &&
          !val.toLowerCase().includes('none') &&
          !val.toLowerCase().includes('unmounted') &&
          !val.toLowerCase().includes('on foot') &&
          !val.toLowerCase().includes('independent')
        ) {
          isMounted = true;
          mountedStatusDescription = val;
          const entityMatch = val.match(/\[([^\]]+)\]/);
          if (entityMatch) {
            mountedEntityName = entityMatch[1].trim();
          } else {
            const cleaned = val
              .replace(/^(?:mounted\s+on|riding|inside\s+of|inside|piloting)\s+/i, '')
              .replace(/\(.*?\)/g, '')
              .trim();
            if (cleaned) mountedEntityName = cleaned;
          }
        }
      }

      // Mount / Vehicle Passenger / Rider Check (for horses, carriages, wagons, boats, etc.)
      if (
        lower.startsWith('- rider') ||
        lower.startsWith('rider:') ||
        lower.startsWith('- passenger') ||
        lower.startsWith('passengers:') ||
        lower.startsWith('- occupants:') ||
        lower.startsWith('occupants:') ||
        lower.startsWith('- total occupant weight:')
      ) {
        const val = line.split(/[:=]/).slice(1).join(':').trim();
        if (
          val &&
          !val.toLowerCase().includes('none') &&
          !val.toLowerCase().includes('empty') &&
          !val.toLowerCase().includes('0 riders')
        ) {
          const isLikelyMountOrVehicle =
            /mount|vehicle|horse|warhorse|steed|pony|donkey|mule|camel|carriage|wagon|cart|boat|ship|vessel|chariot|sleigh|sled|glider|airship|mech|car|truck|bike|motorcycle|riding|transport/i.test(characterType) ||
            /mount|vehicle|horse|warhorse|steed|carriage|wagon|cart|boat|ship|wagon/i.test(characterName) ||
            fileContent.toLowerCase().includes('entity type: mount') ||
            fileContent.toLowerCase().includes('is mount: yes') ||
            fileContent.toLowerCase().includes('role: mount');

          const isSelfReference = (targetName: string) => {
            const tLower = (targetName || '').toLowerCase().trim();
            if (!tLower) return true;
            if (tLower === 'self' || tLower === 'own' || tLower === 'myself' || tLower === 'rider' || tLower === 'driver') return true;
            if (characterName && characterName !== 'Character') {
              const cLower = characterName.toLowerCase().trim();
              if (tLower === cLower || tLower.includes(cLower) || cLower.includes(tLower)) return true;
            }
            return false;
          };

          const isTotalOccupantLine = lower.startsWith('- total occupant weight:') || lower.startsWith('total occupant weight:') || lower.includes('total occupant weight');
          if (isTotalOccupantLine) {
            // Total occupant weight only counts on actual mounts/vehicles carrying others (not on riders or foot characters)
            if (isLikelyMountOrVehicle && !isMounted) {
              const occMatch = line.match(/([0-9]+(?:\.[0-9]+)?)\s*lbs?/i);
              if (occMatch) {
                const matchedW = parseFloat(occMatch[1]);
                // Never count if it accidentally mirrors the entity's own body weight
                if (Math.abs(matchedW - bodyWeight) > 0.5) {
                  passengerWeight = Math.max(passengerWeight, matchedW);
                }
              }
            }
          } else {
            const bracketMatches = Array.from(val.matchAll(/\[([^\]]+)\](?:\s*\([^)]*?([0-9]+(?:\.[0-9]+)?)\s*lbs?[^)]*?\))?/g));
            let foundBracket = false;
            for (const bm of bracketMatches) {
              foundBracket = true;
              const pName = bm[1].trim();
              const pWeight = bm[2] ? parseFloat(bm[2]) : 0;
              // Characters NEVER carry themselves as riders or passengers!
              if (!isSelfReference(pName)) {
                // If entity is mounted on something else, they are the rider, not carrying riders
                if (!isMounted && (isLikelyMountOrVehicle || lower.includes('passenger') || lower.includes('occupant'))) {
                  passengersOrRiders.push({ name: pName, weight: pWeight || undefined });
                  if (pWeight > 0) passengerWeight += pWeight;
                }
              }
            }
            if (!foundBracket && isLikelyMountOrVehicle && !isMounted) {
              if (!isSelfReference(val)) {
                const weightMatch = val.match(/([0-9]+(?:\.[0-9]+)?)\s*lbs?/i);
                if (weightMatch) {
                  const rawW = parseFloat(weightMatch[1]);
                  if (Math.abs(rawW - bodyWeight) > 0.5) {
                    passengerWeight += rawW;
                  }
                }
              }
            }
          }
        }
      }

      // 2. [STATS & MODIFIERS] Section
      if (currentSection.includes('STAT') || currentSection.includes('MODIFIER')) {
        // Speed
        if (lower.includes('speed:')) {
          // Check for unmounted base speed if present e.g. "Unmounted base: 1.5 m/s / 4.5 m/s" or "(Unmounted: 1.5 m/s, 4.5 m/s)"
          const unmountedMatch = line.match(/unmounted(?:\s+base)?[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?[,\s/]+([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (unmountedMatch) {
            baseWalkingSpeed = parseFloat(unmountedMatch[1]);
            baseRunningSpeed = parseFloat(unmountedMatch[2]);
          }

          if (lower.includes('mounted on') || lower.includes('riding')) {
            isMounted = true;
            const mountMatch = line.match(/\[([^\]]+)\]/);
            if (mountMatch) {
              mountedEntityName = mountMatch[1].trim();
            }
          }

          const walkMatch = line.match(/walking[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i) ||
                            line.match(/pushing[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (walkMatch) {
            currentWalkingSpeed = parseFloat(walkMatch[1]);
            if (!unmountedMatch && !isMounted) baseWalkingSpeed = currentWalkingSpeed;
          }
          const runMatch = line.match(/(?:running|galloping|gallop|coasting)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (runMatch) {
            currentRunningSpeed = parseFloat(runMatch[1]);
            if (!unmountedMatch && !isMounted) baseRunningSpeed = currentRunningSpeed;
          }
        }

        // Strength & Multiplier
        if (lower.includes('strength:')) {
          const multMatch = line.match(/(?:multiplier|lift multiplier)[:=\s]*([0-9]+(?:\.[0-9]+)?)x?/i);
          if (multMatch) {
            strengthMultiplier = parseFloat(multMatch[1]);
          } else {
            // Check formula +X%(1000)
            const pctMatch = line.match(/([+-]?\d+)\s*%\s*\(\s*1000\s*\)/);
            if (pctMatch) {
              const bonus = parseInt(pctMatch[1]) / 1000;
              strengthMultiplier = Math.max(0.2, 1.0 + bonus);
            }
          }
        }

        // Dynamic Encumbrance Rule / Threshold in Character Stats
        // e.g. "Encumbrance: Immune (Slime biology absorbs items without slowing)"
        // or "Encumbrance Threshold: None / Immune" or "Encumbrance Threshold: 35%"
        if (lower.includes('encumbrance')) {
          if (
            lower.includes('immune') ||
            lower.includes('none') ||
            lower.includes('no penalty') ||
            lower.includes('unaffected') ||
            lower.includes('not affected') ||
            lower.includes('does not apply')
          ) {
            encumbranceApplies = false;
            encumbranceImmunityReason = line.split(/[:=]/).slice(1).join(':').trim() || 'Immune to encumbrance penalty';
            encumbranceEffectDescription = encumbranceImmunityReason;
          } else {
            const customPctMatch = line.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
            if (customPctMatch) {
              encumbranceThreshold = parseFloat(customPctMatch[1]) / 100;
              encumbranceApplies = true;
            }
            if (line.includes(':')) {
              encumbranceEffectDescription = line.split(/[:=]/).slice(1).join(':').trim();
            }
          }
        }

        // Max lift strength
        if (lower.includes('max lift') || lower.includes('lift strength:')) {
          const liftMatch = this.parseWeight(line);
          if (liftMatch.applies && liftMatch.weight > 0) {
            maxLiftStrength = liftMatch.weight;
          }
        }
      }

      // 3. [CONTAINERS & CARRIED GEAR] or [INVENTORY & EQUIPMENT]
      if (
        currentSection.includes('INVENTORY') ||
        currentSection.includes('CONTAINER') ||
        currentSection.includes('EQUIPMENT') ||
        currentSection.includes('GEAR')
      ) {
        // A subsection header line cannot have item stats (weight:, dimensions:, or lbs with a weight definition)
        const hasItemStat = lower.includes('weight:') || lower.includes('dimensions:') || /\b[0-9]+(?:\.[0-9]+)?\s*lbs?\b/i.test(lower);

        // Check for subsection headers
        const isContainersHeader = !hasItemStat && (
          (lower.startsWith('- containers') || lower.startsWith('* containers') || lower.startsWith('containers') || lower.includes('equipped containers') || lower.includes('containers carried') || lower.includes('containers equipped')) &&
          !lower.includes('inside') && !lower.includes('content') && !lower.includes('inventory')
        );

        if (isContainersHeader) {
          activeSubsection = 'containers';
          activeContainerName = '';
          continue;
        }

        // Holding anatomy line
        if (lower.startsWith('- holding anatomy') || lower.startsWith('holding anatomy') || lower.startsWith('* holding anatomy')) {
          customHoldingAnatomy = line.split(/[:=]/).slice(1).join(':').trim();
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('none') || cLower.includes('limbless') || cLower.includes('amorphous') || cLower.includes('spectral')) {
            customHoldingApplies = false;
            customHoldingMax = 0;
          } else if (/\b(4|four)\b/i.test(cLower) || cLower.includes('4 arms') || cLower.includes('4 hands') || cLower.includes('4 items')) {
            customHoldingApplies = true;
            customHoldingMax = 4;
          } else if (/\b(3|three)\b/i.test(cLower) || cLower.includes('3 arms') || cLower.includes('3 hands') || cLower.includes('3 items')) {
            customHoldingApplies = true;
            customHoldingMax = 3;
          } else if (
            cLower.includes('2 hands') || cLower.includes('two hands') ||
            cLower.includes('2 arms') || cLower.includes('two arms') ||
            cLower.includes('humanoid') || cLower.includes('2 items') || cLower.includes('two items')
          ) {
            customHoldingApplies = true;
            customHoldingMax = 2;
          } else if (
            cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('teeth') || cLower.includes('beak') ||
            cLower.includes('1 hand') || cLower.includes('one hand') || cLower.includes('1 arm') || cLower.includes('one arm') ||
            (/\b1\s*item\s*(?:hold|max)\b/i.test(cLower) && !cLower.includes('per hand') && !cLower.includes('each hand'))
          ) {
            customHoldingApplies = true;
            customHoldingMax = 1;
          } else {
            customHoldingApplies = true;
            customHoldingMax = 2;
          }
          continue;
        }

        // Holding capacity line
        if (lower.startsWith('- holding capacity') || lower.startsWith('holding capacity') || lower.startsWith('* holding capacity') || lower.includes('capacity & status')) {
          const countMatch = line.match(/(\d+)\s*\/\s*(\d+)/);
          if (countMatch) {
            customHoldingMax = parseInt(countMatch[2]);
          }
          continue;
        }

        const isHoldingHeader = !hasItemStat && (
          lower.includes('currently holding') ||
          lower.includes('held items') ||
          lower.includes('items being held') ||
          lower.includes('items currently held') ||
          lower.startsWith('- holding:') ||
          lower.startsWith('* holding:') ||
          lower.startsWith('holding:')
        );

        if (isHoldingHeader) {
          activeSubsection = 'holding';
          activeContainerName = '';
          continue;
        }

        const isEquippedHeader = !hasItemStat && (
          lower.includes('equipped gear') ||
          lower.includes('equipped armor') ||
          lower.includes('equipped items') ||
          lower.includes('worn gear') ||
          lower.startsWith('- equipped:') ||
          lower.startsWith('* equipped:') ||
          lower.startsWith('equipped:') ||
          lower.startsWith('- worn:') ||
          lower.startsWith('* worn:') ||
          lower.startsWith('worn:')
        );

        if (isEquippedHeader) {
          activeSubsection = 'equipped';
          activeContainerName = '';
          continue;
        }

        const isInsideContainersHeader = !hasItemStat && (
          lower.includes('inside container') ||
          lower.includes('inside containers') ||
          lower.includes('in container') ||
          lower.includes('in containers') ||
          lower.includes('carried inventory') ||
          lower.includes('container inventory') ||
          lower.includes('container contents') ||
          lower.includes('items inside') ||
          lower.includes('items in container') ||
          lower.includes('items in backpack') ||
          lower.includes('inside backpack') ||
          lower.includes('inside satchel') ||
          lower.includes('inside pouch') ||
          lower.includes('backpack contents') ||
          lower.includes('satchel contents') ||
          lower.includes('pouch contents') ||
          (lower.startsWith('- carried items') && !lower.includes('loose')) ||
          (lower.startsWith('carried items') && !lower.includes('loose'))
        );

        if (isInsideContainersHeader) {
          activeSubsection = 'inside_containers';
          if (!activeContainerName && containers.length > 0) {
            activeContainerName = containers[0].name;
          }
          continue;
        }

        // Check if line switches active container (e.g. "- Backpack:" or "- Inside Leather Satchel:" or "Small Leather Backpack:")
        // It must NOT be in container definition mode, must not have item stats, and must match a known container.
        if (activeSubsection !== 'containers' && containers.length > 0 && !hasItemStat) {
          const strippedName = line.replace(/^[-*•>\s]+/, '').replace(/^[\(\[]?\s*(?:inside|in(?:\s*container)?|stored\s+in)\s+/i, '').replace(/[\)\]]\s*[:=-]?\s*$/, '').replace(/[:=].*$/, '').trim();
          if (strippedName) {
            const matching = this.findMatchingContainer(containers, strippedName);
            if (matching && (line.endsWith(':') || line.includes(':') || lower.includes('contents') || lower.includes('inside') || lower.startsWith('• (inside') || lower.startsWith('- (inside') || lower.startsWith('(inside'))) {
              activeSubsection = 'inside_containers';
              activeContainerName = matching.name;
              continue;
            }
          }
        }

        // Ignore metadata notes, empty markers, or summary lines
        if (
          lower.startsWith('- auto-equip') ||
          lower.startsWith('auto-equip') ||
          lower.includes('oversized / wearable items rule') ||
          lower.startsWith('- total carried weight') ||
          lower.startsWith('total carried weight') ||
          lower.startsWith('- total weight') ||
          lower.includes('slots & starting capacity') ||
          lower.includes('hand slots') ||
          lower.includes('starting capacity') ||
          lower.includes('starting carrying limit') ||
          lower === '(none)' ||
          lower === '- (none)' ||
          lower === '* (none)' ||
          lower === 'none' ||
          lower === '0 lbs (none)' ||
          lower === '- 0 lbs (none)'
        ) {
          continue;
        }

        // Accounting header e.g. "- Starting Carried Items Accounting (Rule: <= 2x Hand Slots = Max 4 Items):"
        const isAccountingHeader = !hasItemStat && (
          lower.includes('starting carried items accounting') ||
          lower.includes('starting items accounting') ||
          lower.includes('carried items accounting') ||
          lower.includes('items accounting') ||
          lower.includes('starting carried items limit') ||
          lower.includes('total starting carried items count') ||
          lower.includes('starting carried items count') ||
          lower.includes('starting carrying limit') ||
          lower.includes('starting carried items rule')
        );

        if (isAccountingHeader) {
          activeSubsection = 'accounting';
          activeContainerName = '';
          continue;
        }

        if (activeSubsection === 'accounting') {
          // If inside accounting block, ignore tallies, rules, and summary lines
          if (
            /^[-\s*•]*\d+\.\s*/.test(line) ||
            lower.includes('rule:') ||
            lower.includes('items count') ||
            lower.includes('held in hand') ||
            lower.includes('equipped gear') ||
            lower.includes('carried in container') ||
            lower.includes('equipped container') ||
            lower.includes('total starting')
          ) {
            continue;
          }
        }

        // Container definition: e.g. "Backpack: Dimensions 18 inches tall by 12 inches area, Max Capacity: 40 lbs"
        const rawItemName = line.split(/[|:=]/)[0].replace(/^[-*•>\s]+/, '').replace(/^\[|\]$/g, '').trim();
        const itemNameLower = rawItemName.toLowerCase();
        const containerKeywords = ['backpack', 'satchel', 'pouch', 'sack', 'bag', 'haversack', 'rucksack', 'quiver', 'bandolier', 'scabbard', 'pocket', 'trunk', 'crate', 'case', 'holster', 'wallet', 'chit wallet', 'purse', 'cardholder', 'billfold', 'money clip', 'money belt'];
        const isChestContainer = /\bchest\b/i.test(itemNameLower) && !/\b(?:chestplate|chest\s*plate|chest\s*armor|chest\s*guard|across\s*chest)\b/i.test(itemNameLower);
        const hasContainerKeyword = containerKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(itemNameLower)) || isChestContainer;
        const isExplicitItemInContainer = /\bcontainer\s*[:=]/i.test(lower) || /\b(?:inside|in)\s+(?:container|backpack|satchel|pouch|bag|quiver|chest|sack|case|haversack)\b/i.test(lower);

        const isIndentedItem = /^\s+[-*•>]/.test(line);
        const hasContainerSpec =
          lower.includes('capacity') ||
          lower.includes('max space') ||
          lower.includes('max weight') ||
          lower.includes('max:') ||
          lower.includes('holds') ||
          lower.includes('empty weight');

        const isContainerDef = !isIndentedItem && !isExplicitItemInContainer && !lower.startsWith('total') && (
          (hasContainerKeyword && hasContainerSpec) ||
          (activeSubsection === 'containers' && (hasContainerKeyword || hasContainerSpec)) ||
          (hasContainerKeyword && activeSubsection !== 'equipped' && activeSubsection !== 'holding' && !hasItemStat)
        );

        if (isContainerDef) {
          let name = line.split(/[|:=]/)[0].replace(/^[-*•>\s]+/, '').trim();
          name = name.replace(/^\[|\]$/g, '').trim();
          const parenIdx = name.search(/[\(\[]/);
          if (parenIdx > 0) {
            name = name.substring(0, parenIdx).trim();
          }
          if (!name) name = 'Backpack';

          // Distinguish container empty weight from max capacity
          let containerWeight = 1.0;
          const emptyWeightMatch = line.match(/(?:empty\s*weight|weight|wt)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/i);
          const capMatch = line.match(/(?:max\s*(?:weight|capacity|space)|capacity|holds\s*up\s*to|max)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/i);
          if (emptyWeightMatch) {
            containerWeight = parseFloat(emptyWeightMatch[1]);
          } else {
            const wResult = this.parseWeight(line);
            if (wResult.applies && wResult.weight > 0 && (!capMatch || Math.abs(wResult.weight - parseFloat(capMatch[1])) > 0.01)) {
              containerWeight = wResult.weight;
            }
          }

          let maxWeightCapacity: number | undefined;
          if (capMatch) {
            maxWeightCapacity = parseFloat(capMatch[1]);
          } else {
            maxWeightCapacity = 25; // Standard fallback if AI omitted
          }

          let maxDim = this.parseDimensions(line);
          if (!maxDim.raw) {
            maxDim = this.parseDimensions('12x8x4 inches');
          }

          activeContainerName = name;
          activeSubsection = 'inside_containers';
          const contMaxVol = maxDim.applies && (maxDim.height || 0) * (maxDim.width || 0) * (maxDim.depth || 0) > 0
            ? Math.round((maxDim.height || 0) * (maxDim.width || 0) * (maxDim.depth || 0) * 100) / 100
            : undefined;

          const stretch = WeightInventoryEngine.getContainerStretchability(name, line);
          const effectiveMaxVol = contMaxVol ? Math.round(contMaxVol * stretch.stretchFactor * 100) / 100 : undefined;

          const existingCont = this.findMatchingContainer(containers, name);
          if (existingCont) {
            if (maxWeightCapacity && (!existingCont.maxWeightCapacity || existingCont.maxWeightCapacity === 25)) {
              existingCont.maxWeightCapacity = maxWeightCapacity;
            }
            if (maxDim.raw && (!existingCont.dimensions.raw || existingCont.dimensions.raw === '12x8x4 inches')) {
              existingCont.dimensions = maxDim;
              existingCont.maxDimensions = maxDim;
              existingCont.currentDimensions = maxDim;
              existingCont.maxVolume = contMaxVol;
              existingCont.effectiveMaxVolume = effectiveMaxVol;
            }
            if (emptyWeightMatch) {
              existingCont.weight = containerWeight;
            }
          } else {
            containers.push({
              name,
              weight: containerWeight,
              dimensions: maxDim,
              maxDimensions: maxDim,
              currentDimensions: maxDim,
              maxWeightCapacity,
              maxVolume: contMaxVol,
              stretchFactor: stretch.stretchFactor,
              effectiveMaxVolume: effectiveMaxVol,
              isRigid: stretch.isRigid,
              isStretched: false,
              currentStretchRatio: 1.0,
              stretchReason: stretch.description,
              currentVolume: 0,
              currencyCount: 0,
              currencyWeight: 0,
              currencyVolume: 0,
              items: [],
              currentItemsWeight: 0,
              totalWeight: containerWeight,
              hasOverflow: false,
              hasDoesNotFit: false,
              rawText: line
            });
          }
          continue;
        }

        // Check if line is a currency entry in container: handled via carriedCurrencies
        const contCurrEntries = WeightInventoryEngine.parseCurrencyEntries(line, undefined, activeContainerName);
        if (contCurrEntries.length > 0) {
          for (const ce of contCurrEntries) {
            const existingIdx = carriedCurrencies.findIndex(existing =>
              (existing.name.toLowerCase() === ce.name.toLowerCase() || (existing.name === 'Dollars' && /dollar|usd|cash/i.test(ce.name))) &&
              (!ce.container || !existing.container || existing.container.toLowerCase().includes(ce.container.toLowerCase()) || ce.container.toLowerCase().includes(existing.container.toLowerCase()))
            );
            if (existingIdx >= 0) {
              if (ce.amount > carriedCurrencies[existingIdx].amount) {
                carriedCurrencies[existingIdx].amount = ce.amount;
              }
              if (!carriedCurrencies[existingIdx].container && ce.container) {
                carriedCurrencies[existingIdx].container = ce.container;
              }
            } else {
              carriedCurrencies.push(ce);
            }
            explicitCarriedNone = false;
          }
          continue;
        }

        // Check if line is an item
        const item = this.parseItemLine(line, (activeSubsection === 'inside_containers' || activeSubsection === 'containers') ? activeContainerName : undefined);
        if (item) {
          // If explicitly marked or parsed in equipped subsection
          if (
            activeSubsection === 'equipped' ||
            lower.includes('equipped: yes') ||
            lower.includes('worn: yes') ||
            lower.includes('wielding') ||
            lower.includes('wearing')
          ) {
            item.category = 'equipped';
            item.containerName = undefined;
            item.isOverflow = false;
            item.doesNotFit = false;
            equippedGear.push(item);
          } else if (activeSubsection === 'inside_containers' || activeContainerName || item.containerName) {
            // Put in targeted or active container
            let cont = this.findMatchingContainer(containers, item.containerName || activeContainerName);

            // If an item has no matching container found by name:
            // Check if any container exists in containers
            if (!cont && containers.length > 0 && !item.containerName) {
              cont = containers[0];
            }

            // Auto-recovery: If items in container were written without an explicit container header/definition,
            // or a named container was specified that doesn't exist yet, auto-create it so items are NEVER lost!
            if (!cont) {
              const defaultName = item.containerName || activeContainerName || 'Backpack';
              const nameLower = defaultName.toLowerCase();
              const isPocketOrGear =
                nameLower.includes('pocket') ||
                nameLower.includes('compartment') ||
                equippedGear.some(eq => {
                  const eqName = eq.name.toLowerCase();
                  return nameLower.includes(eqName) || eqName.split(/[\s&/]+/g).some(part => part.length > 3 && nameLower.includes(part));
                });

              let defWeight = 2.0;
              let defCap = 40;
              let defDimStr = '18x12x8 inches';

              if (isPocketOrGear) {
                defWeight = 0.0; // Pockets and compartments in equipped clothing add 0 lbs empty weight
                defCap = 2.0;
                defDimStr = '6x5x1.5 inches';
              } else if (nameLower.includes('pouch') || nameLower.includes('wallet') || nameLower.includes('purse')) {
                defWeight = 0.2;
                defCap = 2.5;
                defDimStr = '6x4x2 inches';
              } else if (nameLower.includes('satchel') || nameLower.includes('haversack')) {
                defWeight = 1.0;
                defCap = 15;
                defDimStr = '12x10x4 inches';
              } else if (nameLower.includes('holster') || nameLower.includes('sheath') || nameLower.includes('scabbard')) {
                defWeight = 0.5;
                defCap = 5;
                defDimStr = '10x4x2 inches';
              }

              const defaultDim = this.parseDimensions(defDimStr);
              const autoVol = defaultDim.applies && (defaultDim.height || 0) * (defaultDim.width || 0) * (defaultDim.depth || 0) > 0
                ? Math.round((defaultDim.height || 0) * (defaultDim.width || 0) * (defaultDim.depth || 0) * 100) / 100
                : undefined;
              const stretch = WeightInventoryEngine.getContainerStretchability(defaultName, '');
              const effectiveMaxVol = autoVol ? Math.round(autoVol * stretch.stretchFactor * 100) / 100 : undefined;
              cont = {
                name: defaultName,
                weight: defWeight,
                dimensions: defaultDim,
                maxDimensions: defaultDim,
                maxWeightCapacity: defCap,
                maxVolume: autoVol,
                stretchFactor: stretch.stretchFactor,
                effectiveMaxVolume: effectiveMaxVol,
                isRigid: stretch.isRigid,
                isStretched: false,
                stretchReason: stretch.description,
                currentVolume: 0,
                currencyCount: 0,
                currencyWeight: 0,
                currencyVolume: 0,
                items: [],
                currentItemsWeight: 0,
                totalWeight: defWeight,
                hasOverflow: false,
                hasDoesNotFit: false,
                rawText: `- ${defaultName}: Dimensions ${defDimStr}, Max Capacity: ${defCap} lbs, Weight: ${defWeight} lbs`
              };
              containers.push(cont);
            }

            item.category = 'carried';
            item.containerName = cont.name;

            // Check container fit with stretchability/elasticity
            const fitCheck = this.checkContainerFit(item, cont.maxDimensions, {
              currentWeight: cont.currentItemsWeight,
              maxWeight: cont.maxWeightCapacity,
              maxVolume: cont.maxVolume,
              currentVolume: cont.currentVolume,
              stretchFactor: cont.stretchFactor,
              effectiveMaxVolume: cont.effectiveMaxVolume,
              isRigid: cont.isRigid
            });

            item.isFoldable = fitCheck.isFoldable;
            item.fitStatus = fitCheck.status;

            if (fitCheck.doesNotFit) {
              item.doesNotFit = true;
              item.overflowReason = fitCheck.reason;
              cont.hasDoesNotFit = true;
            } else if (fitCheck.isOverflow) {
              item.isOverflow = true;
              item.overflowReason = fitCheck.reason;
              cont.hasOverflow = true;
            }

            cont.items.push(item);
            cont.currentItemsWeight = Math.round((cont.currentItemsWeight + item.weight) * 100) / 100;
            cont.totalWeight = Math.round((cont.totalWeight + item.weight) * 100) / 100;
            const itemVol = item.dimensions?.applies && (item.dimensions.height || 0) * (item.dimensions.width || 0) * (item.dimensions.depth || 0) > 0
              ? (item.dimensions.height || 0) * (item.dimensions.width || 0) * (item.dimensions.depth || 0)
              : 0;
            cont.currentVolume = Math.round(((cont.currentVolume || 0) + itemVol) * 100) / 100;
            WeightInventoryEngine.updateContainerStretchDimensions(cont);
          } else if (lower.includes('equipped') || lower.includes('wielding') || lower.includes('wearing') || lower.includes('armor:')) {
            item.category = 'equipped';
            equippedGear.push(item);
          } else {
            carriedItems.push(item);
          }
        }
      }

      // 3.5. [CURRENTLY HOLDING] Section or Holding Subsection
      if (
        currentSection.includes('HOLDING') ||
        currentSection.includes('HELD') ||
        activeSubsection === 'holding'
      ) {
        // Holding Anatomy line
        if (
          lower.includes('holding anatomy:') ||
          lower.includes('holding limbs:') ||
          lower.includes('holding appendages:') ||
          lower.startsWith('- anatomy:') ||
          lower.startsWith('* anatomy:') ||
          lower.startsWith('anatomy:')
        ) {
          customHoldingAnatomy = line.split(/[:=]/).slice(1).join(':').trim();
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('none') || cLower.includes('incorporeal') || cLower.includes('formless') || cLower.includes('cannot hold')) {
            customHoldingApplies = false;
            customHoldingMax = 0;
          } else if (/\b(4|four)\b/i.test(cLower) || cLower.includes('4 arms') || cLower.includes('4 hands') || cLower.includes('4 items')) {
            customHoldingApplies = true;
            customHoldingMax = 4;
          } else if (/\b(3|three)\b/i.test(cLower) || cLower.includes('3 arms') || cLower.includes('3 hands') || cLower.includes('3 items')) {
            customHoldingApplies = true;
            customHoldingMax = 3;
          } else if (
            cLower.includes('2 hands') || cLower.includes('two hands') ||
            cLower.includes('2 arms') || cLower.includes('two arms') ||
            cLower.includes('humanoid') || cLower.includes('2 items') || cLower.includes('two items')
          ) {
            customHoldingApplies = true;
            customHoldingMax = 2;
          } else if (
            cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('teeth') || cLower.includes('beak') ||
            cLower.includes('1 hand') || cLower.includes('one hand') || cLower.includes('1 arm') || cLower.includes('one arm') ||
            (/\b1\s*item\s*(?:hold|max)\b/i.test(cLower) && !cLower.includes('per hand') && !cLower.includes('each hand'))
          ) {
            customHoldingApplies = true;
            customHoldingMax = 1;
          } else {
            customHoldingApplies = true;
            customHoldingMax = 2;
          }
          continue;
        }

        // Holding capacity / status line
        if (
          lower.includes('holding capacity') ||
          lower.includes('capacity & status') ||
          lower.includes('holding status') ||
          lower.includes('slots & starting capacity') ||
          lower.includes('hand slots') ||
          lower.includes('starting capacity') ||
          lower.includes('starting carrying limit') ||
          lower.startsWith('- capacity:') ||
          lower.startsWith('capacity:') ||
          lower.startsWith('- slots') ||
          lower.startsWith('slots') ||
          lower.startsWith('- hand slots') ||
          lower.startsWith('hand slots')
        ) {
          continue;
        }

        // Informational lines or instructions
        if (
          lower.includes('overflow rule') ||
          lower.includes('overflow mechanics') ||
          lower.includes('overflow strain') ||
          lower.includes('weight & size scaling') ||
          lower.includes('scaled accidental drop') ||
          lower.includes('scaled random chance') ||
          lower.includes('starting carried items limit') ||
          lower.includes('starting carrying limit') ||
          lower.includes('starting carrying items limit') ||
          lower.includes('during adventure rule') ||
          lower.includes('weight mandate') ||
          lower.includes('capacity mandate') ||
          lower.includes('holding mandate') ||
          lower.includes('holding anatomy') ||
          lower.includes('holding limbs') ||
          lower.includes('holding appendages') ||
          lower.includes('2 hands / arms (humanoid)') ||
          lower.startsWith('- items currently held:') ||
          lower.startsWith('* items currently held:') ||
          lower.startsWith('items currently held:') ||
          lower.startsWith('- held items:') ||
          lower.startsWith('held items:') ||
          lower.includes('(none') ||
          lower.includes('hands/appendages free') ||
          /^[-\s*•]*\d+\.\s*(?:overflow|weight|context|drop)/i.test(line)
        ) {
          continue;
        }

        // Parse held item line
        let defaultLimb = 'Hands';
        if (customHoldingAnatomy) {
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('teeth')) {
            defaultLimb = 'Held in Jaws';
          } else if (cLower.includes('beak')) {
            defaultLimb = 'Beak';
          } else if (cLower.includes('talon')) {
            defaultLimb = 'Talons';
          } else if (cLower.includes('tentacle')) {
            defaultLimb = 'Tentacles';
          } else if (cLower.includes('claws')) {
            defaultLimb = 'Claws';
          } else if (cLower.includes('trunk')) {
            defaultLimb = 'Trunk';
          }
        }

        const unwrapped = WeightInventoryEngine.unwrapHeldItem(line, defaultLimb);
        if (!unwrapped) {
          continue;
        }

        const item = this.parseItemLine(unwrapped.cleanText);
        if (item) {
          item.category = 'equipped';

          // If name is corrupted or contains limb/grip residue, recover from equippedGear or carriedItems
          if (WeightInventoryEngine.isLimbOrGripResidue(item.name) || /grip|two[- ]handed|\(two[- ]handed\)/i.test(item.name)) {
            const matchingEquipped = equippedGear.find(
              e => Math.abs(e.weight - item.weight) < 0.05 || (e.properties?.toLowerCase().includes('two-handed') && unwrapped.holdingLimb.includes('Two-Handed'))
            ) || carriedItems.find(
              c => Math.abs(c.weight - item.weight) < 0.05
            );
            if (matchingEquipped && !WeightInventoryEngine.isLimbOrGripResidue(matchingEquipped.name)) {
              item.name = matchingEquipped.name;
            } else {
              item.name = unwrapped.holdingLimb.includes('Two-Handed') ? 'Two-Handed Weapon' : 'Held Item';
            }
          }

          let occupiedSlots = 0;
          for (const existing of currentlyHolding) {
            if (!existing.isOverflowHold) {
              const takesTwo = existing.holdingLimb?.toLowerCase().includes('two-handed') || existing.holdingLimb?.toLowerCase().includes('both hands');
              occupiedSlots += takesTwo ? 2 : 1;
            }
          }
          const maxAllowed = customHoldingMax !== undefined ? customHoldingMax : 2;
          const isOverflow = occupiedSlots >= maxAllowed || (maxAllowed === 0 && (customHoldingApplies ?? true));
          const effectiveLimb = (!isOverflow && (unwrapped.holdingLimb.toLowerCase().includes('overflow') || unwrapped.holdingLimb.toLowerCase().includes('under arm')))
            ? (occupiedSlots === 0 ? 'Main Hand' : 'Off Hand')
            : unwrapped.holdingLimb;
          const heldItem: HeldItemInfo = {
            ...item,
            holdingLimb: effectiveLimb,
            isOverflowHold: isOverflow,
            overflowWarning: isOverflow ? 'Held with overflow; risks dropping or getting knocked down depending on narrative context.' : undefined
          };

          // Prevent duplicate held items caused by prior sync loops or accidental line replication
          const isDuplicate = currentlyHolding.some(
            existing =>
              (existing.name.toLowerCase() === item.name.toLowerCase() &&
                Math.abs(existing.weight - item.weight) < 0.001) ||
              (existing.holdingLimb.toLowerCase() === unwrapped.holdingLimb.toLowerCase() &&
                Math.abs(existing.weight - item.weight) < 0.001)
          );
          if (isDuplicate) {
            continue;
          }

          currentlyHolding.push(heldItem);
          continue;
        }
      }

      // [CURRENCY & FINANCIAL BALANCE]
      if (currentSection.includes('CURRENCY') || currentSection.includes('FINANCE') || currentSection.includes('WEALTH') || currentSection.includes('BALANCE')) {
        if (/^[-*•\s]*currency(?:\s*type)?[:=]/i.test(line)) {
          currencyType = line.split(/[:=]/)[1]?.trim() || currencyType;
          continue;
        }
        if (
          lower.startsWith('- stored') ||
          lower.startsWith('* stored') ||
          lower.startsWith('stored') ||
          lower.includes('remote balance') ||
          lower.includes('not on person') ||
          lower.startsWith('- remote') ||
          lower.startsWith('bank account')
        ) {
          activeCurrencySub = 'stored';
        } else if (
          lower.startsWith('- carried') ||
          lower.startsWith('* carried') ||
          lower.startsWith('carried') ||
          (lower.includes('on person') && !lower.includes('not on person'))
        ) {
          activeCurrencySub = 'carried';
        }

        if (activeCurrencySub === 'carried' && (lower.includes('none') || lower.includes('(0)') || lower === '* 0' || lower === '- 0' || lower.endsWith(': 0'))) {
          explicitCarriedNone = true;
          continue;
        }

        const entries = WeightInventoryEngine.parseCurrencyEntries(line);
        if (entries.length > 0) {
          if (activeCurrencySub === 'stored') {
            for (const ent of entries) {
              const matchIdx = storedCurrencies.findIndex(existing =>
                (existing.name.toLowerCase() === ent.name.toLowerCase() || (existing.name === 'Dollars' && /dollar|usd|cash/i.test(ent.name))) &&
                (!ent.location || !existing.location || existing.location.toLowerCase().includes(ent.location.toLowerCase()) || ent.location.toLowerCase().includes(existing.location.toLowerCase()) || (existing.isHiddenLocation && ent.isHiddenLocation))
              );
              if (matchIdx >= 0) {
                storedCurrencies[matchIdx].amount = ent.amount;
                if (!storedCurrencies[matchIdx].location && ent.location) {
                  storedCurrencies[matchIdx].location = ent.location;
                }
                if (!storedCurrencies[matchIdx].weight && ent.weight) {
                  storedCurrencies[matchIdx].weight = ent.weight;
                }
                if (!storedCurrencies[matchIdx].worth && ent.worth) {
                  storedCurrencies[matchIdx].worth = ent.worth;
                }
              } else {
                storedCurrencies.push(ent);
              }
            }
          } else {
            for (const ent of entries) {
              const matchIdx = carriedCurrencies.findIndex(existing =>
                (existing.name.toLowerCase() === ent.name.toLowerCase() || (existing.name === 'Dollars' && /dollar|usd|cash/i.test(ent.name))) &&
                (!ent.container || !existing.container || existing.container.toLowerCase().includes(ent.container.toLowerCase()) || ent.container.toLowerCase().includes(existing.container.toLowerCase()))
              );
              if (matchIdx >= 0) {
                // Master balance in [CURRENCY & FINANCIAL BALANCE] takes precedence
                carriedCurrencies[matchIdx].amount = ent.amount;
                if (!carriedCurrencies[matchIdx].container && ent.container) {
                  carriedCurrencies[matchIdx].container = ent.container;
                }
                if (!carriedCurrencies[matchIdx].weight && ent.weight) {
                  carriedCurrencies[matchIdx].weight = ent.weight;
                }
                if (!carriedCurrencies[matchIdx].worth && ent.worth) {
                  carriedCurrencies[matchIdx].worth = ent.worth;
                }
              } else {
                carriedCurrencies.push(ent);
              }
            }
          }
          continue;
        }
      }

      // Check for carried currency inside Inventory / Containers section
      // ALWAYS check containers/inventory lines: if a character has coins in a pouch or wallet, it must be recognized!
      if (currentSection.includes('INVENTORY') || currentSection.includes('CONTAINER') || currentSection.includes('CARRIED')) {
        const cEntries = WeightInventoryEngine.parseCurrencyEntries(line, undefined, activeContainerName);
        if (cEntries.length > 0) {
          for (const ce of cEntries) {
            const existingIdx = carriedCurrencies.findIndex(existing =>
              (existing.name.toLowerCase() === ce.name.toLowerCase() || (existing.name === 'Dollars' && /dollar|usd|cash/i.test(ce.name))) &&
              (!ce.container || !existing.container || existing.container.toLowerCase().includes(ce.container.toLowerCase()) || ce.container.toLowerCase().includes(existing.container.toLowerCase()))
            );
            if (existingIdx >= 0) {
              if (ce.amount > carriedCurrencies[existingIdx].amount) {
                carriedCurrencies[existingIdx].amount = ce.amount;
              }
              if (!carriedCurrencies[existingIdx].container && ce.container) {
                carriedCurrencies[existingIdx].container = ce.container;
              }
            } else {
              carriedCurrencies.push(ce);
            }
            // Having currency physically in a container or inventory invalidates explicitCarriedNone
            explicitCarriedNone = false;
          }
        }
      }

      // 4. [OWNED / STORED ITEMS (NOT ON PERSON)]
      if (currentSection.includes('OWNED') || currentSection.includes('STORED') || currentSection.includes('NOT ON PERSON')) {
        const item = this.parseItemLine(line);
        if (item) {
          item.category = 'stored';
          storedItems.push(item);
        }
        const sCurr = WeightInventoryEngine.parseCurrencyEntries(line, item?.location);
        if (sCurr.length > 0) {
          for (const ent of sCurr) {
            const matchIdx = storedCurrencies.findIndex(existing =>
              existing.amount === ent.amount &&
              (existing.name.toLowerCase() === ent.name.toLowerCase() || (existing.name === 'Dollars' && /dollar|usd|cash/i.test(ent.name))) &&
              (!ent.location || !existing.location || existing.location.toLowerCase().includes(ent.location.toLowerCase()) || ent.location.toLowerCase().includes(existing.location.toLowerCase()) || (existing.isHiddenLocation && ent.isHiddenLocation))
            );
            if (matchIdx >= 0) {
              if (!storedCurrencies[matchIdx].location && ent.location) {
                storedCurrencies[matchIdx].location = ent.location;
              }
              if (!storedCurrencies[matchIdx].weight && ent.weight) {
                storedCurrencies[matchIdx].weight = ent.weight;
              }
            } else {
              storedCurrencies.push(ent);
            }
          }
        }
      }

      // 5. [STATUS EFFECTS & LORE]
      if (currentSection.includes('STATUS') || currentSection.includes('EFFECT')) {
        const effMatch = line.match(/\[(?:Status|Effect):([^()]+)\(([^)]+)\)\]/i);
        if (effMatch) {
          const effName = effMatch[1].trim();
          const effBody = effMatch[2];
          const tempW = effBody.match(/tempweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
          const baseW = effBody.match(/baseweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
          const exp = effBody.match(/expires[:=\s]*([^;)]+)/i);
          const dur = effBody.match(/duration[:=\s]*([^;)]+)/i);
          const beg = effBody.match(/(?:began|started)[:=\s]*([^;)]+)/i);
          const app = effBody.match(/(?:temporary\s*appearance|appearance)[:=\s]*([^;)]+)/i);
          const chain = effBody.match(/(?:chainedeffect|nexteffect|leadsto|onexpire)[:=\s]*([^;)]+)/i);

          if (tempW && baseW) {
            activeWeightEffects.push({
              name: effName,
              expires: exp ? exp[1].trim() : undefined,
              target: effName,
              tempVal: parseFloat(tempW[1]),
              baseVal: parseFloat(baseW[1])
            });
          }

          const isExp = WeightInventoryEngine.isStatusEffectExpired(
            exp ? exp[1].trim() : undefined,
            dur ? dur[1].trim() : undefined,
            beg ? beg[1].trim() : undefined,
            currentTimestamp
          );

          activeStatusEffectsList.push({
            name: effName,
            rawText: line.trim(),
            duration: dur ? dur[1].trim() : undefined,
            expires: exp ? exp[1].trim() : undefined,
            began: beg ? beg[1].trim() : undefined,
            appearance: app ? app[1].trim() : undefined,
            tempWeight: tempW ? parseFloat(tempW[1]) : undefined,
            baseWeight: baseW ? parseFloat(baseW[1]) : undefined,
            chainedEffect: chain ? chain[1].trim() : undefined,
            isExpired: isExp
          });
        }
      }
    }

    // Reconcile Carried vs Stored Currencies:
    // If the character has an equipped wallet, chit wallet, coin pouch, cardholder, money belt, or purse:
    const carriedWallets = containers.filter(c => WeightInventoryEngine.isContainerName(c.name) || /wallet|pouch|purse|cardholder|money\s*belt/i.test(c.name));
    if (carriedWallets.length > 0) {
      // 1. If any stored currency explicitly references a carried container or has container set, move to carriedCurrencies
      for (let si = storedCurrencies.length - 1; si >= 0; si--) {
        const sc = storedCurrencies[si];
        const locLower = (sc.location || '').toLowerCase();
        const contLower = (sc.container || '').toLowerCase();
        const matchesWallet = carriedWallets.some(w => {
          const wLower = w.name.toLowerCase();
          return contLower.includes(wLower) || locLower.includes(wLower) || (locLower.includes('inside') && locLower.includes('wallet')) || locLower.includes('pouch');
        });
        if (matchesWallet || sc.container) {
          const targetCont = sc.container || carriedWallets[0].name;
          sc.container = targetCont;
          sc.location = undefined;
          sc.isHiddenLocation = false;
          carriedCurrencies.push(sc);
          storedCurrencies.splice(si, 1);
          explicitCarriedNone = false;
        }
      }

      // 2. If carriedCurrencies is empty (or 0) BUT storedCurrencies has funds with NO distinct external storage location (e.g. no bank account, vault, cottage, strongbox, hidden stash):
      // The AI mistakenly put starting carried money / digital credits under Stored / Remote!
      if (carriedCurrencies.length === 0 && storedCurrencies.length > 0) {
        for (let si = storedCurrencies.length - 1; si >= 0; si--) {
          const sc = storedCurrencies[si];
          const loc = sc.location ? sc.location.trim() : '';
          const locLower = loc.toLowerCase();
          const nameLower = sc.name.toLowerCase();
          const isRemoteBankOrVault = /(?:bank|vault|branch|relay|cottage|house|home|stash|chest|strongbox|box|safe|bunker|depository|hide\[)/i.test(locLower);
          const isGenericOrSelf = !loc || locLower === 'none' || locLower === '0' || locLower === nameLower || locLower.includes(nameLower) || nameLower.includes(locLower);
          if (!isRemoteBankOrVault || isGenericOrSelf) {
            sc.container = carriedWallets[0].name;
            sc.location = undefined;
            sc.isHiddenLocation = false;
            carriedCurrencies.push(sc);
            storedCurrencies.splice(si, 1);
            explicitCarriedNone = false;
          }
        }
      }
    }

    // Ensure Max Lift Strength matches standard human baseline (100% of body weight for 1.0x strength)
    maxLiftStrength = Math.round(bodyWeight * strengthMultiplier);

    // Calculate Holding Capacity and Status dynamically based on character's anatomy
    let holdingCapacityApplies = customHoldingApplies !== undefined ? customHoldingApplies : true;
    let holdingLimbsDescription = customHoldingAnatomy || '2 Hands / Arms (Humanoid)';
    let maxStandardHoldCount = customHoldingMax !== undefined ? customHoldingMax : 2;

    const lowerType = characterType ? characterType.toLowerCase() : '';
    if (customHoldingApplies === undefined && (lowerType.includes('slime') || lowerType.includes('ghost') || lowerType.includes('incorporeal') || lowerType.includes('snake') || lowerType.includes('serpent'))) {
      holdingCapacityApplies = false;
      holdingLimbsDescription = 'None (Limbless / Amorphous biology)';
      maxStandardHoldCount = 0;
    } else if (customHoldingApplies === undefined && (lowerType.includes('dog') || lowerType.includes('wolf') || lowerType.includes('canine') || lowerType.includes('horse') || lowerType.includes('feline'))) {
      holdingCapacityApplies = true;
      holdingLimbsDescription = 'Mouth / Jaws (Quadruped - 1 item hold)';
      maxStandardHoldCount = 1;
    }

    // Auto-populate held items from equipped weapons/shields if currentlyHolding is empty
    if (currentlyHolding.length === 0 && holdingCapacityApplies && maxStandardHoldCount > 0 && equippedGear.length > 0) {
      const weaponShieldWords = [
        'sword', 'dagger', 'blade', 'spear', 'staff', 'bow', 'axe', 'mace', 'wand',
        'shield', 'lantern', 'torch', 'hammer', 'scythe', 'rifle', 'crossbow', 'gun',
        'blaster', 'musket', 'shotgun', 'carbine', 'pistol', 'revolver', 'sling'
      ];
      for (const eq of equippedGear) {
        const eqLower = eq.name.toLowerCase();
        if (weaponShieldWords.some(w => eqLower.includes(w))) {
          // Ranged weapons (bows, crossbows, rifles, muskets, etc.) are usually held in 1 hand when equipped or carried.
          // They only require 2 hands when actively nocking/drawing, aiming down sights, or when contextual narrative dictates two-handed use.
          const isRanged = eqLower.includes('bow') || eqLower.includes('crossbow') || eqLower.includes('rifle') ||
                           eqLower.includes('musket') || eqLower.includes('shotgun') || eqLower.includes('blaster') ||
                           eqLower.includes('carbine') || eqLower.includes('gun') || eqLower.includes('sling');
          const isActivelyTwoHandedRanged = eqLower.includes('bow and arrow') || eqLower.includes('nocked arrow') ||
                                           eqLower.includes('aiming') || eqLower.includes('drawn string') || eqLower.includes('braced');
          const isTwoHandedMelee = eqLower.includes('greatsword') || eqLower.includes('greataxe') || eqLower.includes('maul') ||
                                  eqLower.includes('greatclub') || eqLower.includes('halberd') || eqLower.includes('pike') ||
                                  (!isRanged && (eqLower.includes('staff') || eqLower.includes('spear') || eqLower.includes('two-handed')));
          const isTwoHanded = isActivelyTwoHandedRanged || isTwoHandedMelee;
          const limb = isTwoHanded ? 'Both Hands (Two-Handed)' : (currentlyHolding.length === 0 ? 'Main Hand' : 'Off Hand');
          if (currentlyHolding.length >= maxStandardHoldCount) {
            break;
          }
          currentlyHolding.push({
            ...eq,
            holdingLimb: limb,
            isOverflowHold: false,
            overflowWarning: undefined
          });
          if (isTwoHanded && maxStandardHoldCount <= 2) {
            break;
          }
        }
      }
    }

    // Authoritative slot assignment and overflow resolution for held items:
    // If character's held items fit within maxStandardHoldCount, NONE of them can be in overflow!
    let remainingStandardSlots = maxStandardHoldCount;
    for (const h of currentlyHolding) {
      const isTwoHanded = h.holdingLimb?.toLowerCase().includes('two-handed') ||
                          h.holdingLimb?.toLowerCase().includes('both hands') ||
                          h.name.toLowerCase().includes('two-handed') ||
                          h.name.toLowerCase().includes('greatsword') ||
                          h.name.toLowerCase().includes('greataxe') ||
                          h.name.toLowerCase().includes('halberd') ||
                          h.name.toLowerCase().includes('pike') ||
                          h.name.toLowerCase().includes('maul');
      const requiredSlots = isTwoHanded ? Math.min(2, maxStandardHoldCount || 2) : 1;

      if (holdingCapacityApplies && remainingStandardSlots >= requiredSlots) {
        h.isOverflowHold = false;
        h.overflowWarning = undefined;
        h.dropChancePercent = undefined;
        remainingStandardSlots -= requiredSlots;

        // If limb was tagged 'Overflow Hold' or 'under arm' from prior state, restore to legitimate limb
        if (h.holdingLimb?.toLowerCase().includes('overflow') || h.holdingLimb?.toLowerCase().includes('under arm')) {
          if (isTwoHanded && maxStandardHoldCount >= 2) {
            h.holdingLimb = 'Both Hands (Two-Handed)';
          } else if (remainingStandardSlots === maxStandardHoldCount - requiredSlots) {
            h.holdingLimb = 'Main Hand';
          } else {
            h.holdingLimb = 'Off Hand';
          }
        }
      } else if (holdingCapacityApplies) {
        h.isOverflowHold = true;
        if (!h.holdingLimb || (!h.holdingLimb.toLowerCase().includes('overflow') && !h.holdingLimb.toLowerCase().includes('under arm'))) {
          h.holdingLimb = 'Overflow Hold';
        }
      } else {
        h.isOverflowHold = false;
        h.overflowWarning = undefined;
        h.dropChancePercent = undefined;
      }
    }

    let occupiedSlots = 0;
    for (const h of currentlyHolding) {
      if (!h.isOverflowHold) {
        const takesTwo = h.holdingLimb?.toLowerCase().includes('two-handed') || h.holdingLimb?.toLowerCase().includes('both hands');
        occupiedSlots += takesTwo ? 2 : 1;
      }
    }
    const isFull = holdingCapacityApplies && (occupiedSlots >= maxStandardHoldCount);
    const hasOverflowHold = currentlyHolding.some(h => h.isOverflowHold);
    const freeSlots = holdingCapacityApplies ? Math.max(0, maxStandardHoldCount - occupiedSlots) : 0;

    const handSlots = maxStandardHoldCount;
    const maxStartingCarryingItems = WeightInventoryEngine.getMaxStartingCarryingItems(handSlots);

    // Collect all overflow items across currentlyHolding and containers
    const overflowHeld = currentlyHolding.filter(h => h.isOverflowHold);
    const overflowContItems: ItemInfo[] = [];
    for (const cont of containers) {
      for (const it of cont.items) {
        if (it.isOverflow) {
          overflowContItems.push(it);
        }
      }
    }
    const allOverflowItems = [...overflowHeld, ...overflowContItems];
    const totalOverflowCount = allOverflowItems.length;

    // Calculate scaled accidental drop chances:
    // "the more items added to overflow and the heavier and bigger each item, the bigger chance of dropping
    //  by accident based on context and the scaled random chance which scales for heavier bigger items
    //  and bigger heavier items have higher chance of dropping than smaller/lighter ones."
    const dropProbResult = WeightInventoryEngine.calculateOverflowDropProbabilities(allOverflowItems, 'normal');
    const overallOverflowDropChancePercent = dropProbResult.overallChancePercent;

    for (const prob of dropProbResult.itemDropChances) {
      prob.item.dropChancePercent = prob.dropChancePercent;
      prob.item.dropRiskScore = prob.riskScore;
      if ('holdingLimb' in prob.item) {
        (prob.item as HeldItemInfo).overflowWarning = `Overflow hold: ${prob.dropChancePercent}% accidental drop risk (scales with weight & size; heavier/bulkier items drop first).`;
      } else if (prob.item.overflowReason) {
        prob.item.overflowReason += ` (${prob.dropChancePercent}% accidental drop risk; heavier/bulkier items drop first).`;
      }
    }

    // Process carried currencies into containers:
    // Physical currency is NOT infinite space. It consumes weight and volume in containers.
    // Digital currency (credits, crypto, bank deposits) occupies 0 volume and 0 weight.
    const currencyInContainers = new Set<CurrencyEntry>();

    for (const c of carriedCurrencies) {
      let targetCont: ContainerInfo | undefined;
      if (c.container) {
        targetCont = this.findMatchingContainer(containers, c.container);
      } else if (containers.length > 0) {
        targetCont = containers.find(cnt => /pouch|purse|wallet/i.test(cnt.name));
      }

      if (targetCont) {
        currencyInContainers.add(c);
        if (!c.container) {
          c.container = targetCont.name;
        }

        if (c.isDigital) {
          targetCont.currencyCount = (targetCont.currencyCount || 0) + c.amount;
        } else {
          const curVol = c.totalVolume !== undefined ? c.totalVolume : Math.round(c.amount * (c.unitVolume || 0.115) * 1.25 * 100) / 100;
          const curWt = c.weight !== undefined ? c.weight : Math.round(c.amount * (c.singleWeight || 0.02) * 100) / 100;

          targetCont.currencyCount = (targetCont.currencyCount || 0) + c.amount;
          targetCont.currencyWeight = Math.round(((targetCont.currencyWeight || 0) + curWt) * 100) / 100;
          targetCont.currencyVolume = Math.round(((targetCont.currencyVolume || 0) + curVol) * 100) / 100;
          targetCont.currentItemsWeight = Math.round((targetCont.currentItemsWeight + curWt) * 100) / 100;
          targetCont.totalWeight = Math.round((targetCont.totalWeight + curWt) * 100) / 100;
          targetCont.currentVolume = Math.round(((targetCont.currentVolume || 0) + curVol) * 100) / 100;

          // Check container weight capacity
          if (targetCont.maxWeightCapacity && targetCont.currentItemsWeight > targetCont.maxWeightCapacity) {
            targetCont.hasOverflow = true;
            targetCont.overflowReason = `Container weight capacity exceeded (${targetCont.currentItemsWeight} lbs > ${targetCont.maxWeightCapacity} lbs max). Carrying too much heavy currency and gear!`;
          }

          // Check container volume capacity (finite space vs digital money) with stretchability!
          const maxVol = targetCont.maxVolume || 0;
          const effMaxVol = targetCont.effectiveMaxVolume || maxVol;
          const isRigid = targetCont.isRigid ?? false;
          const stretchFactor = targetCont.stretchFactor || (isRigid ? 1.0 : 1.15);

          if (effMaxVol > 0 && targetCont.currentVolume && targetCont.currentVolume > effMaxVol) {
            targetCont.hasOverflow = true;
            if (isRigid) {
              targetCont.overflowReason = `Rigid container cannot stretch (strictly 1.0x space max). Exceeded volume capacity (${Math.round(targetCont.currentVolume)} cu in > ${Math.round(maxVol)} cu in max). Physical currency and items overflow!`;
            } else {
              targetCont.overflowReason = `Container volume capacity exceeded even at maximum stretch (${Math.round(targetCont.currentVolume)} cu in > ${Math.round(effMaxVol)} cu in at ${stretchFactor}x max stretch). Physical currency and items overflow!`;
            }
          } else if (maxVol > 0 && targetCont.currentVolume && targetCont.currentVolume > maxVol) {
            targetCont.isStretched = true;
          }

          // Mirror into targetCont.items for container UI if not already mirrored
          const alreadyMirrored = targetCont.items.some(it => it.name.toLowerCase().includes(c.name.toLowerCase()));
          if (!alreadyMirrored) {
            targetCont.items.push({
              name: `Amount: ${c.amount}x Name: [${c.name}]${c.worth ? ` (Worth: ${c.worth})` : ''}`,
              weight: curWt,
              dimensions: c.dimensions || this.parseDimensions(c.singleDimensionsRaw || '1.2x1.2x0.08 inches'),
              category: 'carried',
              containerName: targetCont.name,
              isOverflow: targetCont.hasOverflow,
              overflowReason: targetCont.overflowReason,
              rawText: `* Name: [${c.name}] | Amount: ${c.amount} | Worth: ${c.worth || c.name} | Dimensions: ${c.dimensions?.raw || '1.2x1.2x0.08 in'} | Weight: ${curWt} lbs`
            });
          }
        }
      }
    }

    for (const cont of containers) {
      WeightInventoryEngine.updateContainerStretchDimensions(cont);
      if (cont.hasOverflow) {
        const contOverflows = cont.items.filter(i => i.isOverflow);
        if (contOverflows.length > 0) {
          const highestItemChance = Math.max(...contOverflows.map(i => i.dropChancePercent || 0));
          cont.overflowDropChancePercent = highestItemChance;
        }
      }
    }

    const holdingCapacity: HoldingCapacityInfo = {
      applies: holdingCapacityApplies,
      holdingLimbsDescription,
      maxStandardHoldCount,
      currentHeldCount: currentlyHolding.length,
      isFull,
      hasOverflowHold,
      overflowReason: hasOverflowHold
        ? `Character is holding items with overflow beyond standard capacity (${overflowHeld.length} overflow held; ${overallOverflowDropChancePercent}% accidental drop risk; heavier/bulkier items drop first).`
        : undefined,
      freeSlots,
      overflowDropChancePercent: overallOverflowDropChancePercent,
      totalOverflowCount,
      maxStartingCarryingItems
    };

    // Robustly sanitize equippedGear, carriedItems, currentlyHolding, and containers against accidental inclusion of the character's own body weight or self
    const isOwnBodyItem = (itName: string, itWeight?: number) => {
      const n = (itName || '').toLowerCase().replace(/[-*•>\s\d._\[\]]+/g, ' ').trim();
      if (!n) return false;
      if (
        n === 'body weight' ||
        n === 'body' ||
        n === 'own weight' ||
        n === 'own body weight' ||
        n === 'character weight' ||
        n === 'character body weight' ||
        n === 'player weight' ||
        n === 'player body weight' ||
        n === 'entity weight' ||
        n === 'total weight' ||
        n === 'total body weight' ||
        n === 'total weight on person' ||
        n === 'total carried weight' ||
        n === 'weight on person' ||
        n === 'current carried weight' ||
        n === 'self' ||
        n === 'own body'
      ) return true;
      if (characterName && characterName !== 'Character') {
        const cLower = characterName.toLowerCase().trim();
        if (n === cLower || n === `${cLower} body weight` || n === `${cLower} body` || n === `${cLower} weight`) {
          return true;
        }
      }
      if (bodyWeight > 40 && itWeight !== undefined && Math.abs(itWeight - bodyWeight) < 0.5) {
        if (n.includes('body') || n.includes('character') || n.includes('self') || (characterName && characterName !== 'Character' && n.includes(characterName.toLowerCase()))) {
          return true;
        }
      }
      return false;
    };

    const cleanEquippedGear = equippedGear.filter(eq => !isOwnBodyItem(eq.name, eq.weight));
    equippedGear.length = 0;
    equippedGear.push(...cleanEquippedGear);

    const cleanCarriedItems = carriedItems.filter(c => !isOwnBodyItem(c.name, c.weight));
    carriedItems.length = 0;
    carriedItems.push(...cleanCarriedItems);

    const cleanHolding = currentlyHolding.filter(h => !isOwnBodyItem(h.name, h.weight));
    currentlyHolding.length = 0;
    currentlyHolding.push(...cleanHolding);

    for (const cont of containers) {
      cont.items = cont.items.filter(it => !isOwnBodyItem(it.name, it.weight));
      // cont.items may already contain mirrored currency entries (with it.weight = curWt).
      // Separate non-currency items from mirrored currency items to prevent double-adding currencyWeight
      const nonCurrencyItems = cont.items.filter(it => !it.name.startsWith('Amount: ') && WeightInventoryEngine.parseCurrencyEntries(it.name).length === 0);
      const currencyItems = cont.items.filter(it => it.name.startsWith('Amount: ') || WeightInventoryEngine.parseCurrencyEntries(it.name).length > 0);
      const nonCurWeight = nonCurrencyItems.reduce((s, it) => s + (it.weight || 0), 0);
      const curWeight = currencyItems.length > 0 ? currencyItems.reduce((s, it) => s + (it.weight || 0), 0) : (cont.currencyWeight || 0);

      cont.currentItemsWeight = Math.round((nonCurWeight + curWeight) * 100) / 100;
      cont.totalWeight = Math.round((cont.weight + cont.currentItemsWeight) * 100) / 100;
    }

    // Never add passenger weight if entity is mounted or is not carrying actual other passengers
    const isMountOrVehicleEntity =
      /mount|vehicle|horse|warhorse|steed|pony|donkey|mule|camel|carriage|wagon|cart|boat|ship|vessel|chariot|sleigh|sled|glider|airship|mech|car|truck|bike|motorcycle|riding|transport/i.test(characterType) ||
      /mount|vehicle|horse|warhorse|steed|carriage|wagon|cart|boat|ship/i.test(characterName);

    if (isMounted || (!isMountOrVehicleEntity && passengersOrRiders.length === 0)) {
      passengerWeight = 0;
    }

    // Calculate Total Carried Weight on Person:
    // = Equipped Gear + Containers (empty weight) + Items inside containers (including physical currency in containers) + Carried loose items + Currently Held items
    let totalCarriedWeight = 0;
    for (const eq of equippedGear) {
      // Avoid double counting if equipped container is already tracked in containers
      const alreadyInContainers = containers.some(c => c.name.toLowerCase() === eq.name.toLowerCase());
      if (!alreadyInContainers) {
        totalCarriedWeight += eq.weight;
      }
    }
    for (const cont of containers) {
      totalCarriedWeight += cont.totalWeight;
    }
    for (const cItem of carriedItems) {
      totalCarriedWeight += cItem.weight;
    }
    for (const hItem of currentlyHolding) {
      // Avoid double counting if held item was already mirrored in equippedGear or carriedItems
      const alreadyInEquipped = equippedGear.some(e => e.name.toLowerCase() === hItem.name.toLowerCase());
      const alreadyInCarried = carriedItems.some(c => c.name.toLowerCase() === hItem.name.toLowerCase());
      if (!alreadyInEquipped && !alreadyInCarried) {
        totalCarriedWeight += hItem.weight;
      }
    }
    if (explicitCarriedNone && carriedCurrencies.length === 0) {
      carriedCurrencies.length = 0;
    } else if (explicitCarriedNone && carriedCurrencies.length > 0) {
      // Containers/inventory hold real currency; override explicitCarriedNone
      explicitCarriedNone = false;
    }

    // Add loose carried currency physical weight (for currencies NOT already in containers)
    for (const c of carriedCurrencies) {
      if (!currencyInContainers.has(c) && !c.isDigital) {
        if (c.weight !== undefined && c.weight > 0) {
          totalCarriedWeight += c.weight;
        } else if (/coins?|gold|silver|copper/i.test(c.name)) {
          // Standard realistic physical coin weight: ~0.02 lbs (approx 50 coins per pound)
          totalCarriedWeight += Math.round(c.amount * (c.singleWeight || 0.02) * 100) / 100;
        }
      }
    }

    // Add passenger/rider weight if this entity is carrying riders or passengers (e.g. mount, carriage, wagon)
    totalCarriedWeight += passengerWeight;
    // Stored items are EXCLUDED (user mandate: "not owned, owned items they don't have on them are put in another category but it's theirs still")

    // Dynamic Encumbrance calculation:
    // If the character is immune (e.g. Slimes, Incorporeal, Telekinetic, or trait-exempt), encumbrance does not apply
    const encumbranceRatio = bodyWeight > 0 ? (totalCarriedWeight / bodyWeight) : 0;
    let isEncumbered = false;

    if (encumbranceApplies) {
      isEncumbered = encumbranceRatio > encumbranceThreshold;
    }

    // Apply speed penalty if encumbered
    if (isEncumbered && encumbranceApplies) {
      if (totalCarriedWeight > maxLiftStrength) {
        // Exceeds max lift capacity: impossible to lift or move!
        currentWalkingSpeed = 0;
        currentRunningSpeed = 0;
      } else {
        // Penalty scaled by degree of encumbrance beyond their dynamic threshold
        const overPercent = (encumbranceRatio - encumbranceThreshold);
        // Penalty: min 20%, scaling up to 70% as weight approaches max lift
        const penaltyFactor = Math.min(0.70, 0.20 + (overPercent * 0.8));
        currentWalkingSpeed = Math.round(baseWalkingSpeed * (1 - penaltyFactor) * 10) / 10;
        currentRunningSpeed = Math.round(baseRunningSpeed * (1 - penaltyFactor) * 10) / 10;
      }
    }

    const carriedSummary = WeightInventoryEngine.formatCurrencySummary(carriedCurrencies);
    const storedSummary = WeightInventoryEngine.formatCurrencySummary(storedCurrencies);
    const totalNetWorthSummary = WeightInventoryEngine.formatCurrencySummary([...carriedCurrencies, ...storedCurrencies]);
    const hasCurrency = carriedCurrencies.length > 0 || storedCurrencies.length > 0;

    const currency: CharacterCurrencyData = {
      currencyType,
      carriedCurrencies,
      carriedSummary,
      storedCurrencies,
      storedSummary,
      totalNetWorthSummary,
      hasCurrency
    };

    return {
      characterName,
      characterType,
      height,
      width,
      depth,
      dimensionsRaw,
      dimensionsApply,
      bodyWeight: Math.round(bodyWeight * 100) / 100,
      strengthMultiplier,
      maxLiftStrength,
      baseWalkingSpeed,
      baseRunningSpeed,
      currentWalkingSpeed,
      currentRunningSpeed,
      isEncumbered,
      encumbranceRatio: Math.round(encumbranceRatio * 1000) / 10, // percentage e.g. 21.5%
      encumbranceThreshold: Math.round(encumbranceThreshold * 100), // e.g. 20%
      encumbranceApplies,
      encumbranceImmunityReason,
      encumbranceEffectDescription,
      totalCarriedWeight: Math.round(totalCarriedWeight * 100) / 100,
      currency,
      isMounted,
      mountedEntityName,
      mountedStatusDescription,
      passengersOrRiders,
      passengerWeight: Math.round(passengerWeight * 100) / 100,
      currentlyHolding,
      holdingCapacity,
      handSlots,
      maxStartingCarryingItems,
      totalOverflowCount,
      overallOverflowDropChancePercent,
      containers,
      equippedGear,
      carriedItems,
      storedItems,
      activeWeightEffects,
      activeStatusEffects: activeStatusEffectsList,
      temporaryAppearance,
      baseAppearance,
      healthState: (() => {
        let isUnconscious = false;
        let isDead = false;
        let unconsciousExpires: string | undefined;
        let unconsciousDurationRemainingMinutes: number | undefined;
        let rotStage: number | undefined;
        let rotStageName: string | undefined;
        let rotDescription: string | undefined;
        let deathReason: string | undefined;

        const lowerContent = fileContent.toLowerCase();
        if (lowerContent.includes('status: dead') || lowerContent.includes('(dead)') || lowerContent.includes('status: slain')) {
          isDead = true;
          const deathMatch = fileContent.match(/Status:\s*Dead\s*\(([^)]+)\)/i);
          if (deathMatch) deathReason = deathMatch[1].trim();
        } else if (lowerContent.includes('status: unconscious') || lowerContent.includes('(unconscious')) {
          isUnconscious = true;
          const expMatch = fileContent.match(/Status:\s*Unconscious\s*\([^)]*Expires:\s*([^;)]+)/i);
          if (expMatch) unconsciousExpires = expMatch[1].trim();
        }

        const rotMatch = fileContent.match(/Decomposition\s*\/\s*Rot:\s*([^\n\r]+)/i);
        if (rotMatch) {
          const rotLine = rotMatch[1];
          const beganMatch = rotLine.match(/Began:\s*([^;)]+)/i);
          const beganTime = beganMatch ? beganMatch[1].trim() : undefined;
          const decomp = WeightInventoryEngine.calculateDecompositionStage(beganTime, currentTimestamp);
          rotStage = decomp.stage;
          rotStageName = decomp.stageName;
          rotDescription = decomp.description;
        } else if (isDead) {
          rotStage = 1;
          rotStageName = 'Stage 1 - Fresh Corpse';
          rotDescription = 'Warm, no odor, rigor mortis developing gradually.';
        }

        return {
          isUnconscious,
          isDead,
          unconsciousExpires,
          unconsciousDurationRemainingMinutes,
          rotStage,
          rotStageName,
          rotDescription,
          deathReason
        };
      })()
    };
  }

  /**
   * Helper to find the index of the next top-level section header like `\n[HEADER]` or canonical headers
   */
  public static findNextSectionHeaderIndex(text: string, fromIndex: number): number {
    const sub = text.substring(fromIndex);
    const m = sub.match(/\n\s*(?:\[[A-Za-z0-9_\s&/()'-]+\]|(?:#+\s*)?(?:NAME\s*(?:&|AND)\s*DESCRIPTION|STATS\s*(?:&|AND)\s*MODIFIERS|ATTRIBUTES|ATTACKS\s*(?:&|AND)\s*COMBAT\s*ACTIONS|COMBAT\s*ACTIONS|ABILITIES\s*(?:&|AND)\s*MAGIC|CURRENTLY\s*HOLDING|CONTAINERS\s*(?:&|AND)\s*CARRIED\s*GEAR|INVENTORY\s*(?:&|AND)\s*EQUIPMENT|INVENTORY|OWNED\s*(?:\/|AND)?\s*STORED\s*ITEMS|STORED\s*ITEMS|CURRENCY\s*(?:&|AND)\s*(?:FINANCIAL\s*)?BALANCE|STATUS\s*EFFECTS\s*(?:&|AND)\s*LORE|STATUS\s*EFFECTS|MOUNT,\s*VEHICLE\s*(?:&|AND)\s*TRANSPORT\s*STATUS|TRANSPORT\s*(?:&|AND)\s*MOUNTS)\b:?)/i);
    if (m && m.index !== undefined) {
      return fromIndex + m.index + 1;
    }
    return -1;
  }

  /**
   * Synchronizes and writes the exact calculated weight, dimensions, container overflow,
   * encumbrance status, and adjusted speed directly back into the character file text.
   * This guarantees that the code automatically adds all weight and applies dynamic encumbrance.
   */
  public static syncCharacterFileContent(
    content: string,
    currentTimestamp?: string,
    currencyOverride?: { carried?: CurrencyEntry[]; stored?: CurrencyEntry[] }
  ): { updatedContent: string; stats: CharacterPhysicalStats; changes: string[] } {
    const cleanedInitialContent = WeightInventoryEngine.cleanDuplicateRepeatedPhrases(content);
    const stats = this.parseCharacterStatsAndInventory(cleanedInitialContent, currentTimestamp);
    if (currencyOverride?.carried !== undefined) {
      stats.currency.carriedCurrencies = currencyOverride.carried;
      stats.currency.carriedSummary = WeightInventoryEngine.formatCurrencySummary(stats.currency.carriedCurrencies);
    }
    if (currencyOverride?.stored !== undefined) {
      stats.currency.storedCurrencies = currencyOverride.stored;
      stats.currency.storedSummary = WeightInventoryEngine.formatCurrencySummary(stats.currency.storedCurrencies);
    }
    if (currencyOverride?.carried !== undefined || currencyOverride?.stored !== undefined) {
      stats.currency.totalNetWorthSummary = WeightInventoryEngine.formatCurrencySummary([
        ...stats.currency.carriedCurrencies,
        ...stats.currency.storedCurrencies
      ]);
      stats.currency.hasCurrency = stats.currency.carriedCurrencies.length > 0 || stats.currency.storedCurrencies.length > 0;
    }
    const changes: string[] = [];

    let updated = cleanedInitialContent;

    // 1. Ensure [NAME & DESCRIPTION] contains Physical Dimensions and Body Weight if not already present
    if (!updated.includes('Physical Dimensions:') && !updated.includes('Dimensions:') && !updated.includes('Body Dimensions:')) {
      const nameDescIdx = updated.indexOf('[NAME & DESCRIPTION]');
      if (nameDescIdx >= 0) {
        const nextHeader = WeightInventoryEngine.findNextSectionHeaderIndex(updated, nameDescIdx + 20);
        const insertPos = nextHeader > 0 ? nextHeader : updated.length;
        let dimStr = '';
        if (stats.dimensionsApply && stats.dimensionsRaw && !stats.dimensionsRaw.includes("5'11\"")) {
          dimStr = `- Physical Dimensions: ${stats.dimensionsRaw}\n- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        } else if (!stats.dimensionsApply) {
          dimStr = `- Physical Dimensions: None (${stats.characterType || 'Incorporeal/Formless'})\n- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        } else {
          dimStr = `- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        }
        if (dimStr) {
          updated = updated.substring(0, insertPos) + dimStr + updated.substring(insertPos);
          changes.push('Added Physical Dimensions & Body Weight');
        }
      }
    }

    // 2. Ensure [STATS & MODIFIERS] includes Max Lift Strength, Encumbrance, and accurate Speed
    let encumbranceNote = '';
    if (!stats.encumbranceApplies) {
      encumbranceNote = `(Encumbrance Immune: ${stats.encumbranceImmunityReason || 'Unaffected by carried weight / slime biology / incorporeal'})`;
    } else if (stats.isEncumbered) {
      encumbranceNote = `(Encumbered: Carried ${stats.totalCarriedWeight} lbs is ${stats.encumbranceRatio}% of body weight, exceeding ${stats.encumbranceThreshold}% threshold - Speed penalty active)`;
    } else {
      encumbranceNote = `(Unencumbered: Carried ${stats.totalCarriedWeight} lbs is ${stats.encumbranceRatio}% of body weight, within <= ${stats.encumbranceThreshold}% good threshold)`;
    }

    let speedLine = `- Speed: Walking: ${stats.currentWalkingSpeed} m/s, Running: ${stats.currentRunningSpeed} m/s ${encumbranceNote}`;
    if (stats.isMounted && stats.mountedEntityName) {
      speedLine = `- Speed: Walking: ${stats.currentWalkingSpeed} m/s, Running: ${stats.currentRunningSpeed} m/s (Mounted on [${stats.mountedEntityName}]; Unmounted base: ${stats.baseWalkingSpeed} m/s / ${stats.baseRunningSpeed} m/s)`;
    }
    if (updated.match(/^[-\s]*Speed:.*$/im)) {
      updated = updated.replace(/^[-\s]*Speed:.*$/im, speedLine);
    }

    // Weight status for encumbrance & speed
    const weightStatusText = !stats.encumbranceApplies
      ? 'IMMUNE TO ENCUMBRANCE'
      : stats.isEncumbered
        ? 'ENCUMBERED: Slower Speed'
        : 'Good / Unencumbered';

    // Encumbrance Rule line in stats
    const encumbranceThresholdLbs = ((stats.bodyWeight * stats.encumbranceThreshold) / 100).toFixed(1).replace(/\.0$/, '');
    const encumbranceRuleLine = stats.encumbranceApplies
      ? `- Encumbrance Threshold & Effects: Base ${stats.encumbranceThreshold}% threshold is ${encumbranceThresholdLbs} lbs. Current carried weight is ${stats.totalCarriedWeight} lbs (${stats.encumbranceRatio}% of body weight - Status: ${weightStatusText}). (Carried weight at ${stats.encumbranceThreshold + 1}%+ causes slower speed penalty until dropped)`
      : `- Encumbrance: Immune / Unaffected (${stats.encumbranceImmunityReason || 'Dynamic biology absorbs or ignores weight penalties'})`;

    if (updated.match(/^[-\s]*Encumbrance(?:\s*Threshold)?(?:\s*(?:&|and)\s*Effects)?:.*$/im)) {
      updated = updated.replace(/^[-\s]*Encumbrance(?:\s*Threshold)?(?:\s*(?:&|and)\s*Effects)?:.*$/im, encumbranceRuleLine);
    }

    // Max Lift Strength
    const maxLiftLine = `- Max Lift Strength: ${stats.maxLiftStrength} lbs (Based on body weight and strength multiplier; heavier loads cannot be lifted)`;
    if (updated.match(/^[-\s]*Max Lift Strength:.*$/im)) {
      updated = updated.replace(/^[-\s]*Max Lift Strength:.*$/im, maxLiftLine);
    } else {
      const statsIdx = updated.indexOf('[STATS & MODIFIERS]');
      if (statsIdx >= 0) {
        const nextHeader = WeightInventoryEngine.findNextSectionHeaderIndex(updated, statsIdx + 20);
        const insertPos = nextHeader > 0 ? nextHeader : updated.length;
        updated = updated.substring(0, insertPos) + `${maxLiftLine}\n` + updated.substring(insertPos);
      }
    }

    // 3. Update or Insert Total Carried Weight summary in [CONTAINERS & CARRIED GEAR] or [INVENTORY & EQUIPMENT]
    const carriedWeightStatusBadge = !stats.encumbranceApplies
      ? 'IMMUNE TO ENCUMBRANCE'
      : stats.isEncumbered
        ? 'ENCUMBERED: Slower Speed'
        : 'GOOD: Unencumbered';

    const isActualMountOrVehicle = !stats.isMounted && stats.passengerWeight > 0;
    const riderSummary = isActualMountOrVehicle && ((stats.passengersOrRiders && stats.passengersOrRiders.length > 0) || stats.passengerWeight > 0)
      ? ` (Includes ${stats.passengerWeight} lbs rider/passenger load)`
      : '';
    const weightSummaryLine = isActualMountOrVehicle
      ? `- Total Carried Weight on Mount/Vehicle: ${stats.totalCarriedWeight} lbs / ${stats.bodyWeight} lbs (${stats.encumbranceRatio}% body weight - ${carriedWeightStatusBadge}${riderSummary}) | Max Lift/Draw: ${stats.maxLiftStrength} lbs`
      : `- Total Carried Weight on Person: ${stats.totalCarriedWeight} lbs / ${stats.bodyWeight} lbs (${stats.encumbranceRatio}% body weight - ${carriedWeightStatusBadge}) | Max Lift: ${stats.maxLiftStrength} lbs`;

    if (updated.match(/^[-\s]*Total Carried Weight on Mount\/Vehicle:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Carried Weight on Mount\/Vehicle:.*$/im, weightSummaryLine);
    } else if (updated.match(/^[-\s]*Total Carried Weight on Person:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Carried Weight on Person:.*$/im, weightSummaryLine);
    } else if (updated.match(/^[-\s]*Total Weight:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Weight:.*$/im, weightSummaryLine);
    } else {
      const contHeaderIdx = updated.indexOf('[CONTAINERS & CARRIED GEAR]') >= 0
        ? updated.indexOf('[CONTAINERS & CARRIED GEAR]')
        : updated.indexOf('[INVENTORY & EQUIPMENT]');
      if (contHeaderIdx >= 0) {
        const lineBreak = updated.indexOf('\n', contHeaderIdx);
        if (lineBreak >= 0) {
          updated = updated.substring(0, lineBreak + 1) + `${weightSummaryLine}\n` + updated.substring(lineBreak + 1);
          changes.push('Added Total Carried Weight summary line');
        }
      }
    }

    // 4. Ensure [OWNED / STORED ITEMS (NOT ON PERSON)] section exists
    if (!updated.includes('[OWNED / STORED ITEMS (NOT ON PERSON)]') && !updated.includes('[OWNED / STORED') && !updated.includes('[STORED ITEMS')) {
      const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
      const insertPos = loreIdx >= 0 ? loreIdx : updated.length;
      const storedSection = `[OWNED / STORED ITEMS (NOT ON PERSON)]\n- (Items owned by character stored at home, vault, camp, or stash. Their weight is NOT added to carried weight)\n\n`;
      updated = updated.substring(0, insertPos) + storedSection + updated.substring(insertPos);
      changes.push('Added Owned/Stored Items section');
    }

    // Clean up phantom / duplicate starting stash entries if the item is currently on person
    const carriedNames: string[] = Array.from(new Set<string>([
      ...stats.currentlyHolding.map(h => h.name.toLowerCase().replace(/^[-*•>\s\d.]+/, '').replace(/^\[|\]$/g, '').trim()),
      ...stats.equippedGear.map(e => e.name.toLowerCase().replace(/^[-*•>\s\d.]+/, '').replace(/^\[|\]$/g, '').trim()),
      ...stats.containers.flatMap(c => c.items.map(i => i.name.toLowerCase().replace(/^[-*•>\s\d.]+/, '').replace(/^\[|\]$/g, '').trim()))
    ])).filter(Boolean);

    const updatedLines = updated.split('\n');
    let inNameOrDescSection = false;
    const filteredLines = updatedLines.filter(l => {
      const lower = l.toLowerCase();
      if (lower.startsWith('[name') || lower.startsWith('[description')) {
        inNameOrDescSection = true;
      } else if (lower.startsWith('[')) {
        inNameOrDescSection = false;
      }

      if (lower.includes('total starting carried items count')) {
        return false;
      }

      // If a body weight line is accidentally placed outside [NAME & DESCRIPTION], strip it so it doesn't pollute gear/holding
      if (!inNameOrDescSection && /^[-\s*•]*(?:body\s*weight|own\s*body\s*weight|character\s*weight|character\s*body\s*weight|player\s*weight|entity\s*weight)\s*:\s*[0-9]+(?:\.[0-9]+)?\s*lbs?/i.test(l)) {
        changes.push('Removed stray body weight line from gear/inventory section');
        return false;
      }

      if (lower.includes('stored to respect starting carried item limit')) {
        for (let i = 0; i < carriedNames.length; i++) {
          const carried = carriedNames[i];
          if (carried && lower.includes(carried)) {
            changes.push(`Removed stale starting stash duplicate for ${carried}`);
            return false;
          }
        }
      }
      return true;
    });
    updated = filteredLines.join('\n');

    // 5. Ensure [CURRENTLY HOLDING] section reflects dynamic held items if applicable
    if (stats.holdingCapacity.applies && (stats.currentlyHolding.length > 0 || updated.includes('[CURRENTLY HOLDING]'))) {
      const holdingLines: string[] = [];
      holdingLines.push(`- Holding Anatomy: ${stats.holdingCapacity.holdingLimbsDescription}`);
      holdingLines.push(`- Hand Slots & Starting Capacity: ${stats.handSlots} hand slots (Max starting carrying limit: ${stats.maxStartingCarryingItems} items; can carry more during adventure)`);
      const statusSuffix = stats.holdingCapacity.hasOverflowHold
        ? ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} - Overflow Hold: ${stats.holdingCapacity.overflowDropChancePercent || 25}% accidental drop risk; heavier/bulkier items drop first)`
        : stats.holdingCapacity.isFull
          ? ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} Occupied - Full)`
          : ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} Occupied - ${stats.holdingCapacity.freeSlots} Free)`;
      holdingLines.push(`- Holding Capacity & Status:${statusSuffix}`);
      holdingLines.push(`- Items Currently Held:`);
      if (stats.currentlyHolding.length === 0) {
        holdingLines.push(`  * (None - Hands/Appendages free)`);
      } else {
        const seenHeld = new Set<string>();
        for (const h of stats.currentlyHolding) {
          // Clean name of any existing limb prefixes, repeated 'Hands:', grip phrasing, and repeated overflow suffixes
          let cleanName = h.name
            .replace(/^[-*•>\s]*(?:\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow(?:\s*hold)?)\]|(?:(?:right|left|main|off|both)\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\s*[:=-])(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?[:=\s-]*/i, '')
            .replace(/^(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip)\s*[:=-]\s*/i, '')
            .replace(/^weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*(?:dimensions?\s*[:=]\s*)?/i, '')
            .replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '')
            .trim();

          if (!cleanName || WeightInventoryEngine.isLimbOrGripResidue(cleanName) || /grip|two[- ]handed|\(two[- ]handed\)/i.test(cleanName)) {
            const matchingEq = stats.equippedGear.find(e => Math.abs(e.weight - h.weight) < 0.05 && !WeightInventoryEngine.isLimbOrGripResidue(e.name)) ||
              stats.carriedItems.find(c => Math.abs(c.weight - h.weight) < 0.05 && !WeightInventoryEngine.isLimbOrGripResidue(c.name));
            cleanName = matchingEq ? matchingEq.name : (h.holdingLimb?.includes('Two-Handed') ? 'Two-Handed Weapon' : 'Held Item');
          }
          if (cleanName.toLowerCase().includes('overflow rule') || cleanName.toLowerCase().includes('holding anatomy')) {
            continue;
          }

          // Deduplicate identical held entries in output
          const heldKey = `${h.holdingLimb.toLowerCase()}|${cleanName.toLowerCase()}|${h.weight}`;
          if (seenHeld.has(heldKey)) {
            continue;
          }
          seenHeld.add(heldKey);

          let cleanDim = h.dimensions.raw || 'Standard size';
          const dimMatch = cleanDim.match(/([0-9.]+\s*x\s*[0-9.]+(?:\s*x\s*[0-9.]+)?\s*(?:in|inch|inches|cm|m|ft)?)/i);
          if (dimMatch) {
            cleanDim = dimMatch[1].trim();
          } else if (cleanDim.length > 25 || cleanDim.includes(':') || cleanDim.includes('(')) {
            if (h.dimensions.height !== undefined && h.dimensions.width !== undefined) {
              cleanDim = `${h.dimensions.height}x${h.dimensions.width}${h.dimensions.depth !== undefined ? `x${h.dimensions.depth}` : ''} inches`;
            } else {
              cleanDim = 'Standard size';
            }
          }

          const limbPrefix = h.holdingLimb ? `${h.holdingLimb}: ` : '';
          const dropRiskPct = h.dropChancePercent || 25;
          const overflowSuffix = h.isOverflowHold
            ? ` (Overflow: Yes - ${dropRiskPct}% accidental drop risk; heavier/bulkier items drop first)`
            : '';
          holdingLines.push(`  * ${limbPrefix}${cleanName}: Weight: ${h.weight} lbs. Dimensions: ${cleanDim}.${overflowSuffix}`);
        }
      }

      const holdingBlock = `[CURRENTLY HOLDING]\n${holdingLines.join('\n')}\n\n`;

      if (updated.includes('[CURRENTLY HOLDING]')) {
        const holdIdx = updated.indexOf('[CURRENTLY HOLDING]');
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, holdIdx + 19);
        const replaceEnd = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, holdIdx) + holdingBlock + updated.substring(replaceEnd);
      } else {
        const invIdx = updated.indexOf('[CONTAINERS & CARRIED GEAR]');
        const insertPos = invIdx >= 0 ? invIdx : (updated.indexOf('[INVENTORY & EQUIPMENT]') >= 0 ? updated.indexOf('[INVENTORY & EQUIPMENT]') : updated.indexOf('[ATTACKS'));
        if (insertPos >= 0) {
          updated = updated.substring(0, insertPos) + holdingBlock + updated.substring(insertPos);
        } else {
          updated += `\n${holdingBlock}`;
        }
      }
      changes.push('Synchronized Currently Holding section');
    }

    // Synchronize container item lines with carried currencies:
    // If currency was removed from a container (e.g. given away or spent from wallet), remove or update the line under Carried Inventory (Inside Containers)
    const carriedInvIdx = updated.search(/^[-\s]*carried inventory.*:$/im);
    if (carriedInvIdx >= 0) {
      const lineEnd = updated.indexOf('\n', carriedInvIdx);
      const startPos = lineEnd >= 0 ? lineEnd + 1 : updated.length;
      const nextHeaderIdx = WeightInventoryEngine.findNextSectionHeaderIndex(updated, startPos);
      const endPos = nextHeaderIdx >= 0 ? nextHeaderIdx : updated.length;

      const invBlock = updated.substring(startPos, endPos);
      const invLines = invBlock.split('\n');
      let invModified = false;
      const newInvLines: string[] = [];

      let currentContainerName = '';
      for (const invLine of invLines) {
        const trimmed = invLine.trim();
        if (!trimmed) {
          newInvLines.push(invLine);
          continue;
        }

        // Track active container heading
        const contHeaderMatch = trimmed.match(/^[-*•]\s*(?:\[([^\]]+)\]|([a-zA-Z0-9_\s'-]+))\s*(?:\([^)]+\))?\s*:/i);
        if (contHeaderMatch) {
          currentContainerName = (contHeaderMatch[1] || contHeaderMatch[2]).trim();
        }

        const cEntries = WeightInventoryEngine.parseCurrencyEntries(invLine, undefined, currentContainerName);
        if (cEntries.length > 0) {
          const contMatch = invLine.match(/container[:=\s]+\[?([a-zA-Z0-9_\s'-]+)\]?/i);
          const targetContName = (contMatch ? contMatch[1].trim() : (cEntries[0].container || currentContainerName || '')).toLowerCase();

          // Check if any carried currency remains for this container/currency
          const matchingCarried = stats.currency.carriedCurrencies.find(cc => {
            const ccCont = (cc.container || '').toLowerCase();
            const containerMatches = !targetContName || !ccCont ||
              ccCont.includes(targetContName) ||
              targetContName.includes(ccCont);

            if (containerMatches) {
              const ccName = cc.name.toLowerCase();
              const entryName = cEntries[0].name.toLowerCase();
              return (
                ccName === entryName ||
                (ccName.length > 2 && entryName.includes(ccName)) ||
                (entryName.length > 2 && ccName.includes(entryName))
              );
            }
            return false;
          });

          if (!matchingCarried) {
            // Currency exists in this container but was missing from carriedCurrencies:
            // PRESERVE IT and ensure carriedCurrencies includes it!
            stats.currency.carriedCurrencies.push({
              name: cEntries[0].name,
              amount: cEntries[0].amount,
              container: targetContName || currentContainerName || undefined,
              weight: cEntries[0].weight
            });
            stats.currency.hasCurrency = true;
            newInvLines.push(invLine);
            continue;
          } else if (matchingCarried.amount <= 0) {
            // Currency was given away or spent from this container!
            invModified = true;
            changes.push(`Removed spent/given currency (${cEntries[0].amount} ${cEntries[0].name}) from container ${targetContName || 'gear'}`);
            continue;
          } else if (matchingCarried.amount !== cEntries[0].amount) {
            // Currency amount changed; update line with new accurate amount
            const oldAmtStr = cEntries[0].amount.toString();
            const newAmtStr = matchingCarried.amount.toString();
            const updatedInvLine = invLine
              .replace(new RegExp(`\\$${oldAmtStr}\\b`), `$${newAmtStr}`)
              .replace(new RegExp(`\\b${oldAmtStr}\\b`), newAmtStr);
            newInvLines.push(updatedInvLine);
            invModified = true;
            changes.push(`Updated currency in container ${targetContName} from ${cEntries[0].amount} to ${matchingCarried.amount}`);
            continue;
          }
        }

        // If the line is an invalid phantom container-name line (e.g. "* (Inside Leather Bifold Wallet: 0.05 lbs (3x2 inches))" or "* (Inside Leather Bifold Wallet)")
        // that produces neither a valid item nor currency, remove it so it doesn't linger as clutter in the file!
        const isPhantomContainerLine = /^[-\s*•]*\(?(?:inside|in(?:\s*container)?|stored\s+in)\s+[a-zA-Z0-9_\s'-]+(?:\)|\])?/i.test(trimmed) &&
          !WeightInventoryEngine.parseItemLine(invLine) &&
          WeightInventoryEngine.parseCurrencyEntries(invLine).length === 0;
        if (isPhantomContainerLine) {
          invModified = true;
          changes.push(`Removed phantom container line "${trimmed}" from container inventory`);
          continue;
        }

        newInvLines.push(invLine);
      }

      // Ensure any active carried currencies are represented in container lines
      if (stats.currency.carriedCurrencies && stats.currency.carriedCurrencies.length > 0) {
        for (const cc of stats.currency.carriedCurrencies) {
          if (!cc.name || cc.amount <= 0) continue;
          const ccClean = WeightInventoryEngine.sanitizeCurrencyName(cc.name);
          const alreadyInInv = newInvLines.some(l => {
            const parsed = WeightInventoryEngine.parseCurrencyEntries(l);
            return parsed.some(p => p.name.toLowerCase() === ccClean.toLowerCase() || p.name.toLowerCase().includes(ccClean.toLowerCase()));
          });
          if (!alreadyInInv) {
            const targetCont = cc.container ||
              stats.containers.find(ct => /pouch|wallet|purse|pocket|money\s*belt/i.test(ct.name))?.name ||
              (stats.containers.length > 0 ? stats.containers[0].name : 'Coin Pouch');
            const wPart = cc.weight !== undefined ? `: ${cc.weight} lbs` : '';
            newInvLines.push(`  * ${cc.amount} ${ccClean}${wPart}. Container: [${targetCont}]`);
            invModified = true;
            changes.push(`Added carried currency ${cc.amount} ${ccClean} to container [${targetCont}]`);
          }
        }
      }

      if (invModified) {
        const nonBlank = newInvLines.filter(l => l.trim() && !l.trim().startsWith('#'));
        if (nonBlank.length === 0) {
          newInvLines.length = 0;
          newInvLines.push('  * (None)');
        }
        updated = updated.substring(0, startPos) + newInvLines.join('\n') + (endPos < updated.length ? '\n\n' : '') + updated.substring(endPos);
      }
    }

    // 5.5. Synchronize container stretch dimensions in file:
    // If a container is stretched, update its size line under [CONTAINERS & CARRIED GEAR] to show active stretched dimensions
    if (stats.containers && stats.containers.length > 0) {
      for (const cont of stats.containers) {
        if (!cont.name) continue;
        const contEsc = cont.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const contLineRegex = new RegExp(`^([\\s*-]*\\[?${contEsc}\\]?[^:\\n]*:[^\\n]*)`, 'im');
        const contLineMatch = updated.match(contLineRegex);
        if (contLineMatch) {
          const originalLine = contLineMatch[1];
          if (cont.isStretched && cont.stretchedDimensions && cont.currentStretchRatio && cont.currentStretchRatio > 1.0) {
            const stretchedDesc = ` (Currently stretched to ${cont.stretchedDimensions.height}x${cont.stretchedDimensions.width}x${cont.stretchedDimensions.depth} ${cont.stretchedDimensions.unit || 'inches'}, ${cont.currentStretchRatio}x)`;
            let newLine = originalLine;
            if (newLine.includes('(Currently stretched')) {
              newLine = newLine.replace(/\(Currently stretched[^)]+\)/i, stretchedDesc.trim());
            } else if (/dimensions?[:=\s]+[^,;\r\n]+/i.test(newLine)) {
              newLine = newLine.replace(/(dimensions?[:=\s]+[^,;\r\n]+)/i, `$1${stretchedDesc}`);
            } else {
              newLine = `${newLine}${stretchedDesc}`;
            }
            if (newLine !== originalLine) {
              updated = updated.replace(originalLine, newLine);
              changes.push(`Updated ${cont.name} stretched size to ${cont.stretchedDimensions.raw}`);
            }
          } else if (!cont.isStretched && originalLine.includes('(Currently stretched')) {
            const newLine = originalLine.replace(/\s*\(Currently stretched[^)]+\)/i, '');
            updated = updated.replace(originalLine, newLine);
            changes.push(`Relaxed ${cont.name} to un-stretched base size`);
          }
        }
      }
    }

    // 6. Ensure [CURRENCY & FINANCIAL BALANCE] section is present and accurate if currency exists or section was present
    const currHeaderRegex = /(?:\[\s*(?:CURRENCY\s*(?:&|AND)\s*(?:FINANCIAL\s*)?BALANCE|CURRENCY|FINANCIAL\s*BALANCE)\s*\]|(?:^|\n)\s*(?:#+\s*)?(?:CURRENCY\s*(?:&|AND)\s*(?:FINANCIAL\s*)?BALANCE|CURRENCY|FINANCIAL\s*BALANCE):?\s*(?=\n|$))/i;
    const hasCurrencySection = currHeaderRegex.test(updated);

    if (stats.currency.hasCurrency || hasCurrencySection || updated.includes('[NAME & DESCRIPTION]') || updated.includes('[STATS & MODIFIERS]') || updated.includes('[INVENTORY')) {
      const currencyLines: string[] = [];
      currencyLines.push(`- Currency Type: ${stats.currency.currencyType}`);
      currencyLines.push(`- Carried Balance (On Person):`);

      // De-duplicate carried currencies before writing
      const dedupCarried: CurrencyEntry[] = [];
      for (const c of stats.currency.carriedCurrencies) {
        let cleanName = WeightInventoryEngine.sanitizeCurrencyName(c.name);
        if (!cleanName || cleanName.toLowerCase() === 'none' || cleanName === '0') continue;
        c.name = cleanName;

        const matchIdx = dedupCarried.findIndex(d =>
          (d.name.toLowerCase() === c.name.toLowerCase() || (d.name.toLowerCase() === 'dollars' && /^(?:dollars|usd|cash|\$)$/i.test(c.name))) &&
          ((!d.container && !c.container) || d.container?.toLowerCase() === c.container?.toLowerCase())
        );
        if (matchIdx >= 0) {
          // Consolidate or update to the highest active balance if identical denomination in the same container
          if (c.amount > dedupCarried[matchIdx].amount) {
            dedupCarried[matchIdx].amount = c.amount;
          }
          if (!dedupCarried[matchIdx].worth && c.worth) {
            dedupCarried[matchIdx].worth = c.worth;
          }
          if (!dedupCarried[matchIdx].container && c.container) {
            dedupCarried[matchIdx].container = c.container;
          }
        } else {
          dedupCarried.push(c);
        }
      }

      if (dedupCarried.length === 0) {
        currencyLines.push(`  * None (0)`);
      } else {
        for (const c of dedupCarried) {
          const worthPart = c.worth ? ` | Worth: ${c.worth}` : '';
          const dimStr = c.dimensions?.raw ? c.dimensions.raw : (c.singleDimensionsRaw ? c.singleDimensionsRaw : (c.isDigital ? 'Digital' : '1.2x1.2x0.08 inches'));
          const dimPart = c.isDigital ? ` | Dimensions: Digital` : ` | Dimensions: ${dimStr}`;
          const wPart = c.weight !== undefined ? ` | Weight: ${c.weight} lbs` : '';
          const contSuffix = c.container ? ` [Container: ${c.container}]` : '';
          // User mandate: the year of the coin should be in the name format part of the currency while the amount is separate format for that coin
          currencyLines.push(`  * Name: [${c.name}] | Amount: ${c.amount}${worthPart}${dimPart}${wPart}${contSuffix}`);
        }
      }

      currencyLines.push(`- Stored / Remote Balance (Not on Person):`);

      // De-duplicate stored currencies before writing
      const dedupStored: CurrencyEntry[] = [];
      for (const c of stats.currency.storedCurrencies) {
        let cleanName = WeightInventoryEngine.sanitizeCurrencyName(c.name);
        if (!cleanName || cleanName.toLowerCase() === 'none' || cleanName === '0') continue;

        let cleanLoc = c.location ? WeightInventoryEngine.cleanDuplicateRepeatedPhrases(c.location).trim() : undefined;
        if (cleanLoc) {
          cleanLoc = cleanLoc.replace(/^location[:=\s]+/i, '').trim();
          cleanLoc = cleanLoc.replace(/^[">:\s]+/, '').trim();
          cleanLoc = cleanLoc.replace(/\|.*$/i, '').trim();
          const openB = (cleanLoc.match(/\[/g) || []).length;
          const closeB = (cleanLoc.match(/\]/g) || []).length;
          if (closeB > openB && cleanLoc.endsWith(']')) {
            cleanLoc = cleanLoc.substring(0, cleanLoc.length - 1).trim();
          }
        }
        c.location = cleanLoc;

        // If the currency name was recorded as the location name, give it a proper currency label
        if (cleanLoc && (cleanName.toLowerCase() === cleanLoc.toLowerCase() || cleanName.toLowerCase().includes(cleanLoc.toLowerCase()) || /relay|branch|vault|bank|account|stash|bunker|safehouse/i.test(cleanName))) {
          cleanName = 'Digital Credits / Electronic Scrip';
        }
        c.name = cleanName;

        const matchIdx = dedupStored.findIndex(d =>
          d.name.toLowerCase() === c.name.toLowerCase() &&
          ((!d.location && !c.location) || d.location?.toLowerCase() === c.location?.toLowerCase() || (d.isHiddenLocation && c.isHiddenLocation))
        );
        if (matchIdx >= 0) {
          if (c.amount > dedupStored[matchIdx].amount) {
            dedupStored[matchIdx].amount = c.amount;
          }
          if (!dedupStored[matchIdx].location && c.location) {
            dedupStored[matchIdx].location = c.location;
          }
        } else {
          dedupStored.push(c);
        }
      }

      if (dedupStored.length === 0) {
        currencyLines.push(`  * None (0)`);
      } else {
        for (const c of dedupStored) {
          const worthPart = c.worth ? ` | Worth: ${c.worth}` : '';
          const dimStr = c.dimensions?.raw ? c.dimensions.raw : (c.singleDimensionsRaw ? c.singleDimensionsRaw : (c.isDigital ? 'Digital' : '1.2x1.2x0.08 inches'));
          const dimPart = c.isDigital ? ` | Dimensions: Digital` : ` | Dimensions: ${dimStr}`;
          const wPart = c.weight !== undefined ? ` | Weight: ${c.weight} lbs` : '';
          const locSuffix = c.location ? ` [Location: ${c.location}]` : '';
          // User mandate: the year of the coin should be in the name format part of the currency while the amount is separate format for that coin
          currencyLines.push(`  * Name: [${c.name}] | Amount: ${c.amount}${worthPart}${dimPart}${wPart}${locSuffix}`);
        }
      }

      // Re-summarize with de-duplicated entries for pristine net worth line
      const cleanCarriedSummary = WeightInventoryEngine.formatCurrencySummary(dedupCarried);
      const cleanTotalSummary = WeightInventoryEngine.formatCurrencySummary([...dedupCarried, ...dedupStored]);
      currencyLines.push(`- Total Net Worth: ${cleanTotalSummary}`);

      const currencyBlock = `[CURRENCY & FINANCIAL BALANCE]\n${currencyLines.join('\n')}\n\n`;

      const currMatch = updated.match(currHeaderRegex);
      if (currMatch && currMatch.index !== undefined) {
        const matchStart = currMatch.index + (currMatch[0].startsWith('\n') ? 1 : 0);
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, matchStart + currMatch[0].length);
        const replaceEnd = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, matchStart) + currencyBlock + updated.substring(replaceEnd);
      } else {
        const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
        const insertPos = loreIdx >= 0 ? loreIdx : updated.length;
        updated = updated.substring(0, insertPos) + currencyBlock + updated.substring(insertPos);
      }
      changes.push('Synchronized Currency & Financial Balance section');
    }

    // 7. Synchronize Unconscious duration check and Dead character decomposition/rot progression based on WorldTime
    if (currentTimestamp) {
      // Check if character is Unconscious at 0 HP
      const isUnconscious = updated.toLowerCase().includes('status: unconscious') || updated.toLowerCase().includes('(unconscious');
      const healthMatch = updated.match(/^(\s*[-*•]?\s*(?:Current\s+)?(?:Health|HP|Hit\s*Points)(?:\s*\([^)]*\))?\s*[:=]\s*)(\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(.*)$/im);
      const currentHP = healthMatch ? parseFloat(healthMatch[2]) : undefined;
      const maxHP = healthMatch ? parseFloat(healthMatch[3]) : 100;

      if (isUnconscious && currentHP === 0) {
        const expMatch = updated.match(/Status:\s*Unconscious\s*\([^)]*Expires:\s*([^;)]+)/i);
        if (expMatch) {
          const expTimeStr = expMatch[1].trim();
          const dExp = WeightInventoryEngine.parseWorldTimestamp(expTimeStr);
          const dCur = WeightInventoryEngine.parseWorldTimestamp(currentTimestamp);
          if (dExp && dCur) {
            const isUnconsciousExpired = dCur.hasDate && dExp.hasDate
              ? dCur.date.getTime() >= dExp.date.getTime()
              : dCur.totalSeconds >= dExp.totalSeconds;
            if (isUnconsciousExpired) {
              // Expired! Character succumbs to 0 HP and becomes Dead
              updated = updated.replace(/Status:\s*Unconscious[^\n\r]*/i, `Status: Dead (Succumbed to 0 HP wounds after unconscious survival window elapsed; Slain)`);
              if (healthMatch) {
                updated = updated.replace(healthMatch[0], `${healthMatch[1]}0 / ${maxHP} (Dead)`);
              }
              if (!updated.includes('Decomposition / Rot:')) {
                const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
                if (loreIdx >= 0) {
                  const insertPos = updated.indexOf('\n', loreIdx) + 1;
                  updated = updated.substring(0, insertPos) + `- Decomposition / Rot: Stage 1 - Fresh Corpse (Began: ${currentTimestamp}; Gradual biological decay based on WorldTime)\n` + updated.substring(insertPos);
                }
              }
              changes.push('Unconscious duration elapsed at 0 HP: character has succumbed and died');
            }
          }
        }
      }

      // Check if character is Dead and rot applies
      const isDead = updated.toLowerCase().includes('status: dead') || updated.toLowerCase().includes('(dead)');
      const rotMatch = updated.match(/^(\s*[-*•]?\s*Decomposition\s*\/\s*Rot\s*[:=]\s*)([^\n\r]+)$/im);
      if (isDead) {
        if (rotMatch) {
          const rotBody = rotMatch[2];
          const beganMatch = rotBody.match(/Began:\s*([^;)]+)/i);
          const beganTime = beganMatch ? beganMatch[1].trim() : currentTimestamp;
          const stageInfo = WeightInventoryEngine.calculateDecompositionStage(beganTime, currentTimestamp);
          const newRotLine = `${rotMatch[1]}${stageInfo.stageName} (Began: ${beganTime}; ${stageInfo.description}; Advances with WorldTime)`;
          if (newRotLine !== rotMatch[0]) {
            updated = updated.replace(rotMatch[0], newRotLine);
            changes.push(`Updated Decomposition/Rot to ${stageInfo.stageName}`);
          }
        } else if (!updated.toLowerCase().includes('non-biological') && !updated.toLowerCase().includes('undead') && !updated.toLowerCase().includes('construct') && !updated.toLowerCase().includes('golem') && !updated.toLowerCase().includes('ghost')) {
          const stageInfo = WeightInventoryEngine.calculateDecompositionStage(currentTimestamp, currentTimestamp);
          const newRotLine = `- Decomposition / Rot: ${stageInfo.stageName} (Began: ${currentTimestamp}; ${stageInfo.description}; Advances with WorldTime)\n`;
          const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
          if (loreIdx >= 0) {
            const insertPos = updated.indexOf('\n', loreIdx) + 1;
            updated = updated.substring(0, insertPos) + newRotLine + updated.substring(insertPos);
          } else {
            updated += `\n[STATUS EFFECTS & LORE]\n${newRotLine}`;
          }
          changes.push(`Added Decomposition/Rot: ${stageInfo.stageName}`);
        }
      }

      // 8. Universal Status Effects & Expiration & Chaining & Transformation Appearance Management
      const effectRegex = /\[(?:Status|Effect):([a-zA-Z0-9_\-\s]+)\(([^)]*)\)\]/gi;
      let effMatch: RegExpExecArray | null;
      const statusEffectsFound: Array<{
        fullMatch: string;
        name: string;
        body: string;
        expires?: string;
        duration?: string;
        began?: string;
        description?: string;
        modifiers?: string;
        appearance?: string;
        tempWeight?: number;
        baseWeight?: number;
        tempDimensions?: string;
        baseDimensions?: string;
        chainedEffect?: string;
        revert?: string;
      }> = [];

      while ((effMatch = effectRegex.exec(updated)) !== null) {
        const fullMatch = effMatch[0];
        const name = effMatch[1].trim();
        const body = effMatch[2];

        // Skip Unconscious and Dead which are managed separately above
        if (/^(?:unconscious|dead|healthy|normal|slain)$/i.test(name)) continue;

        const expM = body.match(/expires\s*[:=]\s*([^;)]+)/i);
        const durM = body.match(/duration\s*[:=]\s*([^;)]+)/i);
        const begM = body.match(/(?:began|started)\s*[:=]\s*([^;)]+)/i);
        const descM = body.match(/(?:description|details?|effect)\s*[:=]\s*([^;)]+)/i);
        const modM = body.match(/(?:modifiers?|stats?)\s*[:=]\s*([^;)]+)/i);
        const appM = body.match(/(?:temporary\s*appearance|appearance)\s*[:=]\s*([^;)]+)/i);
        const twM = body.match(/tempweight\s*[:=]\s*([0-9.]+(?:\s*lbs?)?)/i);
        const bwM = body.match(/baseweight\s*[:=]\s*([0-9.]+(?:\s*lbs?)?)/i);
        const tdM = body.match(/tempdimensions?\s*[:=]\s*([^;)]+)/i);
        const bdM = body.match(/basedimensions?\s*[:=]\s*([^;)]+)/i);
        const chainM = body.match(/(?:chainedeffect|nexteffect|leadsto|onexpire)\s*[:=]\s*([a-zA-Z0-9_\-\s]+(?:\([^)]*\))?)/i);
        const revM = body.match(/revert\s*[:=]\s*([^;)]+)/i);

        statusEffectsFound.push({
          fullMatch,
          name,
          body,
          expires: expM ? expM[1].trim() : undefined,
          duration: durM ? durM[1].trim() : undefined,
          began: begM ? begM[1].trim() : undefined,
          description: descM ? descM[1].trim() : undefined,
          modifiers: modM ? modM[1].trim() : undefined,
          appearance: appM ? appM[1].trim() : undefined,
          tempWeight: twM ? parseFloat(twM[1]) : undefined,
          baseWeight: bwM ? parseFloat(bwM[1]) : undefined,
          tempDimensions: tdM ? tdM[1].trim() : undefined,
          baseDimensions: bdM ? bdM[1].trim() : undefined,
          chainedEffect: chainM ? chainM[1].trim() : undefined,
          revert: revM ? revM[1].trim() : undefined
        });
      }

      let activeTransformationAppearance: string | undefined;

      for (const eff of statusEffectsFound) {
        const isExpired = WeightInventoryEngine.isStatusEffectExpired(
          eff.expires,
          eff.duration,
          eff.began,
          currentTimestamp
        );

        if (isExpired) {
          if (eff.chainedEffect) {
            let chainInner = eff.chainedEffect;
            const durMatch = chainInner.match(/duration\s*[:=]\s*(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/i);
            let chainedExpTime: string | undefined;
            if (durMatch) {
              const val = parseFloat(durMatch[1]);
              const unit = durMatch[2].toLowerCase();
              let durSec = val;
              if (unit.startsWith('m')) durSec = val * 60;
              else if (unit.startsWith('h')) durSec = val * 3600;
              else if (unit.startsWith('d')) durSec = val * 86400;
              const advanced = WeightInventoryEngine.advanceWorldTimestamp(`Timestamp: ${currentTimestamp}`, durSec);
              chainedExpTime = WeightInventoryEngine.extractWorldTimestamp(advanced) || `+${durSec}s`;
            }

            if (!chainInner.toLowerCase().includes('began:') && currentTimestamp) {
              chainInner = chainInner.endsWith(')') ? chainInner.replace(/\)$/, `; Began: ${currentTimestamp})`) : `${chainInner}(Began: ${currentTimestamp})`;
            }
            if (chainedExpTime && !chainInner.toLowerCase().includes('expires:')) {
              chainInner = chainInner.endsWith(')') ? chainInner.replace(/\)$/, `; Expires: ${chainedExpTime})`) : `${chainInner}; Expires: ${chainedExpTime})`;
            }

            const chainAppM = chainInner.match(/(?:temporary\s*appearance|appearance)\s*[:=]\s*([^;)]+)/i);
            if (chainAppM) {
              activeTransformationAppearance = chainAppM[1].trim();
            }

            const chainedTag = chainInner.startsWith('[') ? chainInner : `[Status:${chainInner}]`;
            updated = updated.replace(eff.fullMatch, chainedTag);
            changes.push(`Effect "${eff.name}" expired and transitioned to chained effect "${eff.chainedEffect}"`);
          } else {
            updated = updated.replace(eff.fullMatch, '');
            updated = updated.replace(/\n\s*[-*•]?\s*\n/g, '\n');
            changes.push(`Status effect "${eff.name}" duration elapsed and expired`);

            if (eff.baseWeight !== undefined && eff.tempWeight !== undefined) {
              const bodyWMatch = updated.match(/[-*•]?\s*(?:Body\s+Weight|Weight)\s*[:=]\s*([0-9.]+)\s*lbs?/i);
              if (bodyWMatch) {
                updated = updated.replace(bodyWMatch[0], `- Body Weight: ${eff.baseWeight} lbs`);
                changes.push(`Reverted Body Weight to base ${eff.baseWeight} lbs after "${eff.name}" expired`);
              }
            }

            if (eff.baseDimensions) {
              const dimMatch = updated.match(/[-*•]?\s*(?:Physical\s+Dimensions|Dimensions)\s*[:=]\s*([^\r\n]+)/i);
              if (dimMatch) {
                updated = updated.replace(dimMatch[0], `- Physical Dimensions: ${eff.baseDimensions}`);
                changes.push(`Reverted Physical Dimensions to base "${eff.baseDimensions}" after "${eff.name}" expired`);
              }
            }
          }
        } else {
          // If active effect has a relative duration (e.g. 3s, +3s) but missing Began/absolute expiration:
          // Stamp Began and an absolute Expires timestamp into the tag so future turns can reliably calculate expiration!
          if (!eff.began && currentTimestamp && (eff.duration || (eff.expires && /^[+]?\s*\d+\s*(?:s|sec|m|min|h|hr|d)\b/i.test(eff.expires)))) {
            const rawDur = eff.duration || eff.expires;
            const durMatch = rawDur?.match(/(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/i);
            if (durMatch) {
              const val = parseFloat(durMatch[1]);
              const unit = durMatch[2].toLowerCase();
              let durSec = val;
              if (unit.startsWith('m')) durSec = val * 60;
              else if (unit.startsWith('h')) durSec = val * 3600;
              else if (unit.startsWith('d')) durSec = val * 86400;
              const advanced = WeightInventoryEngine.advanceWorldTimestamp(`Timestamp: ${currentTimestamp}`, durSec);
              const cleanExp = WeightInventoryEngine.extractWorldTimestamp(advanced) || `+${durSec}s`;

              let newBody = eff.body;
              if (!newBody.toLowerCase().includes('began:')) {
                newBody += `; Began: ${currentTimestamp}`;
              }
              if (newBody.toLowerCase().includes('expires:')) {
                newBody = newBody.replace(/expires\s*[:=]\s*[^;)]+/i, `Expires: ${cleanExp}`);
              } else {
                newBody += `; Expires: ${cleanExp}`;
              }
              const newTag = `[Status:${eff.name}(${newBody})]`;
              updated = updated.replace(eff.fullMatch, newTag);
            }
          }

          if (eff.appearance) {
            activeTransformationAppearance = eff.appearance;
          }
        }
      }

      // Handle transformation appearance under [NAME & DESCRIPTION]
      const nameDescIdx = updated.indexOf('[NAME & DESCRIPTION]');
      if (nameDescIdx >= 0) {
        const nextSecIdx = WeightInventoryEngine.findNextSectionHeaderIndex(updated, nameDescIdx + 20);
        const nameDescEnd = nextSecIdx > 0 ? nextSecIdx : updated.length;
        let nameDescContent = updated.substring(nameDescIdx, nameDescEnd);
        const tempAppMatch = nameDescContent.match(/[-*•]?\s*Temporary\s+Appearance[^\r\n]*/i);

        if (activeTransformationAppearance) {
          const newLine = `- Temporary Appearance: ${activeTransformationAppearance}`;
          if (tempAppMatch) {
            if (tempAppMatch[0] !== newLine) {
              nameDescContent = nameDescContent.replace(tempAppMatch[0], newLine);
              updated = updated.substring(0, nameDescIdx) + nameDescContent + updated.substring(nameDescEnd);
              changes.push('Updated Temporary Appearance for active transformation');
            }
          } else {
            const descMatch = nameDescContent.match(/[-*•]?\s*Description\s*[:=][^\r\n]*/i);
            if (descMatch && descMatch.index !== undefined) {
              const insertAt = nameDescContent.indexOf('\n', descMatch.index + descMatch[0].length);
              const pos = insertAt >= 0 ? insertAt + 1 : nameDescContent.length;
              nameDescContent = nameDescContent.substring(0, pos) + `${newLine}\n` + nameDescContent.substring(pos);
            } else {
              nameDescContent = nameDescContent + `\n${newLine}`;
            }
            updated = updated.substring(0, nameDescIdx) + nameDescContent + updated.substring(nameDescEnd);
            changes.push('Added Temporary Appearance for active transformation');
          }
        } else if (tempAppMatch) {
          nameDescContent = nameDescContent.replace(/[-*•]?\s*Temporary\s+Appearance[^\r\n]*\r?\n?/i, '');
          updated = updated.substring(0, nameDescIdx) + nameDescContent + updated.substring(nameDescEnd);
          changes.push('Removed expired Temporary Appearance (reverted to base appearance)');
        }
      }
    }

    return {
      updatedContent: WeightInventoryEngine.cleanDuplicateRepeatedPhrases(updated),
      stats,
      changes
    };
  }
}
