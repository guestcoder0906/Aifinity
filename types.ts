export interface FileData {
  content: string;
  displayName?: string;
}

export interface FileMap {
  [filename: string]: string; // content
}

export interface FileMetadata {
  [filename: string]: {
    displayName: string;
  };
}

export interface HealthTransaction {
  target?: string;
  amount: number;
  operation: 'damage' | 'heal';
  currentHealth?: number; // Can be negative (tracks even while dead/unconscious)
  damageType?: string;
  source?: string;
  bodyPart?: string;
  injury?: string;
  rawText?: string;
  isMassiveDamage?: boolean;
  isUnconscious?: boolean;
  isDead?: boolean;
  deathReason?: string;
}

export interface CurrencyTransaction {
  name: string;
  amount: number;
  worth?: string;
  worthValue?: number;
  dimensions?: string;
  singleWeight?: number;
  isDigital?: boolean;
  operation: 'add' | 'deduct' | 'transfer';
  container?: string;
  location?: string;
  giver?: string;
  recipient?: string;
  rawText?: string;
}

export interface InventoryTransaction {
  name: string;
  quantity?: number;
  operation: 'add' | 'remove' | 'equip' | 'unequip' | 'transfer' | 'drop' | 'consume_use' | 'refill' | 'set_usage';
  container?: string;
  targetCharacter?: string;
  usageChange?: number;
  currentUsage?: number;
  maxUsage?: number;
  unit?: string;
  isRefillable?: boolean;
  refillResource?: string;
}

export interface UpdateItem {
  /** The category of update (e.g. Health change, Item gained) */
  type: 'stat' | 'item' | 'time' | 'location' | 'status' | 'misc' | 'currency';
  /** Human readable description (e.g. "Health -10") */
  text: string;
  /** Numeric value associated with the update (e.g. -10) */
  value: number;
  /** High-level category for dynamic classification without hardcoded keywords */
  category?: 'currency' | 'inventory' | 'stat' | 'energy' | 'mount' | 'time' | 'location' | 'health' | 'misc';
  currency?: CurrencyTransaction;
  inventory?: InventoryTransaction;
  health?: HealthTransaction;
}

export interface CheckDef {
  name?: string;
  description?: string;
  difficulty?: 'trivial' | 'easy' | 'moderate' | 'hard' | 'very_hard' | 'near_impossible';
  thresholds?: { [outcome: string]: number };
  // AI-selected rules for dynamic modifier calculation
  rules?: string[];
  // Alternate AI format fields
  check?: string;
  stat?: string;
  threshold?: number;
  modifier?: number;
}

export interface TimeTravelDirective {
  targetTime?: string;
  turnsBack?: number;
  preserveFiles?: string[]; // file names or entity names that should NOT be reverted (e.g. time traveler themselves)
  reason?: string;
}

export interface ActionUsageCost {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  costFormatted: string;
  calls?: number;
  model?: string;
}

export interface AIResponse {
  narrative: string;
  updates?: UpdateItem[];
  files?: { [filename: string]: FileData | string | null };
  checks?: CheckDef[];
  gameOver?: boolean;
  recommendations?: string[];
  playerRecommendations?: Record<string, string[]>;
  currencyTransactions?: CurrencyTransaction[];
  inventoryTransactions?: InventoryTransaction[];
  healthTransactions?: HealthTransaction[];
  timeTravel?: TimeTravelDirective;
  usage?: ActionUsageCost;
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface NarrativeEntry {
  id: string;
  text: string;
  type: 'system' | 'user' | 'ai';
  recommendations?: string[];
  playerRecommendations?: Record<string, string[]>;
  usage?: ActionUsageCost;
}

export interface TurnSnapshot {
  id: string;
  timestamp: number;
  turnNumber: number;
  userAction?: string;
  narrative: NarrativeEntry[];
  updates: UpdateItem[];
  recommendations: string[];
  playerRecommendations?: Record<string, string[]>;
  fileSystemState: {
    files: Record<string, string>;
    metadata: Record<string, { displayName: string }>;
  };
  worldTime?: string;
  gameOver?: boolean;
}

export interface EntityEffect {
  name: string;
  description?: string;
  duration?: string | number;
  status?: string; // e.g. "Lit", "Broken", "Frozen", "Burning", "Electrified"
  condition?: string; // e.g. "Broken until repaired", "Pristine", "Damaged"
}