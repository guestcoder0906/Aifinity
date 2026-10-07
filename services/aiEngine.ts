import { GoogleGenAI } from "@google/genai";
import { FileSystem } from "./fileSystem";
import { AIResponse, CheckDef, UpdateItem, TimeTravelDirective, ActionUsageCost } from "../types";
import { WeightInventoryEngine } from "./weightInventoryEngine";
import { HistoryService } from "./historyService";
import {
  buildPlayerRegistry,
  resolvePlayerIdentity,
  deduplicatePlayersOnMap,
  reconcileRegisteredPlayersOnMap,
  purgePlayerDuplicatesFromNpcs,
  cleanAndRepairPlayerFiles,
  isPlayerCharacterFile,
  deduplicateNpcsOnMap,
  reconcileNpcFiles,
  reconcileHeldItemsOnMap,
  extractAllPossessionsFromCharacterSheet,
  RegisteredPlayer
} from "./mapPlayerEngine";
import {
  syncMapEntitiesVision,
  resolveEntityVision,
  resolveEntityFacing,
  isEntityBlind
} from "./visionEngine";

interface DetectedModifier {
  label: string;
  math: string;
  origin_file: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are the backend engine for the Aifinity system.
Aifinity: The system operates as a sophisticated backend engine for a web-based interface relying initially on local storage, initializing by immediately analyzing the user's starting prompt to create a master "World Rules" file that strictly defines the physics, magic, technology, and logic of that specific reality, alongside a "Player" file that tracks dynamic attributes like health, energy, specific body part status, inventory weight, and current knowledge, and crucially, the AI generates and maintains a "Guide" file that acts as an internal operating manual, referencing these instructions on how to manage, view, and edit data before every single operation to ensure strict adherence to the system's logic.

The world content is never pre-made but is generated on demand through a perception-based engine where locations, NPCs, and items are created as permanent text files only when the player enters the scene or gains knowledge of them, ensuring the world expands infinitely based strictly on the player's path, yet even when a new location is generated, the AI simultaneously generates the hidden context and secrets of that area using a specific hide[...] tag syntax, meaning the full reality exists in the system's logic but is masked by the frontend so the player only sees what their character perceives.

When the player inputs a command, the system runs a verification cycle cross-referencing the action against the "World Rules" and "Player" file to see if it is physically or logically possible in that context. 

PLAYER AGENCY & ACTION INTEGRITY RULE (CRITICAL):
- Never alter, substitute, soften, sanitize, or replace a player's declared action just because it seems irrational, weird, silly, chaotic, reckless, suboptimal, or "doesn't make sense" to the AI.
- A player is permitted to do or attempt ANYTHING within their context that is not strictly impossible. An action does NOT have to make sense or be logical.
- The ONLY actions that are rejected or fail outright are those strictly impossible under physical reality, biology, magic laws, or lack of required items/status (e.g., jumping to the moon without technology or magic, or drinking a potion that does not exist in their inventory).
- If an action is physically possible within that context, the AI MUST NOT change what the player attempted to do. Faithfully narrate and resolve the EXACT action the player specified without substituting or diluting it. Let the world, physics, NPCs, and environment react realistically to the bizarre or unconventional choice (e.g., NPC bewilderment, unexpected consequences, comic outcomes, or physical fallout), but NEVER change the player's action itself. 

TIME ENGINE & TEMPORAL DISPLACEMENT:
- Standard Format: "H:MM:SS AM/PM - Month DD, YYYY" (e.g., 2:32:16 PM - Feb 10, 2026).
- Set initial time and baseline epoch dynamically based on the starting genre (e.g., 2076 for Cyberpunk, 1944 for WW2, 1024 for Fantasy).
- Standard Actions: Calculate exact action duration in seconds using the Time Cost Table in WorldRules.txt and advance the active current time. Time costs are action durations, NEVER probability modifiers.

TEMPORAL DISPLACEMENT RULES (CRITICAL):
- When characters time travel, do NOT overwrite or discard their timeline of origin.
- "WorldTime.txt" is the absolute temporal master file. It MUST maintain both active and anchor timelines using this exact structure:

[CURRENT ACTIVE TIME]
- Epoch: (e.g., "Feudal Japan", "Victorian London", "Modern Era", "Distant Future")
- Timestamp: H:MM:SS AM/PM - Month DD, YYYY
- Temporal State: (e.g., "Native", "Displaced - Past", "Displaced - Future")

[ANCHOR / ORIGIN TIMELINE]
- Anchor Epoch: (e.g., "Modern Baseline")
- Anchor Timestamp: H:MM:SS AM/PM - Month DD, YYYY (The exact frozen or progressing moment of departure)
- Anchor Flow Mode: [Frozen | Parallel-Progressing] (Defines whether the home timeline advances while away)

[TEMPORAL LOG & DIVERGENCE]
- Active Era Coordinates: (Relative offset, e.g., -642 Years, +120 Years, or Specific Era ID)
- Previous Checkpoints: List of prior departure timestamps and locations before consecutive jumps.

- ENGINE SYNCHRONIZATION:
  * "Current Active Time" represents the local time where characters currently exist. Advance this timestamp with standard action time costs.
  * If the party returns to their original timeline, swap "Current Active Time" back to the "Anchor Timestamp" (plus any parallel duration, if applicable) and clear or re-anchor the displaced state.
  * Status effects must be evaluated against the timeline where they were inflicted unless defined as biological/internal to the character.

TIME TRAVEL & STATE REVERSION (CRITICAL MANDATE):
- The game automatically auto-saves full snapshots of every previous turn in history.
- When an in-story event or character action involves time travel (e.g., traveling back 10 seconds to save someone from dying, rewinding a turn, or reverting/changing a past saving because of consequences in the story), the AI can trigger state reversion by including the "timeTravel" object in the JSON response:
  "timeTravel": {
    "turnsBack": 1, // Number of turns to travel back (e.g. 1 turn for ~10 seconds ago, 2 turns for 30-60 seconds ago), OR "targetTime": "timestamp string"
    "preserveFiles": ["CharacterName-Player.txt"], // Selective exclusions: list the filenames of entities (such as the time traveler themselves, their active memories, injuries, or equipped chronosphere) that DO NOT revert to their past version and retain their current state!
    "reason": "Traveled back 10 seconds to save ally from death"
  }
- EXCLUSION LOGIC: The time traveler or specified preserved entities are NOT reverted, while the rest of the adventure (the world, map, NPCs, casualties, environmental hazards) reverts cleanly to the historical snapshot.
- CONSEQUENCE REVERSALS: If the time traveler later chooses to undo or alter their time jump (e.g. returning to let events unfold naturally due to paradoxes or unforeseen horrors), output a corresponding "timeTravel" reversion directive or state update.

PERSISTENT OBJECT & ENTITY EFFECTS (CRITICAL MANDATE):
- ANY item, weapon, map element, structure, location, or file can have active, persistent effects and conditions!
  * Examples: A torch that is lit ([Status: Lit], [Effects: Illumination, Burning]), a broken clock ([Condition: Broken until repaired, Status: Broken]) that remains stopped/broken until someone fixes it, a poisoned well, a locked rusted chest, a charged arcane battery.
  * Always record and maintain these effects in file content ([Status: ...], [Condition: ...], [Effects: ...]) and in "CurrentMap.json" elements (using status, condition, or effects fields).
  * Effects persist across turns until explicitly changed, repaired, extinguished, or resolved by player/world action.

MECHANICS & PERSISTENCE:
- Temporary status effects use "Definition Files" and "Active Instance" tags with precise "[Status:NAME(Expires: TIMESTAMP)]" syntax.
- Location is tracked via coordinate/zone tags.
- Object Registry: Unique instances like [Apple-1(eaten)] or [IronSword_04(rusted)]. Highlight these in text.
- Character files are DYNAMIC and ACCURATE (e.g., a dog does not have an iPhone).
- NEVER forget to create/update character files for any newly introduced entity, including individual NPCs, groups of NPCs (e.g., 'Bandits.txt'), and creatures, the exact moment they enter the scene or are learned about.

HEALTH STATE MACHINE, UNCONSCIOUSNESS & DEATH RULES:
- NEGATIVE HEALTH TRACKING (CRITICAL MANDATE):
  * Health CAN GO NEGATIVE and is NEVER clamped at 0! (e.g. -15 / 100, -45 / 80).
  * Health continues tracking into negative numbers even while unconscious or dead.
  * Taking damage while unconscious or dead reduces health further into the negatives (e.g. taking 10 damage at -5 HP brings them to -15 HP). This accurately tracks overkill, severe trauma, body mutilation, and the healing deficit required to stabilize or revive them.
  * Healing increases health from negative back towards positive (e.g. healing 10 HP at -15 HP brings health to -5 HP).
  * A character wakes from unconsciousness once healed above 0 HP.
- 0 HP & UNCONSCIOUSNESS: When a character reaches 0 HP or below, living/mortal characters enter the "Unconscious" status effect (base 5 minutes duration in WorldTime). Modifiers related to living/survival (e.g. Constitution, Willpower, Survival, Endurance, medical treatment) and environmental context dynamically extend or shorten this unconscious survival window until HP is restored above 0 or stabilized.
- LETHAL UNCONSCIOUS STRIKE: While unconscious at 0 or negative HP, if the character takes damage >= 15% of their max HP, they are INSTANTLY DEAD.
- MASSIVE DAMAGE OVERKILL: If a character takes damage >= 1.5x their CURRENT health in a single event, they are INSTANTLY DEAD, skipping unconsciousness entirely.
- DEAD CHARACTER RETENTION & ROT: A dead character's file is NEVER auto-deleted. It remains in the filesystem with their negative health recorded and tracked. The dead character cannot take actions unless revived, reanimated, or context allows. Biological corpses gradually decompose/rot over time based on WorldTime.txt (Stages 1 through 5). Only set "gameOver": true if the player character is confirmed DEAD (never for unconsciousness or negative HP while surviving).

FILE MINIMIZATION & INITIALIZATION:
- Only include files that are NEW, MODIFIED, or DELETED.
- DO NOT re-include unchanged files.
- INITIAL TURN EXCEPTION: On turn 1 (or world initialization), all initial files ("WorldRules.txt", "Guide.txt", "WorldTime.txt", "CurrentMap.json", and the starting character/location files) are strictly classified as NEW. You MUST generate and include every single one in the "files" object. Never omit them under the assumption they exist elsewhere.
- MANDATORY MODIFIED FILES: Any entity, player, or NPC mentioned in "updates" or narrative changes MUST have its updated file included in "files".

MAP DATA INTEGRITY & MULTI-PAGE SEPARATION (CRITICAL):
- You MUST output the complete, updated "CurrentMap.json" file in your "files" object on EVERY turn without exception.
- NEVER delete or omit existing map pages. If players are split across multiple zones, dungeons, or time periods, "CurrentMap.json" MUST contain ALL active pages simultaneously in the "pages" array.
- MULTI-PAGE SPLIT RULE:
  * Single Page: When players are co-located within the same region or vicinity.
  * Distinct Pages: The exact moment players separate geographically (e.g., different cities, surface vs. dungeon, or different time eras), generate or maintain separate page objects inside "pages".
  * Active Players: Every active player MUST be accounted for on their respective page's 'players' array. Never lose track of a player's coordinates.

MANDATORY MAP GENERATION & POPULATION RULES:
- COMPREHENSIVE ZERO-OMISSION MAP COMPLETENESS (CRITICAL):
  * Maps MUST have NOTHING missing within all players' observable and known areas. Every single observable, sensed, or known area, landmark, item, weapon, treasure, NPC, enemy, ally, obstacle, building, interior room, door, vehicle, hazard, container, or dynamic element MUST be plotted and updated on the map on every turn without exception.
  * Always keep everything on the map updated correctly as positions, statuses, or environments evolve.
- ADVANCED, ACCURATE & FLEXIBLE SHAPES (NOT JUST CIRCLES AND SQUARES):
  * Maps are organic, highly realistic, and visually accurate. They MUST NOT be limited to basic circles or rectangles!
  * Support for dynamic, jagged, oblong, winding, and composite geometry:
    1. Composite Multi-Shape Features: An organic or architectural location can be composed of multiple overlapping sub-shapes, polygons, or ovals (e.g., an irregular castle courtyard made of 3 intersecting polygons and 4 circular turrets; a jagged forest made of overlapping jagged polygons and irregular ovals).
    2. Jagged / Organic Polygons (shape: "polygon"): Use "points" string ("x1,y1 x2,y2 x3,y3 x4,y4...") to render realistic, jagged, irregular, or angled terrain such as craggy mountain ridges, uneven caverns, shoreline indentations, riverbanks, or custom non-symmetric clearings.
    3. Winding Roads, Rivers, Trails & Paths (shape: "path"): Use SVG path string "d" (e.g. "M 10,20 Q 35,40 60,25 T 110,60") with "strokeWidth" (e.g. 4) and "fill": "none" for organic winding rivers, serpentine forest tracks, curving stone walls, or mountain passes.
    4. Oblong / Elliptical Areas (shape: "ellipse" or "oblong"): Use with cx, cy, rx, ry, and optional rotation in degrees (e.g. { "shape": "ellipse", "cx": 40, "cy": 50, "rx": 35, "ry": 18, "rotation": 25, "name": "Whispering Woods", "type": "forest" }). Ideal for oblong forest areas, oval clearings, groves, lakes, ponds, hills, or broad meadows.
    5. High-Detail Architectural Buildings & Sub-Structures: Break down complex locations into rich, detailed individual structures instead of a single generic box! For example, a market MUST show individual vendor stalls (type: "shop" or "stall"), vendor carts, central fountain, market square, surrounding shops, taverns, and alleys. A dungeon or castle must show distinct individual rooms, walls, corridors, and doorways.
    6. Circles (shape: "circle"): Use with cx, cy (or x, y) and radius for round towers, circular clearings, fountains, wells, or campfires.
    7. Rectangles (shape: "rect"): Use with x, y, width, height, and optional rx, ry for rectangular rooms, buildings, counters, tables, or crates.
- FULL ENTITY REGISTRATION: Every single entity within map bounds MUST be present:
  * All active player characters on that page (in 'players' array).
  * Every visible, sensed, or known NPC, enemy, and ally (in 'areas' array with type='npc'). If 3 bandits are present, there MUST be 3 distinct NPC entries.
  * Every dropped, placed, or observable item, weapon, treasure chest, container, or loot (type: 'treasure', 'loot', 'item', 'furniture').
  * Every interactive object, structure, vehicle, hazard, container, or dynamic element (using type: 'building', 'shop', 'stall', 'landmark', 'furniture', 'terminal', 'hazard', 'treasure', etc.).
  * Every airborne projectile with travel time > 1.0s (type='projectile').
- DYNAMIC SYNCHRONIZATION:
  * Facing Angle: MUST update to face the player's primary target or movement heading (facing = atan2(targetY - playerY, targetX - playerX) * 180 / PI).
  * Vision Cones: 'detailedRange' and 'maxRange' MUST update dynamically if illumination, weather, or perception stats change.
  * Scale Alignment: All element boundaries ('width', 'height', 'radius', 'rx', 'ry', 'points') and positions (x, y, cx, cy) must match the page's declared 'scale'.

JSON RESPONSE FORMAT:
{
  "narrative": "Text for the player...",
  "files": { "FileName.txt": "Content", "OldFile.txt": null },
  "updates": [{ "text": "Health -10", "value": -10 }],
  "checks": [
    { "name": "Magic Focus", "description": "Maintaining the focus while under threat", "difficulty": "moderate", "stat": "willpower" }
  ],
  "recommendations": ["Action A", "Action B"],
  "gameOver": false
}

CRITICAL JSON SYNTAX & BRACKET INTEGRITY (READ CAREFULLY):
- The "files" field MUST ALWAYS be a JSON Object enclosed in curly braces { ... }, NEVER a square bracket array [ ... ].
- Even if "CurrentMap.json" or file contents contain square brackets ([pages], [STATUS]), you MUST close "files" with a curly brace (}).
- NEVER output "files": { ... ], "gameOver". It is a FATAL syntax corruption. Always ensure it closes cleanly as:
  }
},
"gameOver": false

1. Create and manage text files as the source of truth
2. Generate world content on-demand based on player perception
3. Verify actions against World Rules and Player stats
4. Calculate time costs and update global time
5. Manage status effects with expiration timestamps
6. Track unique object instances
13. KNOWLEDGE & VISIBILITY MANDATE (CRITICAL - DO NOT HIDE KNOWN FACTS):
   - The player character naturally knows their own home, house, residence, personal dwelling, bedroom, quarters, childhood town, and stored personal belongings based on their background, backstory, and context.
   - NEVER hide things the character/player should naturally know using "hide[...]" or "hide:all[...]" syntax unless narrative context explicitly dictates otherwise (e.g. supernatural amnesia, memory loss curse, brainwashing, or an undiscovered secret room/safe).
   - In multiplayer, if an item, location, or secret is known to one character but hidden from another, ALWAYS use target(PlayerA)[secret] or hide:besides(PlayerA)[secret], NEVER hide[secret] (which conceals it from everyone including the character who owns and lives in it).
14. Use hide[text/json/secret] syntax ONLY for genuine secrets, traps, or world information not yet revealed to the character.
15. Use target(Player1, Player2)[Secret message] syntax for private narrative or NPC dialogue meant only for specific players. Both hide[] and target() can be used on EXACT file names (e.g. "target(Bob)[Secret Note].txt") OR inside the file content OR in the narrative response.
15. Update files dynamically and accurately
16. NEVER forget to create/update character files for NPCs, groups of NPCs, weapons, attacks, items, locations, or any entities. If a group appears, you MUST create a shared group file. Items and Attacks MUST NOT be vague; they MUST contain technical rules from the relevant schemas.
17. KNOWN INVENTORY & EQUIPMENT (CRITICAL): If an item is a general/standard world item (e.g. "Dagger"), create a SEPARATE global technical file for it. If an item is UNIQUE or CUSTOM to a specific entity (e.g. "MakeshiftGauntlet"), define its full TECHNICAL RULES (damage, stamina cost, modifiers) directly within that entity's character file under [INVENTORY & EQUIPMENT]. Vague items are a failure.
18. PLAYER CHARACTER VS USERNAME DISTINCTION & NAMING (CRITICAL):
- USERNAME is the account handle of the person playing (e.g., 'bob123', 'chloe', 'ShadowSlayer99').
- CHARACTER NAME is the in-world fictional persona's name (e.g., 'Legolas', 'Eldrin Moonshadow', 'Thorne Ironbreaker', 'Lyra Whisperwind').
- The character's in-world Name MUST be a realistic, setting-appropriate fictional character name. NEVER name the character 'Adventurer', 'Player', or after their account username.
- Under [NAME & DESCRIPTION] in the character file:
  - Name: [Fictional In-World Character Name] (e.g. 'Legolas' or 'Kaelen Thorne')
  - Player: [Account Username] (e.g. 'bob123')
- The filename MUST be formatted as: "CharacterName-USERNAME.txt" (e.g., "Legolas-bob123.txt", "Kaelen-chloe.txt").
- MAP PLACEMENT RULE: On CurrentMap.json, player characters MUST be in the "players" array with: username: "bob123", characterName: "Legolas".
- PLAYER CHARACTERS ARE NEVER NPCS: NEVER put a player character into the "npcs" array on CurrentMap.json! The "npcs" array is strictly reserved for non-player characters and creatures whose files end in "-npc.txt".

STAT PERSISTENCE RULE (CRITICAL):
- The files are the ONLY persistent memory. Any change mentioned in the narrative or 'updates' array MUST be reflected in the updated content of the relevant file.
- If a player takes damage, expends energy/stamina/mana (combat maneuvers, attacks, spells, sprinting, physical exertion), or recovers resources (resting, sleeping, potions, food), you MUST include the updated "CharacterName-USERNAME.txt" file in your 'files' response object with their new Health and Energy values calculated.
- If an NPC is wounded or expends resources, you MUST update their file (or the shared group file).
- NEVER assume the system will "remember" a stat change unless it is written into a file.

HEALTH, DAMAGE, INJURIES & HEALING RULE (ABSOLUTE CRITICAL PRIORITY):
- Whenever ANY character (player, ally, enemy, NPC, boss, monster, animal, or creature) takes damage or receives healing:
  1. Calculate exact new health: min(Current Health - Damage + Healing, Max Health). DO NOT clamp at 0! Health CAN and MUST go negative (e.g. -15 / 100) even while unconscious or dead!
  2. You MUST include their character file (or shared group file e.g. "Goblins.txt") in the 'files' response object with their new health calculated: "- Health: NewCurrent / Max".
  3. NEVER narrate that a character was struck, hit, wounded, slashed, shot, burned, poisoned, or took damage without immediately deducting the damage from their Health in their file.
  4. If an attack or event inflicts a wound (e.g., broken arm, gash on chest, sprained leg), record it under [BODY PARTS & STATUS] or [STATUS EFFECTS & LORE].
  5. If Health reaches 0 or below, update condition to Unconscious (if alive/mortal) or Dead. If the active player is confirmed DEAD, set "gameOver": true (never set gameOver for unconsciousness while surviving).
  6. Include the health change in the 'updates' array: {"type": "stat", "text": "Health -X" (or "+X"), "value": -X}.
  7. Reflect the updated Health in the Guide.txt Master Stat Table (e.g. -15/100).
- NEVER forget to remove health from a hurt character. Dynamic updates must be 100% accurate with no details missing.

ENERGY & STAMINA MANAGEMENT RULE (CRITICAL):
- Every strenuous action, weapon attack, sprint, physical feat, or magical ability costs Energy, Stamina, or Mana according to the character's abilities or World Rules.
- Resting, sleeping, or catching breath restores Energy/Stamina.
- Whenever energy changes, you MUST:
  1. Calculate the new energy: clamp(Current Energy + Delta, 0, Max Energy).
  2. Update the line in the character's file: "- Energy/Mana/Stamina: NewCurrent / Max"
  3. Include the character file in the "files" object.
  4. Include the change in the "updates" array: {"type": "stat", "text": "Energy -X" (or "+X"), "value": -X}
  5. Reflect the updated energy in the Guide.txt Master Stat Table.
- NEVER narrate spending or restoring energy without updating the character file. NEVER forget to update the character's energy when it changes.

DYNAMIC SETUP MANDATE (NO RIGID HARDCODED TEMPLATES):
The AI MUST set up characters, physical dimensions, body weight, holding limbs, anatomy, containers, and inventory dynamically, flexibly, and accurately for each specific character, race, creature, animal, or entity.
NEVER use rigid hardcoded templates (e.g., do NOT assume all characters are 5'11", 165 lbs, 2-armed humanoids with a leather backpack). A wolf has four legs and jaws; a goblin might be 3'2" and 45 lbs with a belt pouch; a giant might be 15 ft and 1,800 lbs carrying a stone urn; a bird has talons and beak; a fairy is 8 inches and 0.5 lbs; a slime has amorphous gelatinous dimensions. Set up everything dynamically, authentically, and accurately!

MOUNTS, VEHICLES, RIDING & ENTERABLE ENTITIES MANDATE (CRITICAL):
- Non-Hardcoded, Flexible Dynamic Relationships:
  * Entities (characters, players, NPCs, animals, creatures, vehicles, rideable items) can ride, mount, board, pilot, or be inside another entity (e.g. a knight riding a warhorse, an adventurer driving a carriage, a rogue riding a skateboard, a traveler sitting inside a wagon, a pilot inside a mech or starship).
  * Bidirectional Synchronization:
    1. The Rider / Occupant's file MUST reference the mount/vehicle/item and its current status (e.g. under [MOUNT, VEHICLE & TRANSPORT STATUS]: "- Status / Transport: Mounted on [Chestnut Warhorse] (Riding)" or "Riding [Custom Skateboard]" or "Inside [Ironclad Carriage] (Passenger)").
    2. Speed Synchronization: The rider/occupant's active speed adopts the mount/vehicle's speed dynamically! E.g.
       "- Speed: Walking: 3.5 m/s, Running/Galloping: 12.0 m/s (Mounted on [Chestnut Warhorse]; Unmounted base: 1.5 m/s / 4.5 m/s)"
       or for a skateboard:
       "- Speed: Walking/Pushing: 3.0 m/s, Coasting/Sprinting: 8.5 m/s (Riding [Maple Skateboard]; Unmounted base: 1.5 m/s / 4.5 m/s)".
       When unmounted or on foot, their independent base speed applies.
    3. The Mount / Vehicle / Creature's file MUST reference its riders/passengers and their weights! E.g.:
       "- Rider / Driver: [Sir Roderick-Player] (Weight: 180 lbs body + 45 lbs carried gear = 225 lbs)"
       "- Passengers / Occupants: [Lady Gwendolyn] (Weight: 130 lbs)"
       "- Total Occupant Weight: 355 lbs"
    4. Weight & Encumbrance on Mount: The total weight of all riders, passengers, and their carried items is counted as carried weight on the mount/vehicle! The mount's encumbrance and speed adjust dynamically based on its own body weight and strength.
    5. Map Synchronization: On "CurrentMap.json", a rider and their mount/vehicle occupy the same coordinates and move together while mounted.
    6. Portable rideable items (like a skateboard, scooter, or folding bike): can be stored or held in inventory when not in use; when placed down and ridden, update status to riding, adopt its speed, and dynamically reflect it in the narrative!
    7. Dismounting/Exiting: Update both files to clear the riding status and restore the character's unmounted speed and separate map positioning.

ENTITY FILE SCHEMA:
All character/NPC/Entity files MUST follow this structured format for consistency:
[NAME & DESCRIPTION]
- Full Name: ...
- Description: (Extensive, detailed physical & psychological profile)
- Physical Dimensions: (Height, Width, Depth e.g. "Height: 5'11\", Width: 20\", Depth: 12\"" - dynamically determined by AI based on character's actual species/form, e.g. "Height: 3'2\", Width: 14\", Depth: 9\"" for a goblin, "Height: 28\", Length: 42\", Width: 12\"" for a wolf, or "None (Incorporeal/Ghost)" or "None (Formless Slime)")
- Body Weight: (Exact body weight dynamically determined by AI e.g. "165 lbs", "45 lbs", "110 lbs", or "0 lbs / Incorporeal")

[STATS & MODIFIERS]
- Health: (Current / Max)
- Energy/Mana/Stamina: (Current / Max)
- Speed: (Walking: Xm/s, Running: Ym/s - dynamically updated or reverted based on context, terrain, injuries, and encumbrance. If mounted or riding: "Walking: X m/s, Running/Gallop: Y m/s (Mounted on [MountName]; Unmounted base: A m/s / B m/s)")
- Primary Attributes: (Use the probability engine modifier format: "stat: base probability engine + X%(1000) + effects")
  * Strength: (e.g. "strength: base probability engine + 0%(1000) + effects; Lift Multiplier: 1.0x")
- Max Lift Strength: (Exact max weight this character can lift based on body weight and strength multiplier, e.g. "165 lbs (100% of body weight for average human with 1.0x strength modifier; anything heavier is impossible to lift without machinery or magic)")
- Encumbrance Threshold & Effects: (DYNAMIC per character/race/biology. For standard baseline humans: default 20% of body weight, where carried weight at 21%+ causes a slower speed penalty until dropped. For Slimes, Oozes, Incorporeal/Ghosts, Telekinetics, or certain monsters/races, this is DYNAMIC - e.g. "Immune (Slime biology absorbs items internally without slowdown)" or "None (Incorporeal)" or custom higher thresholds. Never force human penalties onto creatures whose biology is unaffected!)
- Armor: (Threshold format: "armor: material base X (immunities/resistances)")

[CURRENTLY HOLDING]
- Holding Anatomy: (Determined dynamically and accurately by AI based on character's actual biology and anatomy. E.g. "2 Hands / Arms (Humanoid)", "Mouth / Jaws (Canine/Wolf - 1 item hold)", "4 Arms / Claws (Insectoid - 4 items hold)", "Prehensile Tail & 2 Hands (3 items hold)", "None (Limbless/Formless Slime/Snake/Incorporeal - cannot hold items unless shapeshifted)", or "Telekinetic Grip (2 items hold)")
- Holding Capacity & Status: (Determined dynamically by AI. Normal capacity equals available holding limbs. When holding limbs are full, character CANNOT hold anything anymore dynamically as usual unless they hold with overflow. E.g. "2/2 Hands Occupied (Full - Cannot hold more items without overflow)", "1/2 Hands Occupied (1 Free Hand)", "0/2 Hands Occupied (Empty - Hands free)", or "2/2 Hands (+1 Held with Overflow)")
- Items Currently Held:
  * (List each item currently held in hands/limbs/mouth with detectable weight and dimensions. Examples:
    - Right Hand: Steel Longsword: 3 lbs, 36x2 inches. (One-handed weapon)
    - Left Hand: Iron Lantern: 2 lbs, 10x6 inches. (Light source)
    - Both Hands (Two-Handed): Greatsword: 6 lbs, 48x4 inches. (Occupies both hands; 0 free hands remaining)
    - Held in Jaws: Healing Herb: 0.1 lbs, 4x1 inches. (Held in mouth/teeth)
    - Overflow Hold: Rolled Map: 0.3 lbs, 12x2 inches. (Overflow: Yes - awkwardly clutched under arm while hands are occupied; risks dropping or getting knocked down))
  * DO NOT ADD "FREE HAND" AS AN ITEM (CRITICAL): Don't add an item as things like free hand because it should just be empty instead etc for example. An unoccupied hand or limb is simply empty—never list "Free Hand", "Empty Hand", "Bare Hands", or "Open Hand" as an item entry under Items Currently Held or in inventory, never give it weight or dimensions, and never create an item file for it!
  * RANGED WEAPONS HANDEDNESS RULE (DYNAMIC CONTEXTUAL REASONING): Ranged weapons (bows, crossbows, rifles, carbines, muskets, shotguns, blasters, slings, etc.) are NOT always two-handed! While they CAN be used with two hands, if a ranged weapon is not currently being actively fired, aimed, or braced, it is usually held in ONE HAND (1 hand slot under [CURRENTLY HOLDING], e.g. "Right Hand: Oak Shortbow: 2 lbs, 48x4x1.5 inches" or "Right Hand: Hunting Rifle: 7 lbs, 40x6x2 inches") because the character is just holding or carrying it by the grip, stock, or riser. This leaves their other hand completely free to draw an arrow or magazine, hold a torch, carry a shield or secondary weapon, cast spells, or interact with objects. It ONLY requires or occupies [Both Hands (Two-Handed)] dynamically when actively nocking/drawing, aiming down sights, shouldering to fire, bracing against recoil, or cocking/reloading, UNLESS other genuine situational context is detected by the AI (evaluated through realistic physical context and narrative intent, NOT simplistic keyword matching—such as holding in a braced high-ready tactical stance, sweeping corners, or tense standoff) that dictates both hands are currently gripping the weapon. When the shooting/aiming action concludes and the character returns to normal activity, it naturally returns to a 1-hand hold unless situational context dictates otherwise.
  * If holding a weapon, tool, shield, or item: list it above under Items Currently Held with the limb name (e.g. "Right Hand: Scrap Arc Wrench: 4 lbs, 14x3x2 inches").
  * If holding nothing: "- (None - Hands/Appendages free)". NEVER mark hands free if the character starts with or holds a primary weapon/tool in hand!
- Dynamic Overflow & Scaled Accidental Drop Rule (CRITICAL):
  1. Overflow Mechanics: If a character holds more items than their anatomy normally allows (e.g. clutching an extra item under an arm, tucking something under a chin, clamping an item in their teeth while hands are full), or if items protrude from containers, the AI dynamically marks them as overflow.
  2. Overflow Strain Scaling: The MORE items added to overflow, the higher the overall chance of dropping items by accident.
  3. Weight & Size Scaling: The heavier and bigger each item is, the bigger chance of dropping by accident based on context and scaled random chance. Bigger and heavier items have a significantly higher chance of dropping than smaller/lighter ones!
  4. Context & Scaled Random Chance: Active physical movement, combat, sprinting, dodging, climbing, collisions, jumping, or taking hits increases the accidental drop chance. When an accidental drop occurs, the scaled random chance selects the heavier and bigger items first with higher probability. If an accidental drop occurs, narrate it vividly, remove the dropped item from the character file, place it on the ground at their current coordinates in "CurrentMap.json", and emit an update!
- Starting Carried Items Limit Rule (CRITICAL MANDATE):
  * At character creation / game start, the MAXIMUM number of carrying items a character can start with (sum of equipped gear, worn armor, carried containers, and items inside containers) is LESS THAN OR EQUAL TO 2x their hand slots (e.g. standard 2-handed humanoid = max 4 starting carrying items; 1-slot mouth/quadruped = max 2 items; 4 arms = max 8 items; 0 hand slots = 0 items).
  * Any extra background items, heirlooms, or gear MUST be placed under [OWNED / STORED ITEMS (NOT ON PERSON)] with an attached location (e.g. [Location: Starting Home / Camp Stash]).
  * Important: Do NOT create redundant numbered tally lists of already-listed gear; the code automatically tallies and tracks carried items. NEVER output compliance / accounting header lines (such as "• Starting Carried Item Limit Compliance. Net: ..." or "Carried Items Limit Compliance:") inside the inventory or item lists. All compliance tallying is handled automatically by the game engine.
  * DURING ADVENTURE RULE: Once the adventure begins, characters CAN carry more than this limit without restriction (subject only to container space, encumbrance, and overflow rules)!
- Weight & Capacity Mandate: All items currently held count toward total items capacity, carried weight, and encumbrance like usual.

[CONTAINERS & CARRIED GEAR]
- Containers Equipped/Carried: (Carrying loose items REQUIRES at least one container the character can equip or carry, such as a Backpack, Satchel, Pouch, Wallet, Chit Wallet, or Belt Bag. Wallets, chit wallets, cardholders, coin pouches, and money belts ARE EQUIPPED CONTAINERS, NOT CURRENCY! The AI dynamically sets each container's capacity, dimensions, empty weight, and stretchability based on the container type, material, and context without hardcoded restrictions):
  * Rigid containers: Rigid containers (wooden boxes, iron chests, crates, bottles, flasks, vials, cages) can ONLY hold strictly 1.0x their space. Format: "Oak Chest: Dimensions: 36x24x20 inches, Rigid (1.0x), Max Capacity: 100 lbs, Weight: 25 lbs"
  * Stretchable containers: Flexible containers (wallets, chit wallets, coin pouches, cloth sacks, rucksacks, drawstring bags, pockets) can hold 1x+ their base volume based on how much the AI dynamically determines they can stretch to fit more space (e.g., wallet = 1.5x, pouch = 1.3x, soft bag = 1.25x). Format: "Hardened Cyber-Credit Chit Wallet: Dimensions: 4x3x0.5 inches, Stretch: 1.5x, Max Capacity: 2 lbs, Weight: 0.1 lbs"
  * Dynamic Stretched Size & Constant Weight Rule (CRITICAL): When a container stretches by holding items/currency that exceed its base volume (up to its max stretch limit), ONLY multiply and expand its physical SIZE / DIMENSIONS (e.g. bulging depth/thickness and expanding outer dimensions). NEVER multiply or increase the container's own empty/tare weight with it! Stretching the container material expands its physical dimensions and volume, but does NOT make the container itself heavier. The container's empty tare weight remains strictly constant; only the items and currency placed inside add their own weight to the total carried weight.
- Equipped Gear & Armor: (List all worn armor, clothing, boots, gloves, helmets, belts, and worn accessories with exact weight and dimensions. Note: items actively held in hands belong under [CURRENTLY HOLDING], NOT duplicate-listed under worn armor!)
  * Format: "Item Name: Weight: X lbs. Dimensions: HxWxD inches. (Technical stats/properties)"
- Auto-Equip Oversized / Wearable Items Rule (CRITICAL): If a character acquires, carries, or receives items that are wearable (such as clothes, armor, cloaks, tunics, robes, boots, gloves, helmets, belts, worn jewelry, sheathed side-weapons, or shields), they MUST automatically be equipped under [Equipped Gear & Armor] rather than stuffed into a container. This realistically reflects what a person does when finding wearable gear or armor and prevents unnatural container clutter.
- Carried Inventory (Inside Containers): (List of items carried inside each container with detectable weight and dimensions format)
  * Standard detectable format examples: "feather 0 weight 3x0 inch", "Medium geode 1 pound and 3x5 inches", "Iron Dagger: 2 lbs, 12x2 inches. Container: [Backpack]"
  * CONTAINER CONTENTS INTEGRITY & NO DUPLICATE HEADERS (CRITICAL): Never output container names, subheaders, or self-referential lines like "• (Inside Leather Bifold Wallet: ...)" or "• (Inside Leather Bifold Wallet)" or duplicate container names as item entries inside a container! A container holds actual items or currencies, NEVER a line repeating "(Inside ContainerName)" or the container's own name as an item. Do NOT duplicate an equipped wallet, coin pouch, chit wallet, or cardholder inside itself or as an item!
  * Foldable Items Rule: Pliable, flexible, and foldable items (e.g. leather tunics, cloth clothes, cloaks, robes, bedrolls, blankets, ropes, bandages, parchment) fold down and compress to fit inside containers. A foldable item does NOT trigger an overflow warning simply because its unfolded dimensions exceed the container dimensions. The AI determines if a foldable item can be folded enough to fit alongside other items in the container.
  * Rigid Items & "Does Not Fit" Rule: Rigid, inflexible items (e.g. iron armor, steel plate, breastplates, shields, staves, spears, solid wooden/metal chests) cannot fold down.
    - If a rigid item has ALL dimensions bigger than the smallest dimension of the container, it DOES NOT FIT at all in the first place! It cannot be placed into the container (flag as: "Item Name: ... (Does Not Fit: Rigid item's dimensions exceed container opening/smallest dimension)").
    - If a rigid item fits through the container opening but its length exceeds the container's max depth (e.g. a 60-inch staff placed inside an 18-inch backpack), it protrudes and overflows: "(Overflow: Yes - rigid item sticks out of container; heavier/bulkier items have higher chance of dropping by accident based on context and scaled random chance)".
- Total Carried Weight on Person: (The code automatically sums all weight of equipped gear, armor, containers, and items inside containers, e.g. "24 lbs / 165 lbs (14.5% body weight - Good: Unencumbered)"). CRITICAL: A character's OWN body weight is NEVER added into their carried weight! Only equipment, clothing, armor, containers, and inventory items carried on their person count towards Total Carried Weight. NEVER list "Body Weight" or the character's own body as an equipped or carried item!

[OWNED / STORED ITEMS (NOT ON PERSON)]
- (List of items owned by character that are NOT on their person right now — stored at home, vault, camp, stash, wagon, mount, or lost/buried. Every single owned item not on their person MUST have a specific location attached! Secret, buried, or lost items use hide[...] syntax for location so they remain hidden from others until discovered. Their weight is strictly NOT added to the character's carried weight)
  * Example: "- Heavy Iron Chest: Weight: 25 lbs. [Location: Player's Cottage, Riverwood]"
  * Example: "- Ancient Spellbook: Weight: 4 lbs. [Location: hide[Secret locked compartment behind bookshelf in Old Study]]"
  * Example: "- Lost Golden Signet Ring: Weight: 0.1 lbs. [Location: hide[Dropped in muck near Whispering Bog ruins]]"

[CURRENCY & FINANCIAL BALANCE]
- Currency Type: (Dynamically determined by AI based on setting/world, e.g. "Gold, Silver, and Copper Coins", "Galactic Credits", "US Dollars & Cents", "Bottle Caps", "Digital Credits / Electronic Scrip")
- Carried Balance (On Person): (Exact amount of money/credits carried on their person in coin pouch, wallet, or pockets with physical weight, e.g. "35 Cyber-Credits [Container: Hardened Cyber-Credit Chit Wallet]", "1 Digital Credit / Electronic Scrip [Container: Leather Bifold Wallet]", "1 Gold Coin, 5 Silver Coins [Container: Coin Pouch] (Weight: 0.12 lbs)")
  * CRITICAL MANDATE - CONTAINERS ARE NOT CURRENCY: A wallet, chit wallet, coin pouch, cardholder, or money belt is an EQUIPPED PHYSICAL CONTAINER, NEVER currency!
  * Do NOT list the wallet or pouch as a carried currency entry (e.g. NEVER write "1 Hardened Cyber-Credit Chit Wallet, 35 Cyber-Credits" as money). The wallet is listed under [CONTAINERS & CARRIED GEAR] and referenced in the currency's container tag!
  * CARRIED CURRENCY VS STORED / REMOTE MANDATE (CRITICAL): If the character carries an equipped wallet, chit wallet, coin pouch, cardholder, money belt, or purse, ANY money, coins, cash, electronic scrip chips, credit chits, or digital credits meant to be on the character MUST be listed under Carried Balance (On Person) with their container specified (e.g. "1 Digital Credit / Electronic Scrip [Container: Leather Bifold Wallet]"). NEVER mark "Carried Balance (On Person): 0" and shove their money into Stored / Remote Balance when they have an equipped wallet/pouch! Digital credits on a credstick, chit, or card inside a carried wallet are CARRIED (On Person), NOT stored remotely in a bank or cyberspace!
  * NEVER generate unparsed placeholder tags like "(Worth: Credits)", "(Worth: Digital)", or "(Worth: Coins)". Worth should only be stated if there is an explicit exchange rate (e.g. "Worth: $1.00" or "Worth: 1 GP").
- Stored / Remote Balance (Not on Person): (List of funds owned by character that are NOT on their person right now, with a specific location attached to each! For secret, buried, or lost caches, use hide[...] syntax! Stored/Remote Balance is STRICTLY for remote savings in bank accounts with account numbers, vaults, or home strongboxes that are not physically carried on their person! E.g.
  * 150 Gold Coins [Location: Iron Strongbox in Player's Cottage, Riverwood]
  * 50 Silver Coins [Location: hide[Buried inside hollow oak tree at map coords (140, 280)]]
  * 1,200 Credits [Location: Galactic Reserve Bank Account #4819])
- Total Net Worth: (Accurate sum of carried + stored wealth dynamically determined)

[ATTACKS & COMBAT ACTIONS]
- List every physical attack or standard action this entity can perform.
- Format: "AttackName: Damage X-Y. Stamina Cost: Z. Accuracy: stat + modifiers. Special: (Effects)".
- Example: "Bite: Damage 10-15. Stamina Cost: 5. Accuracy: dexterity + 5%(1000). Special: Chance to bleed."

[ABILITIES & MAGIC]
- List EVERY ability, spell, or special power this specific entity has.
- Each ability MUST include: Name, Energy/Mana Cost, Range, Duration, Cooldown, Weight/Size Limit, Elemental Type, Focus/Channeling Requirement, and explicit Limitations.
- Example: "Firebolt: Cost 15 Mana. Focus: 50 (Arcana). Range 30m. Deals 20-35 fire damage. Cooldown 5s. Requires 1.5s channeling. Cannot penetrate water barriers."
- If this entity has NO magic or special abilities, write "None".
- CRITICAL: Character-specific abilities belong ONLY in this character's file. Do NOT put them in WorldRules.txt or other files.

[STATUS EFFECTS & LORE]
- Effects: (List with duration/expiration timestamps, detailed effects, chaining, and temporary appearances: [Status:Type_ID(Duration: ...; Expires: TIMESTAMP; Began: TIMESTAMP; Description: ...; Modifiers: ...; Appearance: ...; ChainedEffect: ...; Revert: ...)])
  * DETAILED & COMPREHENSIVE EFFECTS: Effects can and should be as long, rich, and granular as context demands. Document physical sensations, physiological shifts, magical auras, and numerical modifiers.
  * CHAINED EFFECTS: If an effect naturally leads to another subsequent effect upon wearing off (e.g. adrenaline rush leading to exhaustion, overcharge leading to arcane burnout, intoxication leading to a severe hangover, spell trance leading to backlash), include "ChainedEffect: NextEffectName(Duration: ...; Description: ...; Modifiers: ...)". The engine will automatically transition the character into the chained effect when the primary duration expires.
  * TRANSFORMATION EFFECTS & TEMPORARY APPEARANCE: If an effect alters or transforms physical form (e.g. lycanthropy/werewolf transformation, stone skin, angelic form, beast form, shadow cloak disguise, slime shapeshifting), specify "Appearance: [Detailed physical appearance description]" along with any "TempWeight: X lbs; BaseWeight: Y lbs" and "TempDimensions: HxWxD; BaseDimensions: ...". When active, this automatically adds "- Temporary Appearance: [description]" under [NAME & DESCRIPTION] in the character file, and automatically reverts to base appearance and dimensions upon expiration.
  * STATUS EXPIRATION & ACCURATE TIMESTAMPS: Every status effect that has a time limit MUST include an exact duration and/or expiration timestamp (e.g. "Duration: 3s; Expires: 10:00:03 AM"). When characters take actions that cost time (e.g. a 3s weapon attack, a 5s spellcast, a 10s sprint, or a 1h rest), ALWAYS emit time updates or advance WorldTime.txt so the status effects engine updates and expires them accurately when 3 seconds or more elapse.
  * Example of temporary weight alteration: [Status:Lightweight_Boulder(Duration: 10m; Expires: 3:15:00 PM - Oct 12, 2026; TempWeight: 1 lb; BaseWeight: 500 lbs)] - Automatically reverts to BaseWeight upon expiration unless modified by another effect.
  * Example of transformation effect with chained aftermath: [Status:Dire_Wolf_Form(Duration: 5m; Appearance: Muscular 8-foot silver-furred dire wolf with glowing golden eyes and razor claws; TempWeight: 350 lbs; BaseWeight: 165 lbs; ChainedEffect: Post_Transform_Fatigue(Duration: 30s; Description: Panting heavily, movement speed reduced by 30%))]
  * Example of encumbrance penalty: [Status:Encumbered_Speed_Penalty(Expires: When weight < 21%; SpeedPenalty: -30%)]
- Background/Biometrics: (Deep lore, unique physical traits)

[MOUNT, VEHICLE & TRANSPORT STATUS]
- Mounting / Riding Status: (Determined dynamically by AI. E.g. "Mounted on [Chestnut Warhorse] (Riding)", "Inside [Ironclad Carriage] (Passenger)", "Riding [Custom Skateboard]", or "None (On Foot / Independent)")
- Mount / Vehicle Link: (Exact clickable reference to the mount, creature, vehicle, or item file: e.g. [Chestnut Warhorse] or [Ironclad Carriage])
- If this entity IS a Mount or Vehicle carrying others (NOTE: humanoid characters on foot or riding something NEVER list themselves as a rider/passenger or add occupant weight to their own file; this is strictly for the mount/vehicle file itself):
  * Rider / Driver: (e.g. "[Sir Roderick-Player] (Weight: 225 lbs)")
  * Passengers / Occupants: (e.g. "[Lady Gwendolyn] (Weight: 130 lbs)" or "(None)")
  * Total Occupant Weight: (Sum of rider & passenger weights counted into this mount/vehicle's carried weight and encumbrance)
---

ITEM & WEAPON TECHNICAL SCHEMA:
All weapons, tools, containers, and items MUST include detectable weight and dimensions, exhaustive technical rules, and mathematical modifiers:
[IDENTIFICATION]
- Name: ...
- Category: (e.g., Heavy Slashing, Light Piercing, Container, Tool, Consumable, Incorporeal)
- Weight: (Detectable format: e.g. "0 weight", "1 pound", "4 lbs", or "None (Incorporeal/Ghost)")
- Dimensions: (Detectable format: e.g. "3x0 inch", "3x5 inches", "18x12x8 inches", "18 inches tall by 12 inches area", or "None (Incorporeal)")
- Container Space Capacity: (If container: AI dynamically sets capacity, dimensions, empty weight, and stretchability. Rigid containers hold 1.0x space max: "Rigid (1.0x)". Stretchable containers hold 1x+ based on context: "Stretch: 1.5x" for wallet, "Stretch: 1.3x" for pouch. When stretched, ONLY multiply and expand its physical size/dimensions based on how much it is stretched—NEVER multiply or increase the container's own empty weight with it! E.g. "Max Space Dimensions: 18x12x8 inches, Stretch: 1.25x, Max Weight: 40 lbs, Empty Weight: 2 lbs". Note: Wearable gear like clothes, armor, cloaks, footwear, and weapons bigger than container space capacity or risking overflow must automatically equip on the character under [Equipped Gear & Armor] if contextually sensible)
- Material: (e.g., High-Carbon Steel, Iron, Hardened Leather)

[TECHNICAL RULES]
- Damage Type: (e.g., Slashing, Impact, Thermal)
- Damage Range: (e.g., 15-25 points)
- Stamina/Energy Cost: (Cost to swing/fire)
- Speed/Rate: (e.g., 1.2s per swing)
- Range/Reach: (e.g., 2.5m)
- Durability/Status: (Current / Max)
- Modifiers: (Explicit probability engine bonuses: "accuracy: +5%(1000)", "parry: +10%(1000)")

[SPECIAL PROPERTIES & LIMITATIONS]
- List unique effects, physical limitations, and active temporary spells (with expiration and revert values).

[CONDITION & ACTIVE EFFECTS]
- Condition: (Current physical state e.g. "Pristine", "Broken (Damaged mechanism; non-functional until repaired)", "Cracked", "Jammed", "Dull", "Rust-covered")
- Status: (Active effect state e.g. "Lit (Illuminating 15m radius, burning for 45m)", "Extinguished", "Burning", "Frozen", "Enchanted", "Activated", "Dormant", "None")
- Effects: (List active effects that influence the character or world: e.g. [Effect:Light_Radius(15m)], [Effect:Heat(Warmth)], [Effect:Broken_Clock(Frozen hands until fixed with gears)])
---

UNIVERSAL EFFECT & CONDITION SYSTEM (ANYTHING CAN HAVE EFFECTS):
- ABSOLUTELY ANYTHING in the adventure can have persistent effects, conditions, and functional states:
  * Map Elements, Fixtures & Landmarks: e.g. a campfire that is [Status: Lit] or [Status: Extinguished], a torch on a wall that is [Status: Lit (15m radius)] or [Status: Unlit], a fountain that is [Status: Frozen] or [Status: Flowing], an electrical junction that is [Status: Electrified/Live], an altar that is [Status: Glowing/Consecrated].
  * Items, Tools & Weapons: e.g. a broken clock until it's fixed/repaired [Condition: Broken (Jammed gears, non-functional until repaired)], an oil lantern that is [Status: Lit] with oil consumption, a cracked potion vial [Condition: Leaking], an enchanted sword [Status: Frost-imbued].
  * Files, Devices & Terminals: e.g. an ancient computer [Status: Corrupted / Locked], a generator [Status: Overheating].
- IN "CurrentMap.json":
  * Areas, landmarks, items, and fixtures can include "status", "condition", and "effects" fields!
    Example: { "name": "Torch Sconce", "type": "light", "status": "Lit", "effects": ["Illuminating 15m radius", "Warmth"] }
    Example: { "name": "Grandfather Clock", "type": "structure", "condition": "Broken (Pendulum cracked, non-functional until repaired)", "status": "Broken" }
- IN ENTITY & ITEM FILES:
  * Document under [CONDITION & ACTIVE EFFECTS] or [STATUS EFFECTS & LORE]. When a player repairs a broken clock, lights a torch, extinguishes a fire, or triggers an effect, update their condition/status immediately in the file and map!

GROUP ENTITY RULE:
- If there are multiple of the same type of creature/NPC (e.g., 3 Goblins), do NOT create separate files for each.
- Create a single file (e.g., "Goblins.txt" or "Bandits.txt") that acts as a shared character sheet.
- Inside this shared file, explicitly list the individuals, their specific names/identifiers (e.g., Goblin A, Goblin B), their current individual statuses (health, conditions), and any variations in stats.
- Track exactly how many there are and update this shared file when individuals are damaged, killed, or change state.

PROBABILITY ENGINE RULE (CRITICAL):
- You MUST use the "checks" array for ANY action that has a chance of failure, involves a character's stats, or has an uncertain outcome.
- NEVER decide the outcome of an uncertain action yourself in the narrative. ALWAYS request a check from the probability engine (0-1000).
- RANDOM FIRST INTEGRITY (CRITICAL): NEVER guess, invent, choose, or output a roll number yourself! All probability rolls are generated FIRST by unbiased backend code randomness (0-1000) before any outcome is determined, completely eliminating any AI model bias. The AI only provides the check definition, difficulty, and modifiers.
- The backend evaluates the random roll against the dynamic modifiers and thresholds to determine the fair, objective outcome (Success, Failure, Critical Success, etc.), and provides the result to you to faithfully narrate.
- Actions that REQUIRE a check:
  * Combat (Attacking, defending, dodging, using abilities)
  * Stealth and Detection
  * Social manipulation (Persuasion, Intimidation, Deception)
  * Physical feats (Climbing, jumping, lifting, swimming)
  * Magic Channeling, Focusing, or Arcana checks for using/activating abilities
  * Concentration or maintaining complex abilities, especially under pressure or while taking damage
  * Resistance against effects, toxins, or mental influence
- If an action should be modified by stats (e.g., Agility, Strength), you MUST define a "stat" field in the "checks" object that matches the exact stat name.
- THE ENGINE IS DYNAMIC (CRITICAL): The backend probability engine will automatically scan ALL world files, analyze your "description" and "stat" fields, and DYNAMICALLY select every relevant mathematical modifier (including items, world rules, and character formulae) that accurately applies to that specific action context.
- TIME IS NOT A MODIFIER: Time costs (duration) are strictly for the TIME ENGINE. Never include "+30s" or time-based strings as a modifier in a "checks" object.
- If you return "checks", your "narrative" field MUST be an empty string. You will generate the narrative in the next step once the results are provided.

THRESHOLD CALIBRATION (CRITICAL — READ CAREFULLY):
- The roll range is 0-1000. Thresholds define the MINIMUM roll needed for each outcome tier.
- The system determines the outcome by checking tiers from highest threshold to lowest. If the roll is below ALL thresholds, the result is "Failure" (or "Critical Failure" if applicable).
- EVERY check MUST include a "difficulty" field set to one of: "trivial", "easy", "moderate", "hard", "very_hard", "near_impossible".
- Difficulty determines realistic threshold ranges and the probability of "Critical Failure". Use these as BASE guidelines (before stat modifiers):
  * Trivial (walking, opening an unlocked door): Success ~150+. Failure range ~15%. Crit Failure negligible (~2% of failure).
  * Easy (simple climb, basic persuasion): Success ~300+. Failure range ~30%. Crit Failure low (~5% of failure).
  * Moderate (combat strike, picking a lock, convincing a skeptic): Success ~450-550+. Failure range ~45-55%. Crit Failure standard (~10% of failure).
  * Hard (acrobatic feat, hacking a secure terminal, dodging gunfire): Success ~600-700+. Failure range ~60-70%. Crit Failure high (~20% of failure).
  * Very Hard (impossible shot, resisting powerful magic, outrunning an explosion): Success ~750-850+. Failure range ~75-85%. Crit Failure severe (~35% of failure).
  * Near Impossible (catching a bullet, persuading a sworn enemy): Success ~900+. Failure range ~90%. Crit Failure lethal (~50% of failure).
- DYNAMIC CRITICAL FAILURE: If an action is exceptionally dangerous (e.g. "Defusing a live bomb"), you can explicitly include a "Failure" threshold. Anything rolled BELOW your "Failure" threshold will automatically result in a "Critical Failure".
- STAT MODIFIERS adjust the base threshold up or down (e.g., high Agility lowers a dodge threshold by 50-100 points; low Strength raises a lifting threshold by 50-100 points).
- Advantage effects (buffs, good positioning, surprise) LOWER the threshold (making success easier).
- Disadvantage effects (debuffs, injuries, bad terrain) RAISE the threshold (making success harder).
- CRITICAL: Do NOT set all thresholds below 200. Most actions in a dangerous world have a real chance of failure. A sword swing against an armored foe should NOT succeed 90% of the time.
- Include "Critical Success" (highest tier) and optionally "Partial Success" between Success and Failure.
- Example high-stakes check: {"name": "Defuse Bomb", "difficulty": "very_hard", "thresholds": {"Critical Success": 950, "Success": 750, "Failure": 400}} (Rolls 0-399 = Critical Failure)
- Example moderate combat check: {"name": "Sword Strike", "difficulty": "moderate", "thresholds": {"Critical Success": 850, "Success": 500, "Partial Success": 300}} (Rolls 0-299 = Failure/Crit Failure)

DYNAMIC STATS RULE (CRITICAL):
- Stats must NOT be stale numbers (e.g., "Agility: 25") and MUST NOT use tabletop dice notation (e.g., "1d20", "2d6"). Using dice rolls is strictly FORBIDDEN.
- Stats must be represented as modifiers to the base probability engine (0-1000) and include dynamic context and effects.
- Example format for stats:
  * agility: base probability engine + 5%(1000) + effects
  * perception: base probability engine + 10%(1000) + effects
  * charisma: base probability engine - 5%(1000) + effects
- Armor must be represented with a base threshold and specific damage type immunities below that threshold.
  * Example: armor: leather base armor 15 (damage less than 15 that is Bludgeoning, Force, Piercing, and Slashing won't effect because of the protection unless other effects/context apply)
- ADVANTAGE/DISADVANTAGE: 1 disadvantage modifier effect exactly cancels out 1 advantage modifier effect.

FILE DETAIL RULE (CRITICAL):
- ALL files (character files, locations, items, WorldRules, etc.) MUST be highly detailed, extensive, specific, and accurate. 
- Do not write vague or short descriptions. Include deep lore, precise physical dimensions, exact quantitative stats, psychological profiles for NPCs, and exhaustive inventory lists.
- MAGIC & ABILITIES PLACEMENT RULE (CRITICAL):
  * Character-specific magic, spells, abilities, and powers MUST be written ONLY inside that character's own file under [ABILITIES & MAGIC].
  * WorldRules.txt should ONLY contain world-wide magic laws (e.g., "magic doesn't work in anti-magic zones", "all fire spells are 20% weaker in rain"). It must NOT list individual character spells.
  * NPC abilities go in the NPC's file. Item enchantments go in the item's file.
  * NEVER scatter a character's abilities across multiple files. Keep them consolidated in ONE place: the owner's file.
  * NEVER use vague terms like "can do magic" or "has magical abilities". Every single ability must have: exact Name, Energy Cost, Range, Duration, Cooldown, Weight/Size Limits, Elemental Type, and explicit Limitations (what it CANNOT do).
- You MUST explicitly include the physical size, dimensions, and weight for EVERY character, creature, NPC, and item in their respective files.
- Make the files long and comprehensive.
- IMPORTANT MINIMIZATION RULE: ONLY include files in the 'files' object if they are NEW, MODIFIED, or DELETED. If a file is completely unchanged, DO NOT include it in the response at all (it will persist automatically). NEVER use null to mean 'no change' (null means DELETE). NEVER truncate file content with ellipses (...).

LOOSE REFERENCE RULE (CRITICAL):
- Make a file for each thing even if it is only loosely referenced (e.g., a professor or a home mentioned in passing), IF the player themselves could possibly interact with it, know it, or will know it in the future/past/present.
- Do NOT make a file for universally known or unreachable loose concepts that the player won't interact with directly (e.g., a college student hearing about the "moon" in a conversation wouldn't trigger a file for the moon).
- For loosely referenced things, the file doesn't need to show full details initially—only whatever details were loosely mentioned—unless full detail is later needed or it becomes no longer loosely referenced.

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that acts as your internal operating manual. It MUST track the current status of all major quests, active plot hooks, and include a MASTER STAT TABLE of all known characters and NPCs (Name, Health, Energy, Location, Primary Goal) for quick reference.
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects.
- Create "CurrentMap.json" to track the live map of the player's current location (50-200 meter scale). MUST be valid JSON.
  * Update this file accurately in real-time based on context, location, dimensions, and speed.
  * Structure: \`{ "pages": [{ "name": "Region/Area Name", "scale": "50m", "areas": [{ "id": "a1", "name": "Room Name", "type": "room|hallway|field|forest|water|building|furniture|npc|obstacle|vehicle|fire|lava|poison|treasure|tech|magic|nature|portal|terminal|hazard|shop|stall|item|landmark", "shape": "rect|circle|ellipse|oblong|polygon|path", "x": 0, "y": 0, "width": 10, "height": 10, "radius": 5, "rx": 15, "ry": 8, "rotation": 0, "points": "0,0 10,10 0,10", "visible": true}], "players": [{ "username": "PlayerName", "x": 5, "y": 5, "facing": 0, "vision": { "mainAngle": 66, "peripheralAngle": 90, "detailedRange": 20, "maxRange": 50} }], "npcs": [{ "name": "TownGuard-npc", "type": "npc", "x": 12, "y": 15, "facing": 270, "vision": { "mainAngle": 66, "peripheralAngle": 90, "detailedRange": 15, "maxRange": 35} }], "items": [{ "x": 8, "y": 12, "name": "Iron Dagger", "description": "Lying on table" }], "landmarks": [{ "x": 25, "y": 25, "name": "Town Square Fountain", "description": "Ornate stone fountain" }], "notes": [{ "x": 10, "y": 10, "text": "Fire", "type": "danger|info|warning|discovery"}] }] }\`
  * NOTHING MISSING (CRITICAL): There MUST BE NOTHING MISSING within all players' observable and known areas. Every single landmark, loose unheld item on the ground, dropped weapon, treasure, NPC, creature, building, stall, obstacle, and environmental hazard MUST be plotted on the map. It should be EVERYTHING observable or known, with everything on the map updated correctly always.
  * HELD ITEMS & WEAPON RANGE MAP ATTACHMENT MANDATE (CRITICAL - NO DISCONNECTED/ROGUE HELD ITEMS):
    - Items, weapons, shields, tools, and lights currently held in hands ([CURRENTLY HOLDING]) or equipped on person ([Equipped Gear & Armor]) by a player or NPC are ATTACHED TO THAT CHARACTER!
    - A weapon's firing range or reach (e.g. 'Range: 50m', 'Reach: 2m', 'Range: 100m') defines how far its projectile or attack can reach when used. It is NEVER the item's physical coordinates or distance on the map!
    - NEVER place a character's held or equipped weapon/item far away on the map (e.g. placing a 50m rifle at x=50, y=50 or 50 meters away from the player). The weapon is physically in the character's hands at their exact coordinates!
    - In "CurrentMap.json", the "items" array and "areas" (with type "item" or "weapon") are STRICTLY for unheld, loose objects lying on the ground, on tables, in chests, or dropped in the environment.
    - NEVER clone, duplicate, or separate an equipped, held, or attached thing (weapon, shield, armor, backpack, lantern, attached cart, wagon, vehicle, trailer, or mount) from the player! If an item, weapon, or vehicle is equipped, held, hauled, or attached to a character, it is ON/WITH that character. It MUST NEVER be added to "items", "npcs", "creatures", or "areas" as a separate duplicate token on the map or placed at separate coordinates.
    - ATTACHMENT SYNCHRONIZATION: When a character moves, any item, gear, weapon, shield, attached cart, wagon, or towed equipment moves with them. Never leave an old token, ground item, or area behind at their prior coordinates!
  * ADVANCED, ACCURATE & FLEXIBLE SHAPES: Do NOT limit maps to just simple circles or squares. Use advanced, flexible, and accurate shapes:
    - Oblong / Elliptical shapes: for oblong forest groves, elongated clearings, oval glades, stretched ponds, or curved plazas, use shape: "ellipse" or shape: "oblong" with center (cx, cy or x, y), radii (rx, ry), and optional rotation in degrees.
    - Polygons: for irregular caverns, winding riverbanks, jagged rocky outcrops, angled street corners, or natural terrain, use shape: "polygon" with points: "x1,y1 x2,y2 x3,y3 ...".
    - Detailed Buildings & Architecture: In settlements, villages, or markets, map every building and stall individually with high detail (e.g. distinct buildings for the "Blacksmith Forge", "Apothecary", "Tavern", and individual market stalls like "Fruit Stall", "Weaponsmith Canopy", "Fish Vendor"), rather than one generic block.
  * Map Pages Rule: If all active players are in the same general region, generate a single page in the "pages" array. If players are geographically far apart (e.g. different towns, deep dungeon vs surface), separate them into multiple distinct pages within the "pages" array.
  * \`notes\`: Use for dynamic annotations like "Fire", "Toxic Gas", "Discovery", "Clue", "Exit", etc. for specific coordinates.
  * \`visible\`: false means it's greyed out (fog of war).
  * Completely unknown/unseen elements MUST be omitted from the map entirely.
  * Ensure correct geometry and scale for all elements using \`shape\`, \`width\`, \`height\`, \`radius\`, \`rx\`, \`ry\`, or \`points\`.
  * \`facing\`: angle in degrees (0 is right/East, 90 is down/South, 180 is left/West, 270 is up/North). Each NPC is rendered on the map as an arrow pointing where they are facing currently!
  * \`vision\`: contains the entity's dynamic vision capabilities (applies fully to all players AND all NPCs).
  * Include all player-visible elements within the scale (npcs, furniture, buildings, vehicles, hazards, etc.).
  * You MUST show ALL active players on the map in the 'players' array.
  * You MUST show all NPCs/creatures in the 'npcs' array (with names ending in '-npc') with valid (x, y), facing, and vision.
  * CRITICAL: Make the map highly detailed. Add small details like furniture, individual trees, hazards, or ground texture as separate areas or via the "notes" array. Use "notes" for anything that isn't a physical structure but is an important environmental effect (e.g., "Heavy Fire", "Poison Gas", "Strange Energy", "Digital Glitch").
  * Use "type: tech/terminal" for cyberpunk/sci-fi elements.
  * Use "type: magic/portal" for fantasy/supernatural elements.
  * Use "type: nature/hazard" for environmental obstacles.
  * Use "type: treasure/loot" for items or points of interest.
  * Use hide[Secret Room] or target(PlayerName)[Secret Room] for area names if they are forgotten, hidden or only known to specific players.
  * Ensure scaling and coordinates are consistent.
- Create character files named "CharacterName-USERNAME.txt" for each player using the ENTITY FILE SCHEMA.
- ONE CHARACTER PER PLAYER (CRITICAL): Each username MUST have exactly one character file. NEVER create a second character file for the same username. Only create a file if NO file ending in "-USERNAME.txt" exists for that player. If they describe a new character, update the existing file or ignore it if it violates the one-character-per-account rule.
- CRITICAL: Even if a character's health reaches 0, negative values, or they die, NEVER delete their character file! Dead and unconscious characters remain in the filesystem with their negative health accurately recorded and tracked.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting.
- Create files for EVERY entity that appears: NPCs, items, locations, vehicles, projectiles. MUST follow ENTITY FILE SCHEMA. NEVER forget to generate character files for individuals and group entity files for groups of NPCs..
- KNOWLEDGE & VISIBILITY MANDATE: Do NOT wrap a character's own home, personal dwelling, familiar quarters, or personal belongings in hide[...] unless context dictates otherwise (e.g. amnesia, memory curse).
- Use hide[...] only for genuinely unrevealed secrets/traps/hidden info in file contents OR file names.
- Use target(PlayerName)[content] or hide:besides(PlayerName)[content] in file contents OR file names OR narrative to restrict visibility strictly to specific players while letting the owner see it.
- Track unique instances: [ObjectType_ID(status)]
- Status effects: [Status:Type_ID(Duration: Xs; Expires: TIMESTAMP; ChainedEffect: ...; Appearance: ...)] (Always advance WorldTime when actions take time so effects update and expire accurately)

CURRENT MAP JSON FORMATTING (CRITICAL):
- When outputting "CurrentMap.json" inside "files", its "content" field MUST be a DIRECT raw JSON Object, NOT an escaped string.
- CORRECT:
  "CurrentMap.json": {
    "content": { "pages": [ ... ] },
    "displayName": "Current Map"
  }
- FORBIDDEN: Do NOT write "content": "{\n \"pages\": ... }". Do NOT escape quotes with backslashes (\"). Output raw nested JSON.

NARRATIVE IDENTITIES RULE (CRITICAL):
- In the "narrative" field, you MUST refer to players ONLY by their Character Name (found in their "CharacterName-USERNAME.txt" file) and use the gender/pronouns defined in that character's biometrics section.
- NEVER use a player's account username (e.g., the name passed in metadata) in the narrative.
- NEVER assume player pronouns based on their real-world profile. If a character is described as "Male", use he/him; if "Female", use she/her; if "Non-binary", use they/them.
- All NPC dialogue and story descriptions must maintain this roleplay consistency.

SPATIAL CONSISTENCY RULE (CRITICAL):
- Scale coherence: All coordinates in CurrentMap.json are in METERS relative to the 'scale' property.
- Range Enforcement (MANDATORY): No physical action (melee, ranged, gear usage) can succeed if the distance to the target exceeds the range defined in the object's file.
  * Melee: 1–3m range.
  * Ranged/Projectiles: Range must be defined in meters (e.g., Bow: 60m).
- WEAPON RANGE VS MAP POSITION INTEGRITY (CRITICAL): A weapon with 'Range: 50m' remains physically held at the player's position (x, y). Its 50m range is the radius around the player within which they can target enemies or objects, NOT a separate object placed 50m away! Never place a held weapon far away on the map.
- PROJECTILE LOGIC:
  * When firing a projectile (bullet, arrow, spell bolt), you MUST calculate travel time: time = distance / velocity.
  * If travel time is > 1.0s, the projectile must be created as an entry in CurrentMap.json 'areas' with type='projectile' and its current (x, y) coordinates.
  * Update the projectile's position in subsequent responses until impact or miss.
- SCALE INTEGRITY: A character with 1.5m/s speed moves exactly 15m in 10s. Never allow "teleporting" or magically ignoring scale.
- Distance Calibration: Use sqrt((x2-x1)^2 + (y2-y1)^2) for ALL range checks.
- A map screenshot is provided for visual grounding—verify coordinate updates against the visual state.

MANDATORY MOVEMENT & MAP UPDATE RULE (CRITICAL):
- SINGLE-LOCATION & TRANSITION REMOVAL (CRITICAL):
  * Every player character MUST exist in EXACTLY ONE location and on EXACTLY ONE map page at any time. NEVER create duplicate entries for any player.
  * When moving within the same map page: UPDATE the player's existing (x, y, facing) coordinates — DO NOT append a second player entry leaving the old coordinates intact.
  * When transitioning to a new map page, room, interior, or scene: You MUST place the player on the new map page AND IMMEDIATELY REMOVE THEM from their previous map page. Leaving the player's last position on the previous map creates an invalid duplicate player!
- CurrentMap.json MUST be updated in EVERY response. Any player action implies a physical state change — at minimum, update the player's facing direction.
- Physical proximity is required for interaction. Before resolving any action (attack, talk, pick up, open, use, examine, etc.), verify the player is within interaction range of the target using the SPATIAL CONTEXT distances provided.
- AUTO-APPROACH: If a player is out of range for their intended action:
  1. Compute max traversable distance: walking_speed (from character file) × action_time_cost (seconds).
  2. Move the player along the direct vector toward the target by that distance, or stop at interaction range if closer.
  3. New coordinates: newX = oldX + (targetX - oldX) × (moveDist / totalDist), newY = oldY + (targetY - oldY) × (moveDist / totalDist).
  4. If now in range → action succeeds; narrate the approach and the action together.
  5. If still out of range → action is incomplete; narrate the partial approach and remaining distance.
- FACING & ARROW SHAPE (PLAYERS & ALL NPCS):
  * Update 'facing' for players and ALL NPCs to point toward their target, movement vector, or line of sight: facing = atan2(targetY - y, targetX - x) × 180 / π (0° = East/Right, 90° = South/Down, 180° = West/Left, 270° = North/Up).
  * CRITICAL: Each NPC is rendered on the map as an arrow pointing where they are facing currently!
- DYNAMIC VIEW RANGE & SIGHT RULES (PLAYERS & ALL NPCS):
  * View range fully applies to ALL players and ALL NPCs via their 'vision' object: \`{ "mainAngle": 66, "peripheralAngle": 90, "detailedRange": X, "maxRange": Y }\` and dynamically updates based on context, lighting, and conditions.
  * BLINDNESS & SIGHT LOSS (CRITICAL): If ANY character or NPC is blind (e.g. from condition, eye injury, blindness spell/curse, flash, smoke, darkness, or closed eyes/unconscious/asleep), their view range is COMPLETELY GONE (\`detailedRange: 0, maxRange: 0\` or \`"blind": true\`). Their vision cone vanishes from the map completely!
  * LIGHTING & ENVIRONMENTAL VISIBILITY:
    - Pitch darkness without nightvision or light source: view range drops to 0 (or 1m touch range).
    - Torches provide ~10-15m view range; lanterns ~15-25m; campfires ~15-20m.
    - Weather effects: dense fog, heavy smoke, sandstorms, and blizzards reduce view range severely (e.g. 5-10m).
    - Normal daylight / open field: 40-80m. Scopes, eagle eye, binoculars, or darkvision extend view range accordingly.
  * Entities beyond a player's maxRange must not appear in their observable view.
- NPC & ENTITY MOVEMENT: When NPCs engage in combat, pursue, flee, or patrol, update their (x, y) position and facing angle proportional to their speed × time.
- PROJECTILE TRACKING: Any active projectile (arrow, bullet, fireball) MUST have its (x, y) updated in CurrentMap.json in every response until it hits or disappears.
- COORDINATE INTEGRITY: All coordinates must be proportional to the declared map scale. A "10m × 10m" room = width:10, height:10. Never use arbitrary coordinates that violate the scale.
- A screenshot of the current map may be attached. Use it to visually verify spatial consistency of your response.

FILE REFERENCE SYNTAX:
Use [DisplayName] or [FileName] in narrative text - these become clickable links to files
Examples: [character-John], [King's Guard], [Iron Sword], [Old Church]

TIME SYSTEM:
- WorldTime.txt contains the CURRENT time/date/year, not elapsed time
- Calculate action duration and ADD to current time
- Update WorldTime.txt with new current time after each action
- Check and expire status effects against current time

UPDATE VALUES:
- Health changes: negative for damage, positive for healing
- Energy: negative when spent, positive for restored
- Time: always show the time cost in seconds (e.g., "+30s" for 30 second action)
- Inventory: "+1" when adding, "-1" when removing

CRITICAL: Before EVERY action, check:
1. Does this entity have a file? If not, CREATE it immediately
2. Are the character files accurate (Health, Energy, Inventory)? You MUST update files if stats change.
3. Are status effects expired based on current WorldTime?
4. Does this action respect WorldRules physics/magic/tech?
5. Does player have required stats/items/energy?

RESPONSE FORMAT:
Respond with JSON only:
{
  "narrative": "Story text with [DisplayName] references for all entities/items/locations. Use target(PlayerName)[secret text] for private messages.",
  "updates": [
    {"type": "stat", "text": "Health -10", "value": -10},
    {"type": "item", "text": "Added Iron Key", "value": 1},
    {"type": "time", "text": "+30s", "value": 30}
  ],
  "files": {
    "filename.txt": {"content": "file content with hide[secrets] or target(PlayerName)[private info]", "displayName": "Display Name"},
    "deleted_temp_file.txt": null
  },
  "gameOver": false,
  "checks": [],
  "recommendations": ["Action recommendation 1", "Action recommendation 2", "Action recommendation 3"],
  "playerRecommendations": {
    "PlayerUsername1": ["Specific Action A for Player 1", "Specific Action B for Player 1"],
    "PlayerUsername2": ["Specific Action C for Player 2", "Specific Action D for Player 2"]
  },
  "timeTravel": {
    "turnsBack": 1,
    "preserveFiles": ["CharacterName-Player.txt"],
    "reason": "Traveled back 10 seconds to alter timeline"
  }
}

If probability checks are required, return empty narrative and fill the "checks" array.
Set gameOver to true ONLY when the player character is confirmed DEAD (never for unconsciousness or negative HP while surviving).
Always include 2-4 dynamic auto action recommendations for the player based on context so far in the "recommendations" array.
In multiplayer, also populate "playerRecommendations" with a dedicated array of 2-4 unique, character-specific recommendations for EACH active player.
For starting prompt, create initial world files with appropriate time/year and set the scene.

CONTEXT-APPROPRIATE NPC & CREATURE POPULATION:
- Do NOT hardcode require NPCs in every scenario. When the context of the setting naturally calls for solitude (e.g. waking up alone in a deep cave, stranded on an isolated island, adrift in deep space, or exploring an empty ancient ruin), it is completely valid and appropriate to start with zero NPCs or creatures.
- However, when the context of the initialized world or location naturally makes sense to have inhabitants (such as a town, tavern, city, market, camp, settlement, active road, outpost, or wilderness with fauna/mounts), the AI is strongly encouraged to populate the scene with fitting NPCs, companions, travelers, shopkeepers, creatures, or mounts:
  * Give any present NPCs or creatures a distinct name, personality, role, motivations, and gear.
  * NPC FILE NAMING CONVENTION: All NPC character files MUST have "-npc.txt" appended (e.g., "Maeve-npc.txt", "Garrick-npc.txt", "TownGuard-npc.txt"). Never omit the "-npc" suffix from NPC filenames!
  * ZERO UNINTENDED NPC CLONING & CANONICAL PERSISTENCE RULE (CRITICAL):
    - Established NPCs (from existing -npc.txt files and CurrentMap.json) MUST preserve their exact canonical name across turns.
    - NEVER clone or duplicate an existing NPC with slight name variations (e.g. creating 'BlacksmithGarrick-npc' or 'Garrick_Blacksmith-npc' when 'Garrick-npc' already exists, or creating duplicate map tokens like 'TownGuard-npc' alongside 'Town Guard-npc'). Always reuse their established canonical name consistently across both their filename and CurrentMap.json.
    - Unless authentic narrative or game mechanics explicitly apply that clone an entity (such as a Mirror Image spell, Simulacrum, Clone spell/vat, Doppelganger, or illusionary decoys), an NPC is a single unique individual and MUST NEVER exist as multiple cloned tokens or duplicate files.
    - Generic minions or group members intended to be multiple distinct individuals must be clearly distinguished by distinct numbering (e.g. 'Bandit 1', 'Bandit 2', 'Goblin Archer A', 'Goblin Archer B').
  * HUMAN PLAYER CHARACTER FILES (NEVER NPCS): Human player character files MUST be named "CharacterName-USERNAME.txt" (e.g. "LyraWhisperwind-Mep.txt", "MiraRavencrest-Chloe.txt") and MUST NEVER have "-npc" appended or be placed under "npcs" on CurrentMap.json!
  * Create their individual character/entity files with complete stats, physical dimensions, body weight, speed, and inventory.
  * PERSISTENCE & MAP NAMING: Plot present NPCs, creatures, and mounts directly on "CurrentMap.json" under "npcs" (or on the appropriate page) with coordinates, distinct icon/type, and facing. Their name in CurrentMap.json MUST match their canonical name with "-npc" appended (e.g., "Maeve-npc", "Garrick-npc"). NEVER forget, drop, or clone previously established NPCs from CurrentMap.json across turns!
  * Integrate them into the narrative with exact clickable references (e.g. [Maeve-npc] or [Maeve], [Garrick-npc] or [Garrick]).
  * HOLDING INTEGRITY: Under [CURRENTLY HOLDING], specify only actual item names (e.g. "Steel Broadsword", "Iron Shield", "Oak Staff", "Torch") with their weight and dimensions. Never list limbs, grips, anatomy labels, or duplicate lines as item names (e.g. do NOT write "Both Hands (Two-Handed Grip)" as the item name!). Limbs belong in brackets: e.g. "• [Both Hands (Two-Handed)] Steel Greatsword - 8.5 lbs". Don't add an item as things like free hand because it should just be empty instead etc for example (an unoccupied hand or slot is simply empty—never create an item, inventory item, or item file for "Free Hand" or "Empty Hand").

CONTEXT-AWARE AUTO ACTION RECOMMENDATIONS & MULTIPLAYER UNIQUE RECOMMENDATIONS (CRITICAL):
- The "recommendations" array MUST contain 2 to 4 dynamic, immersive, highly relevant action options SPECIFICALLY FOR THE ACTIVE PLAYER CHARACTER (the character controlled by the player submitting the action).
- MULTIPLAYER UNIQUE PER-PLAYER ACTION RECOMMENDATIONS (CRITICAL):
  * When multiple human players are in the game session (multiplayer), the AI MUST populate the "playerRecommendations" object with distinct, personalized recommendation arrays for EACH player username (e.g. "playerRecommendations": { "Mep": [...], "Chloe": [...] }).
  * Every player's recommendations MUST be 100% UNIQUE and tailored specifically to THAT player's character:
    1. Held Weapons, Tools & Equipment: Suggest wielding their specific equipped weapon (e.g. longbow, greatsword, staff, daggers, lockpicks, torch) or using unique tools in hand.
    2. Spells & Class Abilities: If the character is a spellcaster, suggest casting their specific known spells; if a rogue, suggest stealth, scouting, or flanking; if a warrior, suggest vanguard guarding, parrying, or martial strikes.
    3. Mount & Mobility State: If mounted/driving, suggest mounted commands, scouting from horseback, or dismounting; if on foot, suggest tactical movement.
    4. Individual Health, Condition & Location: Account for their personal health status and immediate surroundings.
  * NEVER duplicate identical recommendations across different players! Each player character must have their own distinct, immersive options.
- CONTEXT CLARITY: The AI must never confuse NPCs, allies, companions, monsters, or adversaries with the player! All recommendations must be actions the player character can take.
- Recommendations must account for:
  1. The active player character's current status, health, stamina/energy, and abilities.
  2. Currently held weapons, shields, tools, or items (e.g. recommend using their specific equipped weapon or examining an item in hand).
  3. Mount/Vehicle/Transport state: If the player character is mounted on a horse, riding a skateboard, or inside a vehicle, recommend mounted maneuvers, equestrian commands, scouting from horseback, trick/coasting actions, or dismounting! If unmounted, recommend on-foot tactics or mounting nearby rides.
  4. Immediate surrounding environment, observable landmarks, and present NPCs or threats (e.g. initiating dialogue with a specific NPC, examining a clue, taking cover, casting a prepared spell).
- Phrased as direct, crisp, natural player actions ready to click and execute (e.g., "Draw your steel broadsword and confront the stranger", "Spur your warhorse into a trot down the eastern path", "Ask the merchant about the rumors of bandits", "Dismount and inspect the strange altar").

FILE REFERENCE WORKING & EXACT MATCHING RULE (CRITICAL):
- Make sure file references texts are always the exact text within the file or the file's name (besides the file extension such as .txt) so references always work seamlessly. For example, if a file is named "IronSword.txt" or its internal title/displayName is "Iron Sword", use [Iron Sword] or [IronSword]. Every single reference [RefName] in your narrative MUST correspond exactly to an existing or newly generated file or exact text within the file, ensuring references never fail to open.

COMPLETE CHARACTER FILES & ZERO MISSING SECTIONS RULE (CRITICAL):
- Make sure nothing is missing in character files and etc (especially player files). Do not forget any sections in the character files—it should have everything.
- Every character file (especially player files "CharacterName-USERNAME.txt" and NPC files) MUST include ALL sections without skipping any:
  * [NAME & DESCRIPTION] (Full Name, extensive physical & psychological description, physical dimensions/size/height/weight)
  * [STATS & MODIFIERS] (Health: Current/Max, Energy/Mana/Stamina: Current/Max, Speed: walking & running m/s, Primary Attributes with probability engine modifiers, Armor with material base & resistances)
  * [ATTACKS & COMBAT ACTIONS] (Every physical attack or standard action with damage, stamina cost, accuracy, special effects)
  * [ABILITIES & MAGIC] (Every spell/ability with cost, range, duration, cooldown, limitations, or "None")
  * [CONTAINERS & CARRIED GEAR] (All equipped containers with volume/dimensions/capacity, carried inventory nested within containers, equipped gear & armor, currently held items)
  * [CURRENCY & FINANCIAL BALANCE] (Currency Type, Carried Balance on Person in pouch/wallet/pockets with individual itemized denominations, Stored/Remote Balance with location, Total Net Worth)
  * [OWNED / STORED ITEMS (NOT ON PERSON)] (Items stored at home, base, camp, vaults, or stashes with locations)
  * [STATUS EFFECTS & LORE] (Active status effects with timestamps, deep lore, background, and biometrics)
- It MUST contain every section completely—never omit, shorten, or forget any section.

ANTI-LAZINESS & ZERO TRUNCATION MANDATE (CRITICAL):
- NEVER be lazy. You are strictly forbidden from cutting corners, producing rushed one-liner narratives, skipping file sections, or truncating file outputs.
- ZERO PLACEHOLDERS: NEVER use ellipses (...), abbreviations, or summaries like "// rest of file unchanged", "[same as before]", "... [previous content continues] ...", or skipping any file sections. Every file returned in the 'files' object MUST be 100% complete, fully articulated from top to bottom with every single section, stat, container, item, modifier, and description written out in full.
- NARRATIVE DEPTH & COMPLETION: The narrative must never be lazy or cut short. Write a rich, immersive, multi-sensory response (typically 2 to 4 substantial paragraphs) covering atmosphere, physical effort and physics, environmental impact, NPC dialogue and body language, and full story consequences.
- DYNAMIC CURRENCY & WEALTH LOGIC (CRITICAL): Never be lazy with character wealth or currency transactions. Do not rely on rigid hardcoded keywords; the AI dynamically and accurately determines starting wealth, pricing, currency exchanges, loot, rewards, wages, shopping, trading, tips, and financial balances based on authentic world context. Articulate their [CURRENCY & FINANCIAL BALANCE] section with proper denominations, carried inside a realistic container (pouch, wallet, pocket, etc.). Whenever money changes hands—looted, earned, paid, spent, given, or found—record currency transactions accurately in "currencyTransactions", in 'updates', and in the narrative. Never forget currency! Every character who can handle money MUST have their [CURRENCY & FINANCIAL BALANCE] section active!

COMPREHENSIVE STORY & STAT UPDATE RESOLUTION RULE (CRITICAL):
- Make sure the AI does not forget anything needed to update whenever an action genuinely alters game state (such as combat damage, genuine physical exhaustion from heavy exertion or spellcasting, healing, or inventory changes)—instead of cutting the story short and not finishing that part of the story.
- NEVER cut the story short. The narrative must fully resolve and finish that part of the story following the player's action(s), describing the full outcomes, impacts, and reactions.
- DYNAMIC CONTEXTUAL STAT UPDATES: Only update health and energy/stamina/mana when there is an authentic reason in context (e.g. taking damage, healing, high physical exertion in combat or athletics, spellcasting, or resting/recovering).
- MENIAL TASKS ZERO ENERGY RULE: Menial, low-exertion, casual, social, or observational tasks (such as talking, conversing, standing, looking around, examining things, listening, waiting, casual walking, sitting, minor gestures, eating/drinking, or light mental reasoning) do NOT use any noticeable energy. NEVER deduct energy or stamina for menial tasks that do not realistically consume noticeable energy!
- Whenever an action DOES legitimately cause damage, healing, genuine strenuous energy expenditure, or rest recovery, update the stats immediately both in the 'updates' array AND in the character file. If the task is menial or non-strenuous, preserve energy unchanged.`;

const ACTION_AUDIT_PROMPT = `TASK: Technical Requirement Audit.
You are the High-Efficiency Logic Auditor for the Aifinity system.

Your ONLY goal is to analyze the player's action against the "World Context" and "Guide" to identify every technical system requirement.

INSTRUCTIONS:
1. AUDIT FOR CHECKS: Identify if the action requires a probability check (Combat, Stealth, Magic Focus, Physical feats, etc.).
   - RANDOM FIRST INTEGRITY: Do NOT generate, invent, choose, or output a roll number in "checks"! All rolls are rolled first via unbiased backend code randomness before outcome determination to prevent AI bias. You only detect the check name, reason, difficulty, stat, and modifiers.
2. AUDIT FOR ENTITIES: List every individual NPC, group of NPCs, Weapon, Item, or Location mentioned that does NOT have a file in context.
3. AUDIT FOR MAP: Determine if the player moved, environment changed, or new entities/landmarks/items appeared. Maps must have NOTHING missing within all players' observable and known areas, landmarks, items, npcs, structures, terrain features, etc. Always keep all observable and known elements updated correctly. Support advanced flexible shapes (oblong areas like forests via ellipse, irregular multi-point polygons, detailed architectural buildings such as market stalls and shops, paths/roads, circles, rects).
4. DETECT MODIFIERS: For any check identified, scan the context for mathematical modifiers (stats, items, rules, effects).
5. AUDIT FOR TEMPORAL SHIFT, SPATIAL SPLIT, & MAP PAGES: Detect if the action causes time travel, dimensional slips, or timeline returns. Specify destination time/year, anchor origin time, and whether WorldTime.txt requires temporal re-anchoring. Spatial splits & map pages: Determine whether players are together or geographically separated across different locations, levels, or timelines. Verify which map page(s) must be created, updated, or preserved to prevent data loss. List all NPCs, entities, hazards, and projectiles that must appear on the updated page(s).
6. AUDIT FOR INVENTORY, USAGE AMOUNTS, REFILLABLE ITEMS, WEIGHT & DIMENSIONS (DYNAMIC AI REASONING):
   - Dynamically detect whether ANY item, weapon, equipment, or object is picked up, found, gathered, bought, sold, dropped, given, stored, transferred to or from a container, equipped, or unequipped.
   - DYNAMIC ITEM USAGE & REFILLABLE DETECTION: Detect when an item has usage consumed, depleted, or refilled based on what happened in context (e.g., drinking from waterskin/flask, firing arrows/quiver ammo, burning oil/torches, drinking potion doses, consuming lockpicks, casting wand charges, or refilling a waterskin at a stream/well/fountain, refueling a lantern with oil, restocking ammo).
   - Accurately determine:
     * isInventoryAffected: true if any inventory/equipment/usage change occurs, false otherwise.
     * items: list of items with operation ("add" | "remove" | "equip" | "unequip" | "transfer" | "drop" | "consume_use" | "refill" | "set_usage"), item name, amount/uses, max uses, refillable status, container name, and target character.
   - Verify container space dimensions for overflow (e.g. staff sticking out of backpack risking dropping). AUTO-EQUIP OVERSIZED WEARABLE ITEMS: If items are bigger than container capacity or would overflow, such as clothes, armor, cloaks, footwear, belts, worn jewelry, or held tools/weapons, characters must automatically equip or wear them if sensible in context to avoid overflowing containers. Calculate carried weight vs body weight threshold and max lift strength. Encumbrance effects are DYNAMIC per entity — creatures with special biologies (e.g., Slimes absorbing items without slowdown, Incorporeal ghosts, telekinetics) are NOT penalized like standard humans.
   - HELD ITEMS & MAP ATTACHMENT: Verify that any item or weapon held in hand or equipped by a character is attached to that character. Ranged weapons (rifles, bows, blasters, etc.) define their firing range, NOT their map position. Never place a held weapon far away on the map; it moves with and is attached to the holding character at their coordinates. Don't add an item as things like free hand because it should just be empty instead etc for example (never audit or treat "Free Hand" or "Empty Hand" as items; unoccupied hands are simply empty).
7. AUDIT FOR ENERGY & STAMINA EXPENDITURE/RECOVERY (DYNAMIC CONTEXTUAL AI REASONING):
   - Dynamically analyze the character's physical and magical exertion based on the full scene context, character capabilities, and physical/magical requirements:
   - MENIAL & LOW-EXERTION ACTIONS: Menial, low-effort, casual, social, or everyday tasks (such as talking, speaking, conversing, standing, looking, observing, inspecting, reading, listening, waiting, idle moments, casual walking, sitting, eating, drinking, or light non-strenuous interactions) do NOT use any noticeable amount of energy or stamina.
     * For any menial, casual, or non-strenuous action:
       - "isEnergyAffected": MUST be false
       - "isMenialOrNonExertive": MUST be true
       - "expectedChange": MUST be 0
       - "reason": Dynamically explain why no noticeable energy was expended (e.g. "Menial conversational/observational task; negligible metabolic exertion").
       - Do NOT flag energy as affected or deduct points for menial tasks!
   - NOTICEABLE EXERTION & SPELLS: Only evaluate "isEnergyAffected": true with negative "expectedChange" when the character engages in genuine, noticeable physical exertion (e.g. melee/ranged combat, dodging, sprinting at top speed, climbing steep cliffs, lifting heavy weights, strenuous athletics) or casting spells/channeling magical abilities that have defined resource costs.
   - RECOVERY & REST: When resting, sleeping, or meditating, dynamically determine realistic positive energy recovery ("expectedChange" > 0, "isEnergyAffected": true).
8. AUDIT FOR RIDING, MOUNTING, VEHICLES & ENTERABLE ENTITIES (DYNAMIC AI REASONING):
   - Dynamically detect if the player or an NPC mounts, rides, boards, pilots, enters, dismounts, or exits a mount, animal, creature, vehicle, carriage, wagon, boat, mech, or rideable item (e.g., horse, skateboard, bicycle, carriage).
   - If mounting/entering:
     * BOTH files (the rider/occupant and the mount/vehicle/item) MUST be added to "filesToUpdate".
     * Rider's file must record their mounted status and adopt the mount's speed (e.g. "- Speed: Walking: 3.5 m/s, Running: 12.0 m/s (Mounted on [MountName]; Unmounted base: 1.5 m/s / 4.5 m/s)").
     * Mount/Vehicle's file must record the rider/driver and include the rider's weight (body weight + carried gear) in the mount's carried weight and encumbrance!
     * If the mount or vehicle does NOT have a file yet, add it to "filesToCreate" with complete physical stats, body weight, max lift/pull strength, and speed.
     * On CurrentMap.json, verify they move together at the same coordinates while mounted.
   - If dismounting/exiting:
     * Add BOTH files to "filesToUpdate" to clear mounting status, remove rider weight from the mount, restore the rider's unmounted speed, and allow separate map movement.
9. PLAYER ACTION INTEGRITY: Accurately capture what the player is attempting in 'intent' without changing, softening, or rationalizing it. The player is free to attempt ANY action within their context that is not physically/magically impossible, even if it does not make sense. Only audit for actual physical/magical impossibility, never common sense.
10. AUDIT FOR CURRENCY, BALANCES, TRANSACTIONS & COMMERCE (DYNAMIC AI REASONING):
    - Dynamically detect if ANY currency, money, coinage, credits, wealth, or financial transaction is affected in ANY way (including shopping, buying, selling, trading, receiving currency like NPC giving 1 Gold Coin and 5 Silver Coins, quest pay, wages, loot, finding treasure, accessing stored wealth, or GIVING/PAYING/TIPPING/DONATING money from their wallet, coin pouch, money belt, or on-person funds).
    - Accurately determine:
      * isCurrencyAffected: true if any currency change occurs, false otherwise.
      * transactions: array of transactions with:
        - "name": currency denomination/name (e.g. "Dollars", "Gold Coins", "Silver Coins", "Credits")
        - "amount": positive number (e.g. 20, 50, 5)
        - "operation": "deduct" | "add" | "transfer"
        - "container": specific container name (e.g. "Leather Wallet", "Coin Pouch", "Money Belt", or null)
        - "giver": character/entity giving or paying
        - "recipient": character/entity receiving
        - "rawText": description of transaction
    - DYNAMIC PRICING & ACCURATE TRANSACTIONS: Calculate realistic prices dynamically based on world context and setting.
    - CODE MATH & AFFORDABILITY CHECK:
      * Check the buyer's Carried Balance against the total price.
      * If they CAN afford it: deduct total price from carried balance (and add to seller if NPC). Add item to buyer's carried inventory/containers (or equip under [Equipped Gear & Armor] if wearable gear/armor).
      * If they CANNOT afford it (code math doesn't add up / insufficient carried balance): DO NOT give the item for free or allow negative balance! The player can do anything they want if they want it (e.g. bargain/haggle for a lower price, buy fewer items, offer to barter other items from inventory, ask for credit/loan, beg or plead, offer service, or walk away). The AI dynamically and accurately resolves their chosen approach!
      * If giving, handing over, donating, or paying money (e.g. giving money from wallet to someone): accurately determine the transaction, deduct the given amount from the giver's carried balance and wallet/container, add the giver's file to "filesToUpdate", and if given to an NPC or another character, add recipient's file to "filesToUpdate" to receive the money.
      * If receiving currency: add exact amounts to carried balance in their file and include in 'updates' array.
      * If accessing or moving stored/remote currency or stashes: verify specific location attached to each item or cache (using hide[...] for secret/hidden stashes).
      * Add both buyer/giver and seller/recipient entity files to "filesToUpdate".
11. AUDIT FOR HEALTH, DAMAGE, INJURIES, HEALING & HEALTH STATE MACHINE (DYNAMIC AI REASONING):
    - Dynamically detect if ANY character, player, ally, enemy, NPC, boss, monster, animal, or creature takes damage, is attacked, struck, shot, stabbed, burned, poisoned, falls, suffocates, or is healed.
    - 0 HP UNCONSCIOUSNESS & SURVIVAL WINDOW RULE (CRITICAL):
      * When a character's health reaches 0 HP, living/mortal characters enter the "Unconscious" state!
      * The unconscious effect lasts a base of 5 minutes (300 seconds) in active WorldTime.
      * Modifiers in context that help living/survival (e.g. Constitution, Willpower, Survival, Endurance, medical aid, or harsh environmental conditions like freezing/bleeding/drowning) dynamically influence the unconscious survival duration!
      * LETHAL UNCONSCIOUS STRIKE: While unconscious at 0 HP, if a character takes damage equal to or exceeding 15% of their max HP, they are INSTANTLY DEAD!
      * When health is restored above 0 HP (healing, medical stabilization), the unconscious effect is removed and they wake up!
    - MASSIVE DAMAGE OVERKILL (INSTANT DEATH) RULE (CRITICAL):
      * If a character takes damage equal to or greater than 1.5x their CURRENT health in a single hit or event (e.g. current HP is 20, and takes >= 30 damage), they are AUTOMATICALLY DEAD, skipping unconsciousness entirely (unless protected by death ward, immortality, or specific context)!
    - DEAD CHARACTERS & GRADUAL ROT/DECOMPOSITION (CRITICAL):
      * When a character dies, their file is NEVER auto-deleted. It remains in the filesystem.
      * A dead character cannot take actions unless revived, reanimated, or context/spirit rules apply.
      * Dead biological bodies begin gradual decomposition/rot based on WorldTime.txt (Stages 1 through 5).
    - Accurately determine:
      * isHealthAffected: true if any damage or healing occurs, false otherwise.
      * damageAndHealing: array of:
        - "target": exact name of the character/creature (e.g. "Kaelen", "Goblin Archer", "Bandit 1")
        - "targetFile": filename if known (e.g. "Kaelen-Bob.txt", "Bandits.txt", "Goblin.txt")
        - "type": "damage" | "heal"
        - "amount": positive numeric points of damage or healing (calculate based on weapon/spell damage, armor thresholds, check results)
        - "damageType": "slashing" | "piercing" | "bludgeoning" | "fire" | "frost" | "poison" | "falling" | etc.
        - "source": weapon, attacker, spell, or environmental hazard
        - "bodyPart": specific body part hit (e.g. "Torso", "Left Arm", "Head", "Leg")
        - "injury": wound description (e.g. "Deep gash on chest", "Broken arm")
        - "isMassiveDamage": boolean (true if damage dealt >= 1.5x current HP)
        - "isLethalUnconsciousStrike": boolean (true if target was at 0 HP unconscious and took >= 15% max HP damage)
    - Every character taking damage or healing MUST have their file added to "filesToUpdate"!
   
OUTPUT FORMAT (Strict JSON only):
{
  "intent": "Brief description of what the player is doing",
  "checks": [
    {
      "name": "Check Name",
      "reason": "Why this check is needed",
      "difficulty": "trivial|easy|moderate|hard|very_hard|near_impossible",
      "stat": "relevant_primary_attribute",
      "modifiers": [
        { "label": "Modifier Name", "math": "base + X%(1000) or +X", "origin": "filename.txt", "reasoning": "..." }
      ]
    }
  ],
  "healthAudit": {
    "isHealthAffected": true,
    "damageAndHealing": [
      {
        "target": "CharacterName",
        "targetFile": "CharacterName.txt",
        "type": "damage",
        "amount": 15,
        "damageType": "slashing",
        "source": "Enemy Sword",
        "bodyPart": "Torso",
        "injury": "Deep gash on chest"
      }
    ]
  },
  "currencyAudit": {
    "isCurrencyAffected": true,
    "transactions": [
      {
        "name": "Dollars",
        "amount": 20,
        "operation": "deduct",
        "container": "Leather Wallet",
        "giver": "PlayerName",
        "recipient": "NPCName",
        "rawText": "-$20 (given from wallet to NPC)"
      }
    ]
  },
  "inventoryAudit": {
    "isInventoryAffected": true,
    "items": [
      {
        "name": "ItemName",
        "operation": "add|remove|equip|unequip|transfer|drop",
        "container": "ContainerName",
        "targetCharacter": "CharacterName"
      }
    ]
  },
  "commerceAudit": {
    "isCommerceAction": true,
    "buyer": "PlayerName",
    "seller": "NPCName",
    "items": ["ItemName"],
    "totalPrice": "5 Silver Coins",
    "canAfford": true,
    "shortfallHandling": "none|bargain|beg|barter|walk_away",
    "currencyTransferred": "-5 Silver Coins"
  },
  "mountingAudit": {
    "isMountingAction": true,
    "rider": "RiderName",
    "mountOrVehicle": "MountName",
    "actionType": "mount|dismount|enter|exit",
    "notes": "Rider mounts horse; horse speed applies to rider, rider weight counts towards horse."
  },
  "temporalShift": {
    "isTimeTravel": true,
    "destinationEpoch": "Era / Year",
    "destinationTimestamp": "H:MM:SS AM/PM - Month DD, YYYY",
    "storeAnchorTime": "H:MM:SS AM/PM - Month DD, YYYY",
    "notes": "Action traveled back to 1888; preserve modern departure time in Anchor block."
  },
  "mapAudit": {
    "requiresUpdate": true,
    "isMultiPage": true,
    "activePages": ["Page_1_Surface", "Page_2_Underground"],
    "entitiesToPlace": ["Player_A", "Player_B", "Bandit_1", "Bandit_2", "Chest_01"],
    "spatialNotes": "Player_B entered dungeon; must create new page while preserving surface page for Player_A."
  },
  "energyAudit": {
    "isEnergyAffected": false,
    "isMenialOrNonExertive": true,
    "character": "CharacterName",
    "expectedChange": 0,
    "reason": "Menial task (e.g. talking / standing / observing) uses no noticeable energy; OR genuine exertion/spell/rest"
  },
  "filesToCreate": ["List of filenames to immediately generate"],
  "filesToUpdate": ["List of filenames that must be modified (Player, NPCs, etc)"],
  "mapUpdateRequired": true,
  "interruptedTime": null
}

CRITICAL: Ignore time-based strings (+30s) in math. Magic abilities MUST require "Magic Focus" or "Arcana" checks. Weapons MUST use technical rules.`;


export class AIEngine {
  private fs: FileSystem;
  private ai: GoogleGenAI;
  private lastValidMap: string | null = null;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('aimud_apikey') : null;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || storedKey || '' });
    // Initialize the last valid map from current storage and clean any initial duplicates
    const existingMap = this.fs.read('CurrentMap.json');
    if (existingMap) {
      try {
        const parsed = JSON.parse(existingMap);
        const cleaned = this.mergeAndNormalizeMap(parsed, null);
        const normalized = JSON.stringify(cleaned, null, 2);
        this.fs.write('CurrentMap.json', normalized);
        this.lastValidMap = normalized;
      } catch (e) {
        // Existing map is already corrupt, nothing we can do
      }
    }
  }

  private pendingTasks: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private currentAbortController: AbortController | null = null;

  public cancelAndReset(): void {
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (err) {
        console.warn("Could not abort current AI call:", err);
      }
      this.currentAbortController = null;
    }
    this.pendingTasks = [];
    this.isProcessingQueue = false;
  }

  private enqueueTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve) => {
      this.pendingTasks.push(async () => {
        let timer: any = null;
        try {
          const res = await Promise.race([
            task(),
            new Promise<T>((_, reject) => {
              // 2-minute processing timeout with safety buffer for task queue completion (140s)
              timer = setTimeout(() => reject(new Error("AI Action processing timed out")), 140000);
            })
          ]);
          if (timer) clearTimeout(timer);
          resolve(res);
        } catch (err) {
          if (timer) clearTimeout(timer);
          console.error("Task execution error:", err);
          resolve(null as any);
        }
      });
      this.runNextTask();
    });
  }

  private async runNextTask() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    while (this.pendingTasks.length > 0) {
      const next = this.pendingTasks.shift();
      if (next) {
        try {
          await next();
        } catch (e) {
          console.error("Queue task error:", e);
        }
      }
    }
    this.isProcessingQueue = false;
  }

  async initialize(startingPrompt: string, username?: string): Promise<AIResponse | null> {
    return this.enqueueTask(async () => {
      try {
        this.resetTurnUsage();
        const charRequirement = username
          ? `CRITICAL CHARACTER CREATION RULE: You MUST also create a highly detailed, extensive character file for player "${username}" during this initialization. The character's in-world Name MUST be a distinct, authentic, fictional name (e.g. "Kaelen Thorne", "Lyra Whisperwind", "Valerius") fitting the world setting. The character's name MUST NOT be the account username "${username}" and MUST NOT be a generic label like "Adventurer" or "Player". The file MUST be named EXACTLY "[CharacterName]-${username}.txt" (e.g. "Kaelen-${username}.txt"). Inside the file under [NAME & DESCRIPTION], specify '- Name: [CharacterName]' and '- Player: ${username}'. On CurrentMap.json, place this character in "players" with username: "${username}" and characterName: "[CharacterName]". PLAYER CHARACTERS ARE NEVER NPCS: DO NOT put this player character in "npcs" on CurrentMap.json!`
          : "CRITICAL: DO NOT create any player character files during this initialization phase. Players will provide their character descriptions separately later. You MUST NOT return any file named with \"CharacterName-USERNAME.txt\" format during this world generation phase. Wait for the explicit character prompt next.";

        const prompt = `Initialize world: ${startingPrompt}\n\nRemember: PROBABILITY ENGINE RULE (CRITICAL). Create highly detailed, extensive, and long files for the starting world (CurrentMap.json, WorldRules.txt, Guide.txt, WorldTime.txt, and initial locations/NPCs). ${charRequirement} Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds. WorldRules.txt MUST define the physics, weights, dimensions, containers (max space dimensions like 18x12 inches, overflow risking dropping items; when containers stretch, only multiply/expand their physical size and dimensions instead of their weight—never multiply the container's own empty weight with it), the dynamic overflow rule (the more items added to overflow and the heavier and bigger each item, the bigger chance of dropping by accident based on context and scaled random chance; heavier/bigger items have a higher chance of dropping than smaller/lighter ones), starting carrying item limits (characters can start with at most 2x their hand slots in carried items, though during adventure they can carry more than limit), auto-equip rule (items bigger than container space like clothes/armor automatically equip under [Equipped Gear & Armor] if contextually sensible to prevent container overflow), max lift strength (100% of body weight for baseline human with 1.0x strength), encumbrance rules (<= 20% good, 21%+ slower speed effect), and temporary effect reversions (e.g. lightweight spell on boulder reverting upon expiration). If creating starting character(s), their starting carried items (equipped + carried in containers) MUST BE <= 2x their hand slots (e.g., max 4 items for 2 hands); place any extra items under [OWNED / STORED ITEMS (NOT ON PERSON)]. DYNAMIC STARTING CURRENCY & WEALTH (CRITICAL): Never be lazy with character wealth, economy, or inventory. If creating starting character(s) or NPCs, dynamically reason about their social status, background, profession, and world setting to determine an authentic, setting-appropriate starting currency and net worth. Under [CURRENCY & FINANCIAL BALANCE], specify their Currency Type and Carried Balance (On Person) itemized with denominations, placed inside an equipped container (such as a coin pouch, wallet, purse, or pocket) under [CONTAINERS & CARRIED GEAR]. (Wallets, chit wallets, cardholders, and coin pouches are EQUIPPED CONTAINERS, NEVER currency items! Do NOT list wallets as money, and never generate placeholder tags like "(Worth: Credits)" or compliance/accounting header lines in inventory lists). If they own property, savings, or bank deposits, list them under Stored Balance. CurrentMap.json MUST have nothing missing within all players' observable and known areas, landmarks, items, npcs, structures, terrain, with flexible shapes (oblong areas like forests using ellipse shape with cx, cy, rx, ry, polygons for irregular terrain, and detailed buildings like market stalls/shops). If the initialization involves any uncertain event, return "checks".\nCONTEXT-APPROPRIATE INHABITANTS & NPCS: If the starting context naturally makes sense to have other characters, creatures, companions, mounts, or inhabitants (e.g. in a town, tavern, outpost, traveling caravan, bustling street, or populated wilderness), you are strongly encouraged to add fitting NPCs, creatures, or mounts with their own complete character files, map coordinates on CurrentMap.json, and narrative references [Name]. NPC FILE & MAP CONVENTION: All NPC files MUST be named with "-npc.txt" (e.g. "Maeve-npc.txt", "TownGuard-npc.txt"). On CurrentMap.json, their names MUST have "-npc" appended (e.g. "Maeve-npc") and they MUST NEVER be omitted or forgotten from the map.\nHOLDING INTEGRITY & RANGED WEAPONS HANDEDNESS (CRITICAL): Under [CURRENTLY HOLDING], list only the actual item names (e.g. "Oak Shortbow", "Hunting Rifle", "Heavy Crossbow", "Iron Broadsword", "Wooden Shield", "Torch"), with their weight and dimensions. Never use limbs or grip tags as item names (e.g. do not write "Both Hands (Two-Handed Grip)" as the item name). Limbs belong in brackets like [Main Hand] or [Both Hands (Two-Handed)]. Don't add an item as things like free hand because it should just be empty instead etc for example (never create an item or inventory/held entry for things like "Free Hand" or "Empty Hand"; an unoccupied hand or slot is simply empty). RANGED WEAPONS HANDEDNESS RULE (DYNAMIC CONTEXTUAL REASONING): Ranged weapons (bows, crossbows, rifles, muskets, shotguns, carbines, blasters, slings, etc.) are NOT always two-handed! Yes, they CAN be used with two hands, but if a ranged weapon is not currently being actively fired, aimed, or braced, it is usually held in ONE HAND (1 hand slot under [CURRENTLY HOLDING], e.g. "[Main Hand] Oak Shortbow: Weight: 2 lbs. Dimensions: 48x4x1.5 inches" or "[Main Hand] Hunting Rifle: Weight: 7 lbs. Dimensions: 40x6x2 inches") because the character is just holding or carrying it by the grip, stock, or riser. This leaves their other hand completely free to draw an arrow or magazine, hold a torch, carry a shield or secondary weapon, cast spells, or interact with objects. It ONLY requires or occupies [Both Hands (Two-Handed)] dynamically when actively nocking/drawing, aiming down sights, shouldering to fire, bracing against recoil, or cocking/reloading, UNLESS other genuine situational context is detected by the AI (evaluated through realistic physical context and narrative intent, NOT simplistic keyword matching—such as holding in a braced high-ready tactical stance, sweeping corners, or tense standoff) that dictates both hands are currently gripping the weapon. CONTAINERS & GEAR INTEGRITY: Wallets, chit wallets, cardholders, coin pouches, money belts, quivers, and backpacks are EQUIPPED CONTAINERS, NEVER unequipped loose items or currency pieces! Consolidate all carried coins/funds inside their primary equipped container (never split across phantom unequipped pouches). Never output compliance/accounting header lines or meta entries like "Initialized Starting Gear" inside inventory lists or quivers. Ensure all secret locations use clean balanced hide[...] tags (e.g. "[Location: hide[Buried inside hollow oak tree]]").\nIf the starting context calls for solitude or isolation (e.g. waking alone in a cave, stranded on a deserted island, a solitary dungeon cell, or an abandoned derelict ship), it is completely valid and appropriate to start with no other characters.\nMOUNTS & VEHICLES: If mounts, riding beasts, carriages, or vehicles exist in the scene, ensure their files reflect their physical stats, speed, body weight, and any riding/passenger relationships with rider weight included in carried weight!\nAUTO ACTION RECOMMENDATIONS: Provide 2 to 4 rich, diverse, context-aware suggestions for the player's next move.\nCRITICAL: Any magic, abilities, or spells MUST be highly specific with strict limits, energy costs, ranges, and target caps. Vague "magic" is completely unacceptable. Initialize WorldTime.txt containing both [CURRENT ACTIVE TIME] and [ANCHOR / ORIGIN TIMELINE] with identical starting timestamps and Anchor Flow Mode set to Frozen.`;
        const res = await this.handleRequest(prompt, undefined, username, 'gemini-3.8-flash');
        if (res && this.lastActionUsage) {
          res.usage = { ...this.lastActionUsage };
        }
        return res;
      } catch (e) {
        console.error("Initialization failed", e);
        return { narrative: "System initialization failed. Please check API Key." };
      }
    });
  }

  async processAction(action: string, username?: string, mapScreenshot?: string): Promise<AIResponse | null> {
    return this.enqueueTask(async () => {
      try {
          this.resetTurnUsage();
          const files = this.getRelevantFiles(username, action);
          const formatFileSet = (fileEntries: [string, string][]) =>
            fileEntries.map(([name, content]) => `=== ${name} ===\n${content}`).join('\n\n');

          const worldContext = formatFileSet(Object.entries(files));
          const spatialContext = this.buildSpatialContext(username);

          // Extract active player character details for sharp, accurate context-aware recommendations & audit
          const playerFile = this.findPlayerCharacterFile(username);
          let playerCharacterName = '';
          let playerCharacterContext = '';
          if (playerFile) {
            const charContent = this.fs.read(playerFile);
            if (charContent) {
              const nameMatch = charContent.match(/-\s*Full Name:\s*([^\n\r]+)/i) || charContent.match(/^#+\s*([^\n\r]+)/m);
              playerCharacterName = nameMatch ? nameMatch[1].trim() : playerFile.replace(/\.txt$/, '').replace(new RegExp(`[-_\\s]${username}$`, 'i'), '').trim();

              const descMatch = charContent.match(/-\s*Description:\s*([^\n\r]+)/i);
              const hpMatch = charContent.match(/-\s*Health:\s*([^\n\r]+)/i);
              const energyMatch = charContent.match(/-\s*Energy\/Mana\/Stamina:\s*([^\n\r]+)/i);
              const speedMatch = charContent.match(/-\s*Speed:\s*([^\n\r]+)/i);
              const transportMatch = charContent.match(/(?:-\s*(?:Status\s*\/\s*Transport|Status\s*\/\s*Mounting|Mounting\s*\/\s*Riding|Mounted|Riding|Inside|Transport):\s*([^\n\r]+))/i);
              const holdingMatch = charContent.match(/-\s*Items Currently Held:[\s\S]*?(?=\n-\s*Dynamic|\n\[|$)/i);

              let currencyLine = '';
              let storedItemsLine = '';
              try {
                const pStats = WeightInventoryEngine.parseCharacterStatsAndInventory(charContent);
                if (pStats.currency.hasCurrency) {
                  currencyLine = `- Carried Balance (On Person): ${pStats.currency.carriedSummary || '0'} | Stored Wealth: ${pStats.currency.storedSummary || '0'} | Total Net Worth: ${pStats.currency.totalNetWorthSummary || '0'}\n`;
                }
                if (pStats.storedItems.length > 0) {
                  storedItemsLine = `- Owned / Stored Items (Off-Person): ${pStats.storedItems.map(s => `${s.name} [Loc: ${s.location || 'Unknown'}]`).join(', ')}\n`;
                }
              } catch (e) {
                // non-fatal
              }

              playerCharacterContext = `\n[ACTIVE PLAYER CHARACTER CONTEXT]
- Controlling User: "${username}"
- Character File: "${playerFile}"
- Character Name: "${playerCharacterName}"
${descMatch ? `- Description: ${descMatch[1].trim()}\n` : ''}${hpMatch ? `- Health: ${hpMatch[1].trim()}\n` : ''}${energyMatch ? `- Energy: ${energyMatch[1].trim()}\n` : ''}${speedMatch ? `- Speed: ${speedMatch[1].trim()}\n` : ''}${currencyLine}${storedItemsLine}${transportMatch ? `- Mobility/Mount Status: ${transportMatch[1].trim()}\n` : '- Mobility/Mount: On Foot (Unmounted)\n'}${holdingMatch ? `- Currently Holding: ${holdingMatch[0].replace(/-\s*Items Currently Held:\s*/i, '').trim()}\n` : ''}`;
            }
          }

          const userHeader = username 
            ? `[Active Turn - User: ${username}${playerCharacterName ? ` | Character: "${playerCharacterName}" (File: ${playerFile})` : ''}]\n` 
            : '';

          // Find all active human player characters in the world for multiplayer context
          const allWorldFiles = this.fs.getAll();
          const playerFilesList = Object.keys(allWorldFiles).filter(f => {
            const lower = f.toLowerCase();
            if (lower.endsWith('.txt') && !lower.includes('world') && !lower.includes('map') && !lower.includes('rule') && !lower.includes('guide') && !lower.includes('lore') && !lower.endsWith('-npc.txt')) {
              const raw = allWorldFiles[f] || '';
              return lower.includes('-') || lower.includes('_') || raw.toLowerCase().includes('player:');
            }
            return false;
          });

          let partyOverviewContext = '';
          if (playerFilesList.length > 0) {
            partyOverviewContext = `\n[ALL HUMAN PLAYER CHARACTERS IN MULTIPLAYER PARTY]\n` + playerFilesList.map(pf => {
              const c = allWorldFiles[pf] || '';
              const pMatch = c.match(/Player:\s*([^\n\r]+)/i);
              const pName = pMatch ? pMatch[1].trim() : (pf.replace(/\.txt$/, '').split(/[-_]/).pop() || 'Player');
              const nameMatch = c.match(/-\s*Full Name:\s*([^\n\r]+)/i);
              const charName = nameMatch ? nameMatch[1].trim() : pf.replace(/\.txt$/, '');
              const classMatch = c.match(/(?:Class|Profession|Role|Archetype):\s*([^\n\r,]+)/i);
              const charClass = classMatch ? classMatch[1].trim() : 'Adventurer';
              const holdingMatch = c.match(/(?:-\s*Items Currently Held:|\[CURRENTLY HOLDING\])([\s\S]*?)(?=\n-\s*|\n\[|$)/i);
              const held = holdingMatch ? holdingMatch[0].replace(/-\s*Items Currently Held:\s*/i, '').trim().split('\n')[0] : 'None';
              return `- Player "${pName}": Character "${charName}" (Class: ${charClass}, Currently Held: ${held}, File: "${pf}")`;
            }).join('\n') + `\n* MANDATE: You MUST provide unique, tailored "playerRecommendations" for EACH active player above! Never give duplicate recommendations across different characters.\n`;
          }

          // STAGE 1: AUDIT (AI DYNAMIC CONTEXTUAL REASONING)
          // The AI dynamically analyzes the player's action against the World Context, Guide, and rules
          // to determine if a probability check is required (Combat, Stealth, Magic Focus, Physical feats, etc.),
          // detect modifiers, and audit for state/file requirements without using rigid keywords.
          const auditPrompt = `${ACTION_AUDIT_PROMPT}

Current Files Context:
${worldContext}

${spatialContext}
${playerCharacterContext}
${partyOverviewContext}
${userHeader}Player action to audit: ${action}`;

          let audit: any = { action, checks: [], filesToCreate: [], filesToUpdate: [] };
          try {
            const auditResponseText = await this.callAI(auditPrompt, undefined, 'gemini-3.8-flash');
            const parsedAudit = this.extractJSON(auditResponseText);
            if (parsedAudit && typeof parsedAudit === 'object') {
              audit = { ...parsedAudit, action };
            }
          } catch (auditErr) {
            console.warn("Audit call error, continuing with fallback audit:", auditErr);
          }

          // STAGE 2: RESOLUTION (BACKEND CALCULATION)
          let resolvedCheckReport = "";
          let resolvedCheckDetails = "";
          
          if (audit.checks && Array.isArray(audit.checks) && audit.checks.length > 0) {
            const results = audit.checks.map((check: any) => {
              const safeName = check.name || check.check || check.stat || 'Action Check';
              const difficulty = check.difficulty || 'moderate';
              const bonusResult = this.calculateBonusFromAI(check.modifiers || [], username);
              const totalBonus = bonusResult.total;
              
              let safeThresholds: { [key: string]: number };
              if (check.thresholds && typeof check.thresholds === 'object') {
                safeThresholds = { ...check.thresholds };
              } else if (typeof check.threshold === 'number') {
                const base = check.threshold;
                const adjusted = Math.max(0, Math.min(1000, base));
                safeThresholds = {
                  "Critical Success": Math.min(1000, adjusted + 200),
                  "Success": adjusted,
                  "Partial Success": Math.max(0, adjusted - 200)
                };
              } else {
                safeThresholds = this.getDefaultThresholds(difficulty);
              }

              if (totalBonus !== 0) {
                const shifted: { [key: string]: number } = {};
                for (const [key, val] of Object.entries(safeThresholds)) {
                  shifted[key] = Math.max(0, Math.min(1000, val - totalBonus));
                }
                safeThresholds = shifted;
              }
              safeThresholds = this.enforceRealisticThresholds(safeThresholds, difficulty);

              // True random roll generated first on backend to eliminate AI model bias or guessing
              const roll = this.generateRandomRoll();
              const outcome = this.determineOutcome(roll, safeThresholds, difficulty);

              return {
                name: safeName,
                outcome,
                roll,
                thresholds: safeThresholds,
                math: bonusResult.breakdown || "No modifiers"
              };
            });

            resolvedCheckReport = results.map(r => `[Check: ${r.name} - Result: ${r.outcome}]`).join('\n');
            resolvedCheckDetails = results.map(r => 
              `[Probability Check: ${r.name} - Result: ${r.outcome} | Roll: ${r.roll}/1000 | Math: ${r.math} | Thresholds: ${JSON.stringify(r.thresholds).replace(/"/g, '&quot;')}]`
            ).join(' ');
          }

// STAGE 3: FINAL IMPLEMENTATION (THE "ACTION" PHASE)
          const mapReq = audit.mapAudit?.requiresUpdate ?? audit.mapUpdateRequired ?? true;
          const timeShiftNotice = audit.temporalShift?.isTimeTravel 
            ? `TEMPORAL DISPLACEMENT DETECTED: Jump to ${audit.temporalShift.destinationEpoch} (${audit.temporalShift.destinationTimestamp}). Anchor origin time: ${audit.temporalShift.storeAnchorTime}. Update WorldTime.txt according to schema!` 
            : "None";

          // Auto-include player character file in filesToUpdate whenever playerFile is identified
          if (playerFile) {
            if (!audit.filesToUpdate) audit.filesToUpdate = [];
            if (!audit.filesToUpdate.includes(playerFile)) {
              audit.filesToUpdate.push(playerFile);
            }
          }

          // Also auto-include all damaged or healed NPCs / enemies in filesToUpdate
          if (audit.healthAudit?.damageAndHealing && Array.isArray(audit.healthAudit.damageAndHealing)) {
            if (!audit.filesToUpdate) audit.filesToUpdate = [];
            for (const event of audit.healthAudit.damageAndHealing) {
              if (event.targetFile && !audit.filesToUpdate.includes(event.targetFile)) {
                audit.filesToUpdate.push(event.targetFile);
              } else if (event.target) {
                const matchedFile = this.findCharacterOrEntityFile(event.target);
                if (matchedFile && !audit.filesToUpdate.includes(matchedFile)) {
                  audit.filesToUpdate.push(matchedFile);
                }
              }
            }
          }

          const executionPrompt = `Current Files Context:
${worldContext}

${spatialContext}
${playerCharacterContext}
${userHeader}Player action: ${action}

TECHNICAL PLAN (Follow strictly):
1. Resolve these checks: ${resolvedCheckReport || "None"}
   (NOTE: Each check above was rolled first using unbiased backend random generation (0-1000) and evaluated objectively against thresholds. Faithfully narrate the outcome without altering rolls or results).
2. Create these files immediately: ${audit.filesToCreate?.join(', ') || "None"}
3. Update these files: ${audit.filesToUpdate?.join(', ') || "None"}
4. Temporal Shift: ${timeShiftNotice}
5. Map Update Required: ${mapReq}
6. Energy & Stamina: ${audit.energyAudit ? (audit.energyAudit.isEnergyAffected ? `Energy affected (${audit.energyAudit.expectedChange} for ${audit.energyAudit.character || 'character'} - ${audit.energyAudit.reason || ''})` : `No energy change (0 cost) - ${audit.energyAudit.reason || 'Menial task uses no noticeable energy'}`) : "No energy change"}
7. Currency & Wealth: Dynamically evaluate if this action or its consequences result in ANY currency (e.g. Gold Coins, Silver Coins, Copper, Platinum, Credits, Dollars, Scrip, etc.) being acquired, found, looted, earned, rewarded, gifted, received, paid, spent, donated, or traded. If ANY currency is affected:
   - You MUST update ${playerFile || 'the character file'} under [CURRENCY & FINANCIAL BALANCE] and [CONTAINERS & CARRIED GEAR] (- Carried Inventory (Inside Containers)).
   - You MUST return structured "currencyTransactions": [ { "name": "...", "amount": positive number, "operation": "add"|"deduct"|"transfer", "container": "...", "recipient": "...", "giver": "..." } ].
   - You MUST include the currency change in "updates": { "type": "currency", "text": "+X Currency", "value": X }.
   - NEVER forget currency! Dynamically and accurately track and add all currency to balance and inventory.

Process this action based on the technical plan. Ensure every new item, weapon, or entity is created with full technical details.

CRITICAL REMINDERS:
1. You MUST fulfill Every file creation/update listed in the plan above.
2. ${resolvedCheckDetails ? `Include this exactly: ${resolvedCheckDetails}` : ""}
3. MAP UPDATE: Fully update CurrentMap.json. 
   - CRITICAL: Do NOT omit pages for players who did not take this turn. If players are separated, return ALL pages in the "pages" array.
   - NOTHING MISSING: All players' observable and known areas, landmarks, items, npcs, structures, terrain, hazards, containers, and loot MUST be on the map with everything updated correctly.
   - NPC PERSISTENCE, ARROW FACING & RANGE OF SIGHT: Every NPC present in the scene MUST be plotted in "npcs" on CurrentMap.json with their name having "-npc" appended (e.g. "Barkeep-npc"). All NPC files MUST end in "-npc.txt". Never forget or drop established NPCs!
     * Each NPC is rendered on the map as an ARROW pointing where they are facing currently! Always specify 'facing' (0°=East, 90°=South, 180°=West, 270°=North).
     * View range fully applies to ALL NPCs and players via 'vision' ({ "mainAngle": 66, "peripheralAngle": 90, "detailedRange": X, "maxRange": Y }) and dynamically updates based on context.
     * DYNAMIC SIGHT & BLINDNESS: If ANY character or NPC is blind (condition, eye injury, blindness spell, flash, pitch dark without light, or eyes closed/unconscious), view range is COMPLETELY GONE ('detailedRange: 0, maxRange: 0' or 'blind: true'). Their vision cone completely vanishes!
   - FLEXIBLE SHAPES & HIGH DETAIL: Generate flexible shapes (not just circles/squares): use oblong ellipses (shape: "ellipse" with cx, cy, rx, ry, rotation) for oblong forests/groves/clearings, polygons for irregular terrain/rivers, and high-detail architectural buildings (such as individual market stalls, shops, and taverns in a market).
   - Every entity, NPC, obstacle, item, and player within the scale bounds of each page MUST be plotted with valid (x, y) coordinates and facing angles.
4. INVENTORY, CONTAINERS & WEAPONS: Use ITEM & WEAPON TECHNICAL SCHEMA for any equipment created.
   - HOLDING INTEGRITY & RANGED WEAPONS HANDEDNESS (CRITICAL): Under [CURRENTLY HOLDING], specify only actual item names (e.g. "Oak Shortbow", "Hunting Rifle", "Heavy Crossbow", "Iron Broadsword", "Torch") with weight and dimensions. Never use limbs or grip phrasing as the item name (e.g. do NOT write "Both Hands (Two-Handed Grip)" as the item name). Limbs belong in brackets like [Main Hand] or [Both Hands (Two-Handed)]. Don't add an item as things like free hand because it should just be empty instead etc for example (an unoccupied hand or slot is simply empty—never treat or add "Free Hand" or "Empty Hand" as an item, and never create an item file for it).
     * RANGED WEAPONS HANDEDNESS RULE (DYNAMIC CONTEXTUAL REASONING): Ranged weapons (bows, crossbows, rifles, carbines, muskets, shotguns, blasters, slings, etc.) are NOT always two-handed! While they CAN be used with two hands, if a ranged weapon is not currently being actively used (e.g. when just equipped, held casually at the hip or side, carried while walking, traveling, conversing, or exploring), it is usually held in ONE HAND (1 hand slot under [CURRENTLY HOLDING], e.g. "[Main Hand] Oak Shortbow: Weight: 2 lbs. Dimensions: 48x4x1.5 inches" or "[Main Hand] Hunting Rifle: Weight: 7 lbs. Dimensions: 40x6x2 inches") because the character is simply holding or carrying it. This leaves the other hand free to hold a torch, draw an arrow/magazine from a quiver/pouch, hold a shield/dagger, cast spells, or manipulate items and doors until the moment of firing.
     * DYNAMIC TWO-HANDED EVALUATION (CONTEXT OVER KEYWORDS): A ranged weapon only dynamically shifts to occupy [Both Hands (Two-Handed)] when actively in use (nocking and drawing an arrow, aiming down sights, shouldering to shoot, bracing against recoil, or cocking/reloading a heavy mechanism) OR when the AI detects genuine situational context (evaluated through realistic physical context and character intent, NOT simplistic keyword matching—such as holding in an active high-ready two-handed stance during a breach or standoff, or when explicitly narrated by the player) that both hands are currently engaged on the weapon. When the shooting/aiming action concludes and the character returns to normal activity, it naturally returns to a 1-hand hold unless situational context dictates otherwise.
   - CONTAINER & CURRENCY INTEGRITY (CRITICAL): If the player picks up, finds, loots, or places an item in a container (e.g. backpack, satchel, pouch), you MUST update the player's character file ("CharacterName-USERNAME.txt").
     * Wallets, chit wallets, cardholders, coin pouches, money belts, quivers, and backpacks are EQUIPPED CONTAINERS, NEVER unequipped loose items or currency pieces!
     * Consolidate carried money inside the character's primary equipped pouch/wallet under [CONTAINERS & CARRIED GEAR] and [CURRENCY & FINANCIAL BALANCE]. Never split funds across phantom unequipped containers.
     * CARRIED VS STORED / REMOTE MANDATE: If the character has an equipped wallet, chit wallet, coin pouch, cardholder, or money belt, all money, coins, cash, electronic scrip chips, credit chits, or digital credits meant to be on person MUST be listed under Carried Balance (On Person) referencing that container. NEVER mark Carried Balance as 0 and put funds into Stored / Remote Balance when they have an equipped wallet/pouch! Stored / Remote Balance is ONLY for savings kept elsewhere (such as bank accounts with account numbers, vaults, or home strongboxes).
     * CONTAINER CONTENTS INTEGRITY: Never output container names or subheaders (e.g. "• (Inside Leather Bifold Wallet: ...)" or "• (Inside Leather Bifold Wallet)") as item entries inside a container! Containers hold actual equipment or currency, never duplicate self-referential header lines.
     * Never output compliance/accounting header lines or meta entries like "Initialized Starting Gear" inside inventory lists or quivers.
     * All secret stored items and caches MUST use clean balanced hide[...] tags (e.g. "[Location: hide[Buried inside hollow oak tree]]").
   - Under [CONTAINERS & CARRIED GEAR], under "- Carried Inventory (Inside Containers):", add the item formatted with detectable weight, dimensions, and container name: e.g. "- Iron Dagger: 2 lbs, 10x2 inches. Container: [Backpack]". Ensure the container exists under "- Containers Equipped/Carried:".
   - CONTAINER STRETCHING RULE: When containers stretch beyond base space, ONLY multiply/expand their physical size and dimensions (e.g. bulging depth and outer dimensions) instead of their weight. NEVER multiply the container's own empty weight with it! The empty weight of the container remains strictly constant; only the items inside add their own weight.
   - If an item would overflow or exceeds container capacity, or is wearable and contextually sensible, equip under [Equipped Gear & Armor].
5. STATS & ENERGY (DYNAMIC CONTEXTUAL REASONING):
   - Dynamically evaluate whether the action realistically requires noticeable physical or magical exertion.
   - ZERO ENERGY DEDUCTION FOR MENIAL TASKS: Everyday, social, or menial tasks (such as talking, conversing, standing, looking around, examining an item, casual observation, listening, waiting, sitting, casual walking, or light non-combat interactions) do NOT consume any noticeable amount of energy. NEVER deduct energy, stamina, or mana for menial tasks! The character's energy remains unchanged.
   - EXERTIVE ACTIONS & SPELLS ONLY: Only deduct energy/stamina/mana when the character genuinely engages in noticeable physical exertion (e.g. combat swings, martial strikes, dodging attacks, sprinting at full speed, climbing, heavy physical lifting) or casts spells/abilities with resource costs.
   - When energy is genuinely expended (strenuous action) or restored (resting/sleeping), update the character's file under [STATS & MODIFIERS] (- Energy/Mana/Stamina: Current / Max) and include the stat change in the 'updates' array. If the action is menial or non-strenuous, do NOT deduct any energy.
6. MOUNTING, RIDING, VEHICLES & ENTERABLE ENTITIES (CRITICAL):
   - If this action involves mounting, riding, boarding, piloting, entering, dismounting, or exiting a horse, animal, creature, vehicle, carriage, wagon, boat, mech, or rideable item (e.g. skateboard):
     * UPDATE BOTH ENTITY FILES: You MUST update both the rider's file ("${playerFile || 'Rider'}") and the mount/vehicle/item's file.
     * Clickable references: Cross-link both files using exact clickable bracket references (e.g. [Chestnut Warhorse] in rider file, [${playerCharacterName || 'Rider'}] in mount file).
     * Rider's file: Update mounting status (e.g. under [MOUNT, VEHICLE & TRANSPORT STATUS]: "- Status / Transport: Mounted on [Chestnut Warhorse] (Riding)" or "Riding [Custom Skateboard]") and adopt the mount/vehicle's speed (e.g. "- Speed: Walking: 3.5 m/s, Running: 12.0 m/s (Mounted on [Chestnut Warhorse]; Unmounted base: 1.5 m/s / 4.5 m/s)").
     * Mount's file: Record rider (e.g. "- Rider / Driver: [${playerCharacterName || 'Rider'}] (Weight: X lbs body + Y lbs gear = Z lbs)") and add rider's total weight to the mount's carried weight and encumbrance!
     * Map: On CurrentMap.json, while mounted they share identical coordinates and move together.
     * Dismounting: When dismounting or exiting, update BOTH files to clear the riding status and restore the rider's unmounted speed and independent map position.
7. CURRENCY, BALANCES, TRANSACTIONS & COMMERCE (CRITICAL):
   - Every character who can hold/use currency has their balance tracked under [CURRENCY & FINANCIAL BALANCE].
   - If an action involves shopping, buying, selling, trading, receiving money (e.g. an NPC giving 1 Gold Coin and 5 Silver Coins, wages, tips, quest pay, looting coins), or accessing remote wealth:
     * DYNAMIC PRICING: The AI dynamically and realistically determines prices and item values based on the setting and world context.
     * CODE MATH & AFFORDABILITY CHECK:
       - If buying, check total price against buyer's Carried Balance.
       - If they can afford it: deduct total price from carried balance (and add to seller if NPC). Add item to buyer's file (or equip under [Equipped Gear & Armor] if wearable gear/armor). Add stat update to 'updates' array (e.g. {"type": "stat", "text": "-5 Silver Coins", "value": -5}).
       - If they CANNOT afford it (code math doesn't add up / insufficient carried funds): DO NOT give the item for free or allow negative balance! The player can do anything they want if they want it (e.g. bargain or haggle for a discount, buy fewer items, offer other items from inventory to barter/trade, ask for credit/loan, beg or plead, offer labor/service, or walk away). The AI dynamically and authentically resolves their chosen approach and consequences!
   - GIVING, HANDING OVER, PAYING, OR TIPPING MONEY (CRITICAL):
     * If the player gives, hands, pays, tips, or donates money (such as from their wallet, coin pouch, or pockets) to an NPC or another character:
     * The AI dynamically and accurately determines the transaction and gets rid of the given money in the character's file.
     * Deduct or remove the given money from [CURRENCY & FINANCIAL BALANCE] (- Carried Balance (On Person)) AND from inside the container (e.g. Wallet, Coin Pouch) under [CONTAINERS & CARRIED GEAR] (- Carried Inventory (Inside Containers)). If all money in the wallet or pouch was given, remove it completely or set to None (0).
     * If given to an NPC or recipient, update their character file under [CURRENCY & FINANCIAL BALANCE] to add the received money.
     * Include the deduction in the 'updates' array (e.g. {"type": "stat", "text": "-$50 (given from wallet)", "value": -50}).
     * Always update both giver's and recipient's entity files in 'files'.
   - RECEIVING CURRENCY: When an NPC gives currency (e.g. 1 Gold Coin and 5 Silver Coins) or coins are found/earned, update the character's carried balance in their file and include in 'updates' array (e.g. {"type": "stat", "text": "+1 Gold Coin, +5 Silver Coins", "value": 1}).
    - STORED WEALTH & ITEMS (NOT ON PERSON): Stored items or remote funds (e.g. treasure chest in cottage, bank vault, secret cache) must have a specific location attached! For secret, buried, or lost stashes/items, use hide[...] syntax for location so they remain hidden from others until discovered.
    - Both buyer/giver and seller/recipient entity files MUST be updated in 'files'.
8. DYNAMIC HEALTH, DAMAGE, INJURIES, HEALING & HEALTH STATE MACHINE (CRITICAL):
   - Whenever ANY character (player, ally, enemy, NPC, boss, monster, animal, or creature) takes damage, suffers injury, is attacked, burned, poisoned, falls, or is healed:
     * You MUST include their character file (or shared group file e.g. "Goblins.txt") in the 'files' response object!
     * You MUST calculate and deduct the damage: "- Health: [NewCurrent] / [Max]". Health CAN GO NEGATIVE and is NEVER clamped to 0! It accurately tracks damage into the negative values (e.g. -15 / 100, -45 / 80) even while dead or unconscious to track overkill, trauma severity, and healing deficits. NEVER leave Health unchanged or at maximum when narrating that a character took damage!
     * If an injury is sustained (e.g. broken bone, gash, concussion), record it under [BODY PARTS & STATUS] or [STATUS EFFECTS & CONDITIONS].
     * 0 HP & NEGATIVE HEALTH UNCONSCIOUSNESS & SURVIVAL WINDOW: When a living character reaches 0 HP or below, they enter "Unconscious" status (base 5 minutes of WorldTime). While unconscious, taking more damage reduces health further into negative numbers (-10, -25, etc.). Taking lethal damage >= 15% of max HP while unconscious causes INSTANT DEATH. If dead, subsequent damage continues tracking into negative numbers (e.g. -30, -50). Wakes when HP > 0 or medical aid stabilizes them.
     * MASSIVE DAMAGE OVERKILL: If damage dealt >= 1.5x their CURRENT health in a single event, they are AUTOMATICALLY DEAD, skipping unconsciousness!
     * DEAD CHARACTER RETENTION & RENAMING RULE (CRITICAL): A dead character's file is NEVER deleted! Instead, remove the player's username from the character's filename and rename it into "[CharacterName]-dead.txt" (e.g. "Theron-chloe.txt" becomes "Theron-dead.txt"). In "[CharacterName]-dead.txt", change '- Player: [username]' to '- Status: Dead (Preserved corpse; player control ended)' and preserve their negative health and corpse. On CurrentMap.json, remove them from 'players' and place their marker under 'npcs' or corpses as "[CharacterName]-dead". If biological, "- Decomposition / Rot: Stage 1 - Fresh Corpse (Began: [WorldTime]; Gradual biological decay based on WorldTime)" begins and progresses based on WorldTime.txt.
     * RESURRECTION & RETURNING TO LIFE AS AN NPC (CRITICAL): If a dead character (e.g. from "[CharacterName]-dead.txt") is brought back to life in ANY way (such as a resurrection spell, necromancy, revivify, divine intervention, life potion, or health restored above 0 HP): the AI dynamically detects this from context. Because the player is not controlling them anymore after they died, they are an NPC! Convert and rename their file from "[CharacterName]-dead.txt" to "[CharacterName]-npc.txt". Set '- Type: Non-Player Character (NPC) (Resurrected)' and remove '- Player:'. On CurrentMap.json, place them in 'npcs' with name "[CharacterName]-npc" (NEVER in 'players').
     * GAME OVER: Set "gameOver": true ONLY if the active player character is confirmed DEAD. Do NOT set gameOver for Unconscious state at 0 or negative HP, as survival/rescue is ongoing!
     * Include the stat change in the 'updates' array: {"type": "stat", "text": "Health -X" (or "+X"), "value": -X}.
     * Keep Guide.txt Master Stat Table in 100% sync!
9. AUTO ACTION RECOMMENDATIONS & MULTIPLAYER UNIQUE RECOMMENDATIONS (CRITICAL):
   - In SINGLEPLAYER: The "recommendations" array MUST contain 2 to 4 dynamic, actionable suggestions SPECIFICALLY for the active player character "${playerCharacterName || username || 'Player'}" (controlled by ${username || 'user'}).
   - In MULTIPLAYER (or whenever multiple human player character files exist):
     * The AI MUST populate "playerRecommendations" with distinct entries for EACH player username (e.g. "playerRecommendations": { "Mep": [...], "Chloe": [...] }).
     * Each player's action recommendations MUST be completely UNIQUE and tailored specifically to that player's character:
       1. Weapons & Held Items: A warrior wields their blade/axe/mace/shield; an archer uses their bow; a mage channels their staff/wand/orb; a rogue uses daggers/lockpicks/tools.
       2. Spells & Class Talents: Offer distinct spellcasting or abilities matching that character's class and grimoire.
       3. Mount & Mobility: Suggest mounted commands or dismounting if riding; on-foot agile moves if dismounted.
       4. Personal Health & Surroundings: Individual health status, tactical vantage points, and nearby NPCs.
     * NEVER duplicate the same recommendations across different players! Each player character must have distinct, personalized options.
     * Also keep the general "recommendations" array populated for the active acting player.
10. DYNAMIC STRUCTURED TRANSACTIONS (CRITICAL - ALWAYS POPULATE ACCURATELY):
   - "healthTransactions": If ANY character or entity takes damage or heals:
     [
       {
         "target": "Character or entity name",
         "amount": 15,
         "operation": "damage|heal",
         "damageType": "slashing|piercing|bludgeoning|fire|frost|poison",
         "bodyPart": "Torso|Arm|Head|Leg",
         "injury": "Deep gash on chest",
         "isMassiveDamage": false,
         "isLethalUnconsciousStrike": false
       }
     ]
   - "currencyTransactions": If currency, money, or coinage is affected in any way (e.g. paying, giving money from wallet/pouch, donating, buying, selling, looting, finding, tipping), return structured objects:
     [
       {
         "name": "Currency denomination name (e.g. Dollars, Gold Coins, Silver, Credits)",
         "amount": 20,
         "operation": "deduct|add|transfer",
         "container": "Name of container if from wallet, coin pouch, pocket, etc., or null",
         "giver": "Character name who gave or spent",
         "recipient": "Character name who received or null",
         "rawText": "e.g. -$20 (given from wallet to street musician)"
       }
     ]
   - "inventoryTransactions": If items, gear, weapons, or item uses/refills are affected (picked up, dropped, stored, equipped, unequipped, used/consumed, or refilled):
     [
       {
         "name": "Item Name",
         "quantity": 1,
         "operation": "add|remove|equip|unequip|transfer|drop|consume_use|refill|set_usage",
         "container": "Container name if stored inside one, or null",
         "targetCharacter": "Character name",
         "amount": 1,
         "max": 5,
         "unit": "uses|doses|sips|arrows|hours",
         "isRefillable": true,
         "refillResource": "Water|Oil|Arrows"
       }
     ]
11. JSON SYNTAX: Close the "files" object with a curly brace "}" before "gameOver". NEVER close "files" with a square bracket "]".
12. PLAYER ACTION PRESERVATION (CRITICAL): Do NOT change, sanitize, or alter what the player chose to do, even if their action seems strange, silly, reckless, or "doesn't make sense". A player can attempt ANY action within their context unless it is strictly physically/magically impossible. Faithfully narrate and resolve the exact action they took and authentic consequences in the world.
13. ANTI-LAZINESS & CRAFTSMANSHIP MANDATE (CRITICAL):
    - NEVER be lazy. Do NOT cut corners, skip file sections, or produce rushed, hollow one-liner narratives.
    - Every file in the "files" map MUST be written out completely from top to bottom with zero placeholders, zero abbreviations, and zero omitted containers, currency, items, or stats.
    - Write an immersive, multi-paragraph narrative (2-4 rich paragraphs) that fully finishes and resolves the player's action with realistic physical feedback, environmental reactions, and dialogue.`;

          const finalResponse = await this.handleRequest(executionPrompt, mapScreenshot, username, 'gemini-3.8-flash', audit);
          
          // Ensure resolved probability check is included in narrative for interactive dice/math tooltip
          if (finalResponse && resolvedCheckDetails) {
            if (!finalResponse.narrative || !finalResponse.narrative.includes('[Probability Check:')) {
              finalResponse.narrative = `${resolvedCheckDetails}\n\n${finalResponse.narrative || ''}`.trim();
            }
          }
          if (finalResponse && (!finalResponse.checks || finalResponse.checks.length === 0) && audit.checks && audit.checks.length > 0) {
            finalResponse.checks = audit.checks;
          }

          // Post-process spatial consistency (Old map state already captured via fs.read in handleRequest/enforceSpatialConsistency)
          const latestMapRaw = this.fs.read('CurrentMap.json');
          if (finalResponse && latestMapRaw) {
             // Use the most recent valid map before final implementation as reference
             const referenceMap = this.lastValidMap || latestMapRaw;
             this.enforceSpatialConsistency(referenceMap, username);
          }

          // Ensure recommendations are context-aware for the specific active player character
          if (finalResponse && (!finalResponse.recommendations || finalResponse.recommendations.length === 0)) {
            finalResponse.recommendations = this.generateFallbackRecommendations(username, playerFile, playerCharacterName);
          }

          // Ensure playerRecommendations are populated for all active players in multiplayer
          if (finalResponse) {
            if (!finalResponse.playerRecommendations || typeof finalResponse.playerRecommendations !== 'object') {
              finalResponse.playerRecommendations = {};
            }
            if (username && (!finalResponse.playerRecommendations[username] || finalResponse.playerRecommendations[username].length === 0)) {
              finalResponse.playerRecommendations[username] = finalResponse.recommendations || [];
            }
          }

          // Guarantee accumulated action usage across all passes is attached to final response
          if (finalResponse && this.lastActionUsage) {
            finalResponse.usage = { ...this.lastActionUsage };
          }

          return finalResponse;
        } catch (e: any) {
          console.error("Processing failed", e);
          const isTimeout = e?.message?.includes('timed out') || e?.message?.includes('timeout') || e?.name === 'AbortError';
          return {
            narrative: isTimeout
              ? "The AI action processing timed out (exceeded 2 minutes). Please try your action again or break it down into smaller steps."
              : "Error processing action."
          };
        }
    });
  }

  private generateFallbackRecommendations(username?: string, playerFile?: string, playerCharacterName?: string): string[] {
    if (username) {
      return AIEngine.generateCharacterUniqueRecommendations(username, this.fs, playerFile);
    }
    return [
      "Survey the area and look for immediate points of interest",
      "Approach and speak with nearby characters or inhabitants",
      "Inspect the surrounding landmarks and check your bearings",
      "Consult your companions to coordinate the party's next move"
    ];
  }

  /**
   * Generates dynamic, context-aware, completely unique action recommendations
   * for a specific player character based on their class, equipped weapons/tools,
   * spells/abilities, mount/vehicle status, health condition, and spatial surroundings.
   */
  public static generateCharacterUniqueRecommendations(
    username: string,
    fs: FileSystem,
    charFileName?: string
  ): string[] {
    const all = fs.getAll();
    const uLower = (username || '').trim().toLowerCase();
    if (!uLower) return [];

    // Find character file
    let playerFile = charFileName;
    if (!playerFile) {
      playerFile = Object.keys(all).find(f => {
        const lower = f.toLowerCase();
        return (
          lower.endsWith(`-${uLower}.txt`) ||
          lower.endsWith(`_${uLower}.txt`) ||
          lower.endsWith(` ${uLower}.txt`) ||
          lower === `${uLower}.txt` ||
          lower === `character-${uLower}.txt`
        );
      });
    }

    if (!playerFile) {
      playerFile = Object.keys(all).find(f => {
        if (f.endsWith('.txt') && !f.includes('world') && !f.includes('map') && !f.includes('rule') && !f.includes('lore') && !f.endsWith('-npc.txt')) {
          const raw = all[f] || '';
          return raw.toLowerCase().includes(`player: ${uLower}`) || raw.toLowerCase().includes(`player: "${uLower}"`);
        }
        return false;
      });
    }

    const charContent = playerFile ? all[playerFile] : '';
    const recommendations: string[] = [];

    // Parse map context & nearby NPCs / landmarks
    let nearbyNpcs: string[] = [];
    let currentAreaName = '';
    const mapRaw = all['CurrentMap.json'];
    if (mapRaw) {
      try {
        const mapData = JSON.parse(mapRaw);
        const players = mapData.players || [];
        const npcs = mapData.npcs || [];
        const areas = mapData.areas || [];
        const myPlayer = players.find((p: any) => p.username?.toLowerCase() === uLower || p.characterName?.toLowerCase() === uLower);
        if (myPlayer) {
          const px = myPlayer.x ?? 0;
          const py = myPlayer.y ?? 0;
          for (const npc of npcs) {
            const nx = npc.x ?? 0;
            const ny = npc.y ?? 0;
            const dist = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
            if (dist < 160 && npc.name) {
              nearbyNpcs.push(npc.name.replace(/-npc$/i, ''));
            }
          }
          for (const area of areas) {
            const ax = area.x ?? 0;
            const ay = area.y ?? 0;
            const dist = Math.sqrt((ax - px) ** 2 + (ay - py) ** 2);
            if (dist < 130 && area.name) {
              currentAreaName = area.name;
            }
          }
        }
      } catch (e) {
        // non-fatal
      }
    }

    if (charContent) {
      // 1. Mount / Transport
      const isMounted = charContent.includes('Mounted on') || charContent.includes('Riding [') || charContent.includes('Inside [');
      const mountMatch = charContent.match(/Mounted on \[([^\]]+)\]/i) || charContent.match(/Riding \[([^\]]+)\]/i) || charContent.match(/Inside \[([^\]]+)\]/i);
      const mountName = mountMatch ? mountMatch[1] : 'your mount';

      // 2. Held items / weapons
      const heldItems: string[] = [];
      const heldSection = charContent.match(/(?:-\s*Items Currently Held:|\[CURRENTLY HOLDING\])([\s\S]*?)(?=\n-\s*|\n\[|$)/i);
      if (heldSection) {
        const lines = heldSection[1].split('\n');
        for (const line of lines) {
          const itemMatch = line.match(/(?:-\s*[^:\n]+:\s*|•\s*(?:\[[^\]]+\]\s*)?)([^:\n(]+)/);
          if (itemMatch) {
            const it = itemMatch[1].trim();
            if (it && !/none|empty|nothing|both hands/i.test(it)) {
              heldItems.push(it);
            }
          }
        }
      }

      // 3. Spells / Abilities
      const spells: string[] = [];
      const spellsSection = charContent.match(/(?:-\s*Spells\s*&\s*Abilities:|\[SPELLS & ABILITIES\]|\[SKILLS & TALENTS\])([\s\S]*?)(?=\n-\s*|\n\[|$)/i);
      if (spellsSection) {
        const sLines = spellsSection[1].split('\n');
        for (const sl of sLines) {
          const spMatch = sl.match(/(?:-\s*|•\s*|\*\s*)([A-Z][a-zA-Z\s'-]+)(?:\s*\(|:|$)/);
          if (spMatch) {
            const sp = spMatch[1].trim();
            if (sp && !/none|description|magic|skills|abilities/i.test(sp) && sp.length > 2) {
              spells.push(sp);
            }
          }
        }
      }

      // 4. Class / Role
      const classMatch = charContent.match(/(?:Class|Profession|Role|Archetype|Calling):\s*([^\n\r,]+)/i);
      const charClass = (classMatch ? classMatch[1].trim() : '').toLowerCase();

      // 5. Health & Conditions
      const hpMatch = charContent.match(/Health:\s*(-?\d+)\s*\/\s*(\d+)/i);
      const isWounded = hpMatch && (parseInt(hpMatch[1]) < parseInt(hpMatch[2]) * 0.5);

      if (isMounted) {
        recommendations.push(`Spur ${mountName} forward along the primary path`);
        recommendations.push(`Rein in ${mountName} and scan the surrounding terrain from the saddle`);
        recommendations.push(`Dismount from ${mountName} to investigate the immediate ground on foot`);
      } else {
        // Weapon / Held item specific
        if (heldItems.length > 0) {
          const primary = heldItems[0];
          const pLower = primary.toLowerCase();
          if (/bow|crossbow|rifle|gun|pistol|slingshot/i.test(pLower)) {
            recommendations.push(`Nock an arrow in your ${primary} and seek elevated vantage`);
          } else if (/staff|wand|orb|tome|grimoire|focus/i.test(pLower)) {
            recommendations.push(`Channel arcane energy through your ${primary} to read ambient mana`);
          } else if (/shield/i.test(pLower)) {
            recommendations.push(`Raise your ${primary} in the vanguard to shield companions`);
          } else if (/dagger|blade|sword|axe|mace|hammer|spear|halberd|rapier/i.test(pLower)) {
            recommendations.push(`Ready your ${primary} and take a balanced combat stance`);
          } else if (/lockpick|picks|tools/i.test(pLower)) {
            recommendations.push(`Ready your ${primary} to inspect nearby mechanisms or locks`);
          } else if (/torch|lantern/i.test(pLower)) {
            recommendations.push(`Hold up your ${primary} to illuminate concealed shadows`);
          } else {
            recommendations.push(`Ready your ${primary} and proceed cautiously`);
          }
        }

        // Spell or class specific
        if (spells.length > 0) {
          const spell = spells[0];
          recommendations.push(`Prepare to cast ${spell} as tactical support`);
        } else if (/mage|wizard|sorcerer|warlock|necromancer|alchemist/i.test(charClass)) {
          recommendations.push(`Attune your senses to detect ambient magical energies or runes`);
        } else if (/rogue|thief|assassin|shadow|scout/i.test(charClass)) {
          recommendations.push(`Melt into the shadows to scout ahead and search for hidden traps`);
        } else if (/ranger|hunter|druid/i.test(charClass)) {
          recommendations.push(`Inspect the terrain for animal tracks and signs of recent movement`);
        } else if (/cleric|paladin|priest|healer/i.test(charClass)) {
          recommendations.push(`Offer a quiet prayer and assess your companions' physical readiness`);
        } else if (/bard/i.test(charClass)) {
          recommendations.push(`Observe the social atmosphere and listen for rumors`);
        } else if (/warrior|barbarian|fighter|knight/i.test(charClass)) {
          recommendations.push(`Take the vanguard position to guard the party against ambushes`);
        }

        // Environmental / Interaction
        if (nearbyNpcs.length > 0) {
          const targetNpc = nearbyNpcs[0];
          recommendations.push(`Approach and speak with [${targetNpc}] regarding the situation`);
        } else if (currentAreaName) {
          recommendations.push(`Investigate the landmarks and layout of ${currentAreaName}`);
        } else {
          recommendations.push(`Survey the area for immediate points of interest`);
        }

        // Secondary / tactical action
        if (isWounded) {
          recommendations.push(`Take cover to bind your wounds and catch your breath`);
        } else if (heldItems.length > 1) {
          recommendations.push(`Switch grip and ready your ${heldItems[1]}`);
        } else {
          recommendations.push(`Consult your companions to coordinate the party's next move`);
        }
      }
    }

    const uniqueRecs = Array.from(new Set(recommendations)).filter(r => r && r.trim().length > 0);
    if (uniqueRecs.length < 2) {
      uniqueRecs.push("Survey your immediate surroundings for danger or opportunity");
      uniqueRecs.push("Converse with your allies to decide the next course of action");
    }
    return uniqueRecs.slice(0, 4);
  }

  /**
   * Selects only the files necessary for the current context.
   * Prioritizes core files, player files, and spatially relevant files.
   */
  private getRelevantFiles(username?: string, action?: string): { [name: string]: string } {
    const all = this.fs.getAll();
    const relevant: { [name: string]: string } = {};

    // 1. Core Engine Files
    const core = ['WorldRules.txt', 'Guide.txt', 'WorldTime.txt', 'CurrentMap.json'];
    for (const f of core) {
      if (all[f]) relevant[f] = all[f];
    }

    // 2. Active Player Context
    if (username) {
      const uLower = username.toLowerCase();
      const playerFiles = Object.keys(all).filter(f => {
        const lower = f.toLowerCase();
        return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
      });
      for (const f of playerFiles) {
        relevant[f] = all[f];
        // SCAN INVENTORY: Pull in technical files for items the player is carrying
        for (const potentialItemFile of Object.keys(all)) {
          if (relevant[potentialItemFile]) continue;
          const base = potentialItemFile.replace('.txt', '').toLowerCase();
          if (base.length > 2 && all[f].toLowerCase().includes(base)) {
            relevant[potentialItemFile] = all[potentialItemFile];
          }
        }
      }
    }

    // 3. Spatially Relevant Files
    const mapRaw = all['CurrentMap.json'];
    if (mapRaw) {
      try {
        const mapData = JSON.parse(mapRaw);
        const players = mapData.players || [];
        const areas = mapData.areas || [];

        // Find current player's location
        const player = players.find((p: any) => p.username?.toLowerCase() === username?.toLowerCase());
        if (player) {
          const px = player.x, py = player.y;
          const range = 100; // Search radius

          for (const area of areas) {
            const dist = Math.sqrt((area.x - px) ** 2 + (area.y - py) ** 2);
            if (dist < range) {
              const aName = area.name?.toLowerCase().replace(/\W/g, '') || '';
              const fileMatch = Object.keys(all).find(f => {
                const fName = f.toLowerCase().replace('.txt', '').replace(/\W/g, '');
                return fName.includes(aName) || aName.includes(fName);
              });
              if (fileMatch) relevant[fileMatch] = all[fileMatch];
            }
          }
        }
      } catch (e) { }
    }

    // 5. Action Keyword Matching (Broad context sweep)
    if (action) {
      const words = action.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      for (const f of Object.keys(all)) {
        if (relevant[f]) continue;
        const lowFile = f.toLowerCase();
        const lowContent = all[f].toLowerCase();
        // Include if filename matches OR if content matches and action is brief
        if (words.some(w => lowFile.includes(w) || (lowContent.includes(w) && action.length < 100))) {
          relevant[f] = all[f];
        }
      }
    }

    return relevant;
  }

  /**
   * Generates a text summary of the current map state for the AI.
   */
  private buildSpatialContext(username?: string): string {
    const mapRaw = this.fs.read('CurrentMap.json');
    if (!mapRaw) return '';

    try {
      const map = JSON.parse(mapRaw);
      const pages = map.pages || (map.areas ? [map] : []);
      const lines: string[] = ['[SPATIAL CONTEXT]'];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageLabel = page.name || `Page ${i + 1}`;
        const players = page.players || [];
        const areas = page.areas || [];

        const player = players.find((p: any) => p.username?.toLowerCase() === username?.toLowerCase());
        if (player) {
          const px = Number(player.x) || 0;
          const py = Number(player.y) || 0;
          const distLines: string[] = [];

          for (const area of areas) {
            const ax = Number(area.x ?? area.cx) || 0;
            const ay = Number(area.y ?? area.cy) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            let cx = ax + aw / 2;
            let cy = ay + ah / 2;
            if (area.shape === 'circle' || area.shape === 'ellipse' || area.shape === 'oblong') {
              cx = Number(area.cx ?? area.x) || ax;
              cy = Number(area.cy ?? area.y) || ay;
            } else if (area.shape === 'polygon' && area.points) {
              const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
              const numPoints = Math.floor(pts.length / 2);
              if (numPoints >= 1) {
                let sx = 0, sy = 0;
                for (let j = 0; j < numPoints * 2; j += 2) {
                  sx += pts[j];
                  sy += pts[j + 1];
                }
                cx = sx / numPoints;
                cy = sy / numPoints;
              }
            }
            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            distLines.push(`  → ${area.type || 'Object'}: ${area.name} (${area.description || ''}) is ${dist.toFixed(1)}m away [at (${cx.toFixed(1)}, ${cy.toFixed(1)})]`);
          }

          for (const other of players) {
            if (other.username?.toLowerCase() === username?.toLowerCase()) continue;
            const ox = Number(other.x) || 0;
            const oy = Number(other.y) || 0;
            const dist = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2);
            distLines.push(`  → Player ${other.username}: ${dist.toFixed(1)}m away on [${pageLabel}] at (${ox.toFixed(1)}, ${oy.toFixed(1)})`);
          }

          const npcs = [
            ...(Array.isArray(page.npcs) ? page.npcs : []),
            ...(Array.isArray(page.creatures) ? page.creatures : []),
            ...(Array.isArray(page.entities) ? page.entities : [])
          ];
          for (const npc of npcs) {
            if (!npc) continue;
            const nx = Number(npc.x) || 0;
            const ny = Number(npc.y) || 0;
            const dist = Math.sqrt((px - nx) ** 2 + (py - ny) ** 2);
            let nName = (npc.name || npc.id || 'NPC').trim();
            if (!nName.toLowerCase().endsWith('-npc')) {
              nName = `${nName}-npc`;
            }
            distLines.push(`  → NPC/Creature [${nName}] (${npc.type || 'npc'}): ${dist.toFixed(1)}m away on [${pageLabel}] at (${nx.toFixed(1)}, ${ny.toFixed(1)})${npc.description ? ` - ${npc.description}` : ''}`);
          }

          lines.push(`${pageLabel} at (${px.toFixed(1)}, ${py.toFixed(1)}), facing ${player.facing || 0}°:`);
          lines.push(...distLines);
        }

        if (page.scale) {
          lines.push(`Map scale: ${page.scale}`);
        }
      }

      return lines.join('\n');
    } catch (e) {
      console.error('Failed to build spatial context', e);
      return '';
    }
  }

  /**
   * Safe JSON repair for common AI mistakes
   */
  private repairJSON(raw: string): string | null {
    try {
      let s = raw.trim();
      // Remove possible markdown wrappers
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      // Remove trailing commas before } or ]
      s = s.replace(/,\s*([}\]])/g, '$1');

      // Unquoted keys fix
      s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // Fix inner stringified JSON keys where backslash was dropped before quote-colon: \"key": -> \"key\":
      s = s.replace(/\\\"([a-zA-Z0-9_-]+)":/g, '\\"$1\\":');
      
      // Auto-closing stack logic for unclosed braces/brackets and strings
      let inString = false;
      let escape = false;
      const stack: string[] = [];
      let res = '';
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inString) {
          if (escape) {
            res += c;
            escape = false;
          } else if (c === '\\') {
            res += c;
            escape = true;
          } else if (c === '"') {
            res += c;
            inString = false;
          } else if (c === '\n') {
            res += '\\n';
          } else if (c === '\r') {
            res += '\\r';
          } else if (c === '\t') {
            res += '\\t';
          } else {
            res += c;
          }
        } else {
          if (c === '"') {
            inString = true;
            res += c;
          } else if (c === '{') {
            stack.push('}');
            res += c;
          } else if (c === '[') {
            stack.push(']');
            res += c;
          } else if (c === '}') {
            if (stack.length > 0 && stack[stack.length - 1] === '}') {
              stack.pop();
            }
            res += c;
          } else if (c === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ']') {
              stack.pop();
            }
            res += c;
          } else {
            res += c;
          }
        }
      }
      if (escape) res += '\\';
      if (inString) res += '"';
      res = res.replace(/,\s*$/, '');
      while (stack.length > 0) {
        res = res.replace(/,\s*$/, '') + stack.pop();
      }
      res = res.replace(/,\s*([}\]])/g, '$1');

      return res;
    } catch (e) {
      return null;
    }
  }

  /**
   * Post-processes the AI's response to enforce spatial consistency.
   * Compares old vs new map state and corrects player positions if the AI
   * failed to move them appropriately toward any interactive entity.
   */
private enforceSpatialConsistency(oldMapRaw: string, username?: string) {
    const newMapRaw = this.fs.read('CurrentMap.json');
    if (!newMapRaw || !oldMapRaw) return;

    try {
      const oldMap = JSON.parse(oldMapRaw);
      const newMap = JSON.parse(newMapRaw);

      const oldPages = oldMap.pages || (oldMap.areas ? [oldMap] : []);
      const newPages = newMap.pages || (newMap.areas ? [newMap] : []);

      const interactiveTypes = new Set([
        'npc', 'treasure', 'loot', 'item', 'weapon', 'furniture', 'vehicle', 'terminal',
        'portal', 'tech', 'magic', 'obstacle', 'building', 'shop', 'stall', 'container'
      ]);

      let modified = false;

      for (const newPage of newPages) {
        const oldPage = oldPages.find((p: any) => 
          (p.name && newPage.name && p.name.toLowerCase() === newPage.name.toLowerCase()) ||
          (p.id && newPage.id && p.id === newPage.id)
        ) || oldPages[0];

        if (!newPage?.players || !oldPage?.players) continue;

        const areas = newPage.areas || [];

        for (const newPlayer of newPage.players) {
          const oldPlayer = oldPage.players.find((p: any) =>
            p.username?.toLowerCase() === newPlayer.username?.toLowerCase()
          );
          if (!oldPlayer) continue;

          const oldX = Number(oldPlayer.x) || 0;
          const oldY = Number(oldPlayer.y) || 0;
          const newX = Number(newPlayer.x) || 0;
          const newY = Number(newPlayer.y) || 0;

          if (Math.abs(newX - oldX) > 0.1 || Math.abs(newY - oldY) > 0.1) continue;

          let closestTarget: { cx: number; cy: number } | null = null;
          let closestDist = Infinity;

          for (const area of areas) {
            if (!interactiveTypes.has(area.type?.toLowerCase())) continue;
            if (area.isHeld || area.attachedTo) continue;

            const ax = Number(area.x ?? area.cx) || 0;
            const ay = Number(area.y ?? area.cy) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            let cx = ax + aw / 2;
            let cy = ay + ah / 2;
            if (area.shape === 'circle' || area.shape === 'ellipse' || area.shape === 'oblong') {
              cx = Number(area.cx ?? area.x) || ax;
              cy = Number(area.cy ?? area.y) || ay;
            } else if (area.shape === 'polygon' && area.points) {
              const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
              const numPoints = Math.floor(pts.length / 2);
              if (numPoints >= 1) {
                let sx = 0, sy = 0;
                for (let j = 0; j < numPoints * 2; j += 2) {
                  sx += pts[j];
                  sy += pts[j + 1];
                }
                cx = sx / numPoints;
                cy = sy / numPoints;
              }
            }
            const dist = Math.sqrt((newX - cx) ** 2 + (newY - cy) ** 2);

            if (dist < closestDist) {
              closestDist = dist;
              closestTarget = { cx, cy };
            }
          }

          const interactionRange = this.getInteractionRange(newPlayer.username) || 3;

          if (closestTarget && closestDist > interactionRange) {
            const moveSpeed = this.extractPlayerSpeed(newPlayer.username) || 1.5;
            const timeCost = this.estimateTimeCost() || 6;
            const maxMove = moveSpeed * timeCost;
            const moveDistance = Math.min(maxMove, Math.max(0, closestDist - (interactionRange * 0.8)));

            if (moveDistance > 0.5) {
              const ratio = moveDistance / closestDist;
              newPlayer.x = +(oldX + (closestTarget.cx - oldX) * ratio).toFixed(1);
              newPlayer.y = +(oldY + (closestTarget.cy - oldY) * ratio).toFixed(1);

              const facingRad = Math.atan2(
                closestTarget.cy - newPlayer.y,
                closestTarget.cx - newPlayer.x
              );
              newPlayer.facing = +(facingRad * 180 / Math.PI).toFixed(0);
              modified = true;
            }
          }
        }
      }

      if (modified) {
        const correctedJson = JSON.stringify(newMap.pages ? newMap : { pages: newPages }, null, 2);
        this.writeMapSafe(correctedJson, username);
      }
    } catch (e) {
      console.error('Spatial consistency enforcement failed', e);
    }
  }

  /**
   * Tries to find the current max interaction range for a player (weapon, spell, etc.)
   */
  private getInteractionRange(username: string): number | null {
    if (!username) return null;
    const files = this.fs.getAll();
    const uLower = username.toLowerCase();

    for (const [name, content] of Object.entries(files)) {
      if (!name.toLowerCase().includes(uLower)) continue;

      // Look for range patterns in the character file or equipped items
      const rangeMatch = content.match(/(?:range|reach|distance)[:\s]*(\d+\.?\d*)\s*m/i);
      if (rangeMatch) return parseFloat(rangeMatch[1]);

      // Fallback for melee weapon detection
      if (content.toLowerCase().includes('sword') || content.toLowerCase().includes('axe') || content.toLowerCase().includes('club')) {
        return 2;
      }
    }
    return null;
  }

  /**
   * Extracts a player's movement speed from their character file.
   * Handles varied formats: "Walking: 1.5m/s", "Speed 5 ft/s", "Movement Speed: 3 meters per second", etc.
   * Returns speed in m/s, or null if not found.
   */
  private extractPlayerSpeed(username: string): number | null {
    if (!username) return null;
    const files = this.fs.getAll();
    const uLower = username.toLowerCase();

    for (const [name, content] of Object.entries(files)) {
      if (!name.toLowerCase().includes(uLower)) continue;

      // Try multiple patterns from most specific to least
      const patterns = [
        /(?:walk(?:ing)?|run(?:ning)?|move(?:ment)?|speed|sprint(?:ing)?|base\s*speed)[:\s]*(\d+\.?\d*)\s*m(?:eters?)?\s*(?:\/|per\s*)s(?:ec(?:ond)?)?/i,
        /(\d+\.?\d*)\s*m\/s/i,
        /(\d+\.?\d*)\s*(?:ft|feet)\s*(?:\/|per\s*)s(?:ec)?/i,  // ft/s → convert
        /(\d+\.?\d*)\s*(?:km|kph|km\/h)/i,  // km/h → convert
        /(?:speed|movement)[:\s]*(\d+\.?\d*)/i, // bare number fallback
      ];

      for (let i = 0; i < patterns.length; i++) {
        const match = content.match(patterns[i]);
        if (match) {
          let speed = parseFloat(match[1]);
          // Convert units to m/s
          if (i === 2) speed *= 0.3048;    // ft/s → m/s
          if (i === 3) speed /= 3.6;       // km/h → m/s
          if (speed > 0 && speed < 100) return speed; // sanity check
        }
      }
    }
    return null;
  }

  /**
   * Estimates the time cost of the last action by checking the most recent
   * update entry or WorldTime changes. Returns seconds, or null if unknown.
   */
  private estimateTimeCost(): number | null {
    // Check the WorldTime.txt for any time-related info
    // This is a best-effort estimation — return null to use defaults
    return null;
  }

  private async handleRequest(userPrompt: string, mapScreenshot?: string, username?: string, modelName?: string, auditContext?: any): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt, mapScreenshot, modelName);
    let data: AIResponse;

    try {
      data = this.extractJSON(responseText);
    } catch (e) {
      console.error("JSON extraction/parse Error", e, responseText);
      return { narrative: "System Error: AI returned invalid JSON format." };
    }

    // Phase 2: Resolve probability checks if returned by the AI and not already resolved in narrative
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0 && (!data.narrative || data.narrative.length < 30 || data.narrative.toLowerCase().includes('roll required') || !data.narrative.includes('[Probability Check:'))) {
      // 0. Also process any file updates from Phase 1 so they aren't lost
      await this.processResponseData(data, username, auditContext, userPrompt);

      const worldState = this.getWorldContextForAI(username, userPrompt);

      const results = await Promise.all(data.checks.map(async check => {
        // Normalize alternate AI check formats
        const safeName = check.name || check.check || check.stat || 'Action Check';
        const safeDesc = check.description || `Probability roll for ${safeName}`;
        const difficulty = check.difficulty || 'moderate';

        // 1. DYNAMICALLY DETECT MODIFIERS USING AI
        // The AI analyzes the raw context and identifies structured modifier rules.
        const detectedMods = await this.detectRelevantModifiers(safeDesc, worldState, username);

        // 2. CALCULATE BONUS FROM DETECTED MODS (System Math)
        const bonusResult = this.calculateBonusFromAI(detectedMods, username);
        const globalBonus = bonusResult.total;

        // Apply manual modifier if present, added to the global bonus
        const manualMod = check.modifier || 0;
        const totalBonus = globalBonus + manualMod;

        // Build math breakdown string
        let mathBreakdown = bonusResult.breakdown;
        if (manualMod !== 0) {
          mathBreakdown += (mathBreakdown ? ' + ' : '') + `AI_Modifier: ${manualMod > 0 ? '+' : ''}${manualMod}`;
        }
        if (!mathBreakdown) mathBreakdown = 'No modifiers found';

        let safeThresholds: { [key: string]: number };
        if (check.thresholds && typeof check.thresholds === 'object') {
          safeThresholds = { ...check.thresholds };
        } else if (typeof check.threshold === 'number') {
          // Convert flat threshold to proper thresholds object
          const base = check.threshold;
          const adjusted = Math.max(0, Math.min(1000, base));
          safeThresholds = {
            "Critical Success": Math.min(1000, adjusted + 200),
            "Success": adjusted,
            "Partial Success": Math.max(0, adjusted - 200)
          };
        } else {
          // No thresholds from the AI at all — use difficulty-based defaults
          safeThresholds = this.getDefaultThresholds(difficulty);
        }

        // Apply total computer bonus to lower the thresholds
        // (A bonus reduces the required roll)
        if (totalBonus !== 0) {
          const shifted: { [key: string]: number } = {};
          for (const [key, val] of Object.entries(safeThresholds)) {
            shifted[key] = Math.max(0, Math.min(1000, val - totalBonus));
          }
          safeThresholds = shifted;
        }

        // Enforce realistic failure ranges based on difficulty
        safeThresholds = this.enforceRealisticThresholds(safeThresholds, difficulty);

        // True random roll generated first on backend to eliminate AI model bias or guessing
        const roll = this.generateRandomRoll();
        const outcome = this.determineOutcome(roll, safeThresholds, difficulty);
        return {
          name: safeName,
          description: safeDesc,
          outcome: outcome,
          roll: roll,
          thresholds: safeThresholds,
          math: mathBreakdown,
          rules: detectedMods.map(m => `${m.label}: ${m.math} (${m.reasoning})`)
        };
      }));

      const resultReport = results.map(r =>
        `Check: ${r.name}\nReason: ${r.description}\nRoll: ${r.roll} / 1000\nMath: ${r.math}\nThresholds: ${JSON.stringify(r.thresholds)}\nRESULT: ${r.outcome}`
      ).join('\n\n');

      const fullDetailsHtml = results.map(r =>
        `[Probability Check: ${r.name} - Result: ${r.outcome} | Roll: ${r.roll}/1000 | Math: ${r.math} | Thresholds: ${JSON.stringify(r.thresholds).replace(/"/g, '&quot;')}]`
      ).join(' ');

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Engine Results]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the highly detailed narrative and extensive file updates. Calculate exact dynamic outcomes (e.g., damage = base * probability result) WITHOUT using dice notation. 
      CRITICAL: You MUST include the exact text "${fullDetailsHtml}" at the very beginning or end of your narrative so the player can click to see the full mathematical details. Do not alter the formatting of that string. Include the Check Name and Result (e.g. "[Jump: Failure]") natively in the narrative text as well.
      DYNAMIC STAT & HEALTH UPDATES (WHEN APPLICABLE):
      - If this action results in damage, injury, or healing, dynamically update the affected character/entity file(s) in 'files' with their new Health calculated in [STATS & MODIFIERS] and include the stat change in the 'updates' array.
      - If this action genuinely consumes stamina, mana, or energy (from noticeable physical exertion, combat, or spellcasting), or restores energy (from resting/sleeping), dynamically update the character's file with their new Energy/Mana/Stamina value in [STATS & MODIFIERS] and include the stat change in the 'updates' array. Do NOT deduct energy for menial, low-effort tasks like talking, standing, observing, or casual interactions.`;

      // We make a fresh call with the context combined, as we don't maintain a full chat history object here 
      // (The FS is the history source of truth).
      responseText = await this.callAI(followUpPrompt, undefined, modelName);
      try {
        data = this.extractJSON(responseText);
        if (data && fullDetailsHtml && (!data.narrative || !data.narrative.includes('[Probability Check:'))) {
          data.narrative = `${fullDetailsHtml}\n\n${data.narrative || ''}`.trim();
        }
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { narrative: "Error processing check results." };
      }
    }

    await this.processResponseData(data, username, auditContext, userPrompt);
    if (this.lastActionUsage) {
      data.usage = { ...this.lastActionUsage };
    }
    return data;
  }

  private sanitizeJSON(raw: string): string {
    let result = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escape) {
          result += char;
          escape = false;
        } else if (char === '\\') {
          result += char;
          escape = true;
        } else if (char === '"') {
          result += char;
          inString = false;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        if (char === '"') {
          result += char;
          inString = true;
        } else {
          result += char;
        }
      }
    }
    if (escape) result += '\\';
    if (inString) result += '"';
    return result;
  }

  private extractJSON(text: string): any {
    if (!text || typeof text !== 'string') {
      throw new Error("Invalid or empty input text");
    }

    // 1. Direct parse attempt
    try {
      return JSON.parse(text);
    } catch (e) { }

    // 2. Clear Markdown blocks if present
    let cleanText = text.trim();
    const mdMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (mdMatch) {
      try {
        return JSON.parse(mdMatch[1]);
      } catch (e) { }
      cleanText = mdMatch[1].trim();
    }

    // 3. Find beginning of JSON structure
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }

    if (startIdx === -1) {
      throw new Error("No JSON structure found");
    }

    const rawCandidate = cleanText.substring(startIdx);

    // Auto-closer helper function: escapes control characters and balances unclosed strings, brackets, and braces
    const autoCloseAndSanitize = (input: string): string => {
      let result = '';
      let inString = false;
      let escape = false;
      const stack: string[] = [];

      for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inString) {
          if (escape) {
            result += char;
            escape = false;
          } else if (char === '\\') {
            result += char;
            escape = true;
          } else if (char === '"') {
            result += char;
            inString = false;
          } else if (char === '\n') {
            result += '\\n';
          } else if (char === '\r') {
            result += '\\r';
          } else if (char === '\t') {
            result += '\\t';
          } else {
            result += char;
          }
        } else {
          if (char === '"') {
            result += char;
            inString = true;
          } else if (char === '{') {
            stack.push('}');
            result += char;
          } else if (char === '[') {
            stack.push(']');
            result += char;
          } else if (char === '}') {
            if (stack.length > 0 && stack[stack.length - 1] === '}') {
              stack.pop();
            }
            result += char;
          } else if (char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ']') {
              stack.pop();
            }
            result += char;
          } else {
            result += char;
          }
        }
      }

      if (escape) {
        result += '\\';
      }

      if (inString) {
        result += '"';
      }

      // Remove any trailing commas before closing braces
      result = result.replace(/,\s*$/, '');

      // Close all open brackets/braces in reverse order
      while (stack.length > 0) {
        const closing = stack.pop()!;
        result = result.replace(/,\s*$/, '') + closing;
      }

      // Clean trailing commas before } or ]
      result = result.replace(/,(\s*[}\]])/g, '$1');

      return result;
    };

    // Attempt A: Auto-close and sanitize directly
    try {
      const fixed = autoCloseAndSanitize(rawCandidate);
      return JSON.parse(fixed);
    } catch (e) { }

    // Attempt B: Trim to last } or ] if there is trailing commentary or extra text
    const lastBrace = rawCandidate.lastIndexOf('}');
    const lastBracket = rawCandidate.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);
    if (endIdx > 0) {
      const bounded = rawCandidate.substring(0, endIdx + 1);
      try {
        const fixed = autoCloseAndSanitize(bounded);
        return JSON.parse(fixed);
      } catch (e) { }
    }

    // Attempt C: Progressive trimming of trailing } in case of extra braces
    let candidate = rawCandidate;
    for (let attempt = 0; attempt < 5; attempt++) {
      const lb = candidate.lastIndexOf('}');
      if (lb <= 0) break;
      candidate = candidate.substring(0, lb);
      try {
        const fixed = autoCloseAndSanitize(candidate);
        return JSON.parse(fixed);
      } catch (e) { }
    }

    // Attempt D: Fix unquoted property keys or dropped quotes
    try {
      const repaired = rawCandidate
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        .replace(/,(\s*[}\]])/g, '$1');
      const fixed = autoCloseAndSanitize(repaired);
      return JSON.parse(fixed);
    } catch (e) { }

    // Attempt E: Resilient Regex Extraction fallback if JSON is severely damaged
    const narrativeMatch = text.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (narrativeMatch) {
      try {
        const unescapedNarrative = JSON.parse(`"${narrativeMatch[1]}"`);
        return {
          narrative: unescapedNarrative,
          updates: [],
          checks: [],
          recommendations: [],
          gameOver: false,
          files: {}
        };
      } catch (e) { }
    }

    throw new Error("Failed to extract valid JSON");
  }

  /**
   * Generates a truly unbiased, cryptographically random integer in [0, 1000] inclusive.
   * Runs directly on the backend/client engine runtime FIRST before any AI evaluation or outcome calculation.
   * Completely eliminates AI model bias, number hallucination, or guessing.
   */
  public generateRandomRoll(): number {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      // Uniform 32-bit float in [0, 1) scaled to 0-1000 inclusive (1001 possible integer outcomes)
      return Math.floor((buf[0] / 4294967296) * 1001);
    }
    return Math.floor(Math.random() * 1001);
  }

  private determineOutcome(roll: number, thresholds: { [outcome: string]: number }, difficulty: string = 'moderate'): string {
    if (!thresholds || typeof thresholds !== 'object') {
      return roll >= 500 ? "Success" : "Failure";
    }

    const sorted = Object.entries(thresholds)
      .sort(([, valA], [, valB]) => valB - valA);

    for (const [outcome, minVal] of sorted) {
      if (roll >= minVal) return outcome;
    }

    // Below all thresholds: determine Critical Failure vs Failure
    const lowestThreshold = sorted.length > 0 ? sorted[sorted.length - 1][1] : 500;

    // Check if the AI explicitly provided a "Failure" tier
    // If it did, and we are below all thresholds (including Failure), then it's a Critical Failure
    const hasExplicitFailure = Object.keys(thresholds).some(k => k.toLowerCase() === 'failure');
    if (hasExplicitFailure) {
      return "Critical Failure";
    }

    // Dynamic Critical Failure Range based on Difficulty
    // The higher the difficulty, the larger the proportion of the failure range that is "critical"
    const critFailPercentages: { [key: string]: number } = {
      'trivial': 0.05,        // 5% of failure range
      'easy': 0.10,           // 10% of failure range
      'moderate': 0.15,       // 15% of failure range
      'hard': 0.25,           // 25% of failure range
      'very_hard': 0.40,      // 40% of failure range
      'near_impossible': 0.60 // 60% of failure range
    };

    const percentage = critFailPercentages[difficulty] ?? 0.15;
    const critFailCutoff = Math.floor(lowestThreshold * percentage);

    // Absolute Floor: Rolls below this are ALWAYS Critical Failures regardless of thresholds/stats
    const absoluteFumbleFloors: { [key: string]: number } = {
      'trivial': 10,
      'easy': 25,
      'moderate': 40,
      'hard': 60,
      'very_hard': 100,
      'near_impossible': 150
    };

    // Context-based tweak: Ensure a minimum absolute floor for critical failures
    const minFloors: { [key: string]: number } = {
      'trivial': 25,
      'easy': 40,
      'moderate': 60,
      'hard': 100,
      'very_hard': 150,
      'near_impossible': 200
    };
    const minFloor = minFloors[difficulty] ?? 50;
    const fumbleFloor = absoluteFumbleFloors[difficulty] ?? 30;

    // Outcome determination
    if (roll <= fumbleFloor || roll <= Math.max(minFloor, critFailCutoff)) {
      return "Critical Failure";
    }
    return "Failure";
  }

  /**
   * Returns default threshold values when the AI provides none,
   * based on the action's difficulty tier.
   */
  private getDefaultThresholds(difficulty: string): { [key: string]: number } {
    switch (difficulty) {
      case 'trivial':
        return { "Critical Success": 900, "Success": 150, "Partial Success": 75 };
      case 'easy':
        return { "Critical Success": 900, "Success": 300, "Partial Success": 150 };
      case 'moderate':
        return { "Critical Success": 850, "Success": 500, "Partial Success": 300 };
      case 'hard':
        return { "Critical Success": 950, "Success": 700, "Partial Success": 500 };
      case 'very_hard':
        return { "Critical Success": 975, "Success": 800, "Partial Success": 650 };
      case 'near_impossible':
        return { "Critical Success": 995, "Success": 900, "Partial Success": 800 };
      default:
        return { "Critical Success": 850, "Success": 500, "Partial Success": 300 };
    }
  }

  /**
   * Enforces realistic failure ranges on the AI-provided thresholds.
   * The AI tends to set thresholds too low, making almost everything succeed.
   * This applies minimum threshold floors based on difficulty so there's always
   * a meaningful chance of failure for non-trivial tasks.
   */
  private enforceRealisticThresholds(
    thresholds: { [key: string]: number },
    difficulty: string
  ): { [key: string]: number } {
    // Minimum "Success" threshold floors per difficulty (Realism Tuning)
    // This ensures that even with huge bonuses, the game remains challenging.
    const minSuccessFloors: { [key: string]: number } = {
      'trivial': 150,       // 15% fail minimum (was 10%)
      'easy': 250,          // 25% fail minimum (was 20%)  
      'moderate': 400,      // 40% fail minimum (was 35%)
      'hard': 600,          // 60% fail minimum (was 50%)
      'very_hard': 750,     // 75% fail minimum (was 65%)
      'near_impossible': 900 // 90% fail minimum (was 80%)
    };

    const floor = minSuccessFloors[difficulty] ?? 350; // default to moderate

    // Find the "Success" threshold (or closest equivalent)
    const successKey = Object.keys(thresholds).find(k =>
      k.toLowerCase().includes('success') && !k.toLowerCase().includes('critical') && !k.toLowerCase().includes('partial')
    ) || 'Success';

    const currentSuccess = thresholds[successKey];
    if (currentSuccess !== undefined && currentSuccess < floor) {
      // The AI set the threshold too low — raise it to the floor
      const boost = floor - currentSuccess;
      // Shift ALL thresholds up by the same amount to maintain relative spacing
      const adjusted: { [key: string]: number } = {};
      for (const [key, val] of Object.entries(thresholds)) {
        adjusted[key] = Math.min(1000, val + boost);
      }
      return adjusted;
    }

    return thresholds;
  }

  /**
   * Helper to locate the player character file from either an incoming files object or the local file system.
   */
  private findPlayerCharacterFile(username?: string, filesObj?: any): string | null {
    const listFromFiles = filesObj ? Object.keys(filesObj) : [];
    const listFromFs = this.fs.list();
    const candidateFiles = Array.from(new Set([...listFromFiles, ...listFromFs]));

    if (username) {
      const cleanUser = username.replace(/\s*\(guest\)$/i, '').trim().toLowerCase();
      const rawUser = username.trim().toLowerCase();
      
      // 1. Direct filename prefix or suffix matches
      const match = candidateFiles.find(f => {
        if (!f.endsWith('.txt')) return false;
        if (f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt' || f.endsWith('-npc.txt')) return false;
        const lower = f.toLowerCase();
        const base = lower.replace(/\.txt$/, '').trim();
        return base === rawUser ||
               base === cleanUser ||
               base.startsWith(`${rawUser}-`) ||
               base.startsWith(`${rawUser}_`) ||
               base.startsWith(`${cleanUser}-`) ||
               base.startsWith(`${cleanUser}_`) ||
               lower.endsWith(`-${rawUser}.txt`) ||
               lower.endsWith(`_${rawUser}.txt`) ||
               lower.endsWith(` ${rawUser}.txt`) ||
               lower.endsWith(`-${cleanUser}.txt`) ||
               lower.endsWith(`_${cleanUser}.txt`) ||
               lower.endsWith(` ${cleanUser}.txt`) ||
               base.endsWith(cleanUser);
      });
      if (match) return match;

      // 2. Substring match
      const subMatch = candidateFiles.find(f => {
        if (!f.endsWith('.txt')) return false;
        if (f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt' || f.endsWith('-npc.txt')) return false;
        const base = f.replace(/\.txt$/, '').toLowerCase();
        return base.includes(cleanUser) || cleanUser.includes(base);
      });
      if (subMatch) return subMatch;

      // 3. Search file contents for character name or Player: username
      for (const f of candidateFiles) {
        if (!f.endsWith('.txt') || f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt' || f.endsWith('-npc.txt')) continue;
        const content = filesObj && filesObj[f]
          ? (typeof filesObj[f] === 'string' ? filesObj[f] : filesObj[f].content)
          : this.fs.read(f);
        if (typeof content === 'string') {
          const lowerContent = content.toLowerCase();
          if (
            lowerContent.includes(`player: ${cleanUser}`) ||
            lowerContent.includes(`player: "${cleanUser}"`) ||
            lowerContent.includes(`full name: ${cleanUser}`) ||
            (lowerContent.includes(cleanUser) && (content.includes('[STATS & MODIFIERS]') || content.includes('[NAME & DESCRIPTION]')))
          ) {
            return f;
          }
        }
      }
    }

    // Fallback: search for character files (has [NAME & DESCRIPTION] or [STATS & MODIFIERS] with Energy/Mana/Stamina)
    const characterFile = candidateFiles.find(f => {
      if (!f.endsWith('.txt')) return false;
      if (f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt' || f.startsWith('Map_') || f.startsWith('temp_') || f.startsWith('debug_')) return false;
      const content = filesObj && filesObj[f]
        ? (typeof filesObj[f] === 'string' ? filesObj[f] : filesObj[f].content)
        : this.fs.read(f);
      return typeof content === 'string' &&
             (content.includes('[STATS & MODIFIERS]') || content.includes('[NAME & DESCRIPTION]') || content.includes('Energy/Mana/Stamina:'));
    });

    return characterFile || null;
  }

  /**
   * Finds a character or entity file by character name, entity name, or filename.
   * Checks both filesObj (incoming files) and this.fs (disk files).
   */
  private findCharacterOrEntityFile(name?: string, filesObj?: any): string | null {
    if (!name) return null;
    const cleanName = name.trim().toLowerCase();
    const listFromFiles = filesObj ? Object.keys(filesObj) : [];
    const listFromFs = this.fs.list();
    const candidateFiles = Array.from(new Set([...listFromFiles, ...listFromFs]));

    // 1. Direct filename matches
    const directMatch = candidateFiles.find(f => {
      if (!f.endsWith('.txt')) return false;
      const base = f.replace(/\.txt$/, '').toLowerCase();
      return base === cleanName || base.split('-')[0].trim() === cleanName || base.split('_')[0].trim() === cleanName;
    });
    if (directMatch) return directMatch;

    // 2. Substring filename match
    const subMatch = candidateFiles.find(f => {
      if (!f.endsWith('.txt')) return false;
      if (f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt') return false;
      const base = f.replace(/\.txt$/, '').toLowerCase();
      return base.includes(cleanName) || cleanName.includes(base);
    });
    if (subMatch) return subMatch;

    // 3. Search file contents for character name or group entity reference
    for (const f of candidateFiles) {
      if (!f.endsWith('.txt')) continue;
      if (f === 'WorldRules.txt' || f === 'Guide.txt' || f === 'WorldTime.txt') continue;
      const content = filesObj && filesObj[f]
        ? (typeof filesObj[f] === 'string' ? filesObj[f] : filesObj[f].content)
        : this.fs.read(f);
      if (typeof content === 'string') {
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes(cleanName) && (content.includes('[STATS & MODIFIERS]') || content.includes('[NAME & DESCRIPTION]') || content.includes('Health') || content.includes('HP'))) {
          return f;
        }
      }
    }

    return null;
  }

  /**
   * Parses current and max Health from character file text.
   * If charName is specified, attempts to find that character's specific health in a group file first.
   */
  private parseCharacterHealth(content: string, charName?: string): { prefix: string; current: number; max: number; suffix: string; rawLine: string } | null {
    if (!content) return null;
    const lines = content.split('\n');

    // 1. If charName is specified, search for character-specific section or line in group file
    if (charName) {
      const lowerName = charName.trim().toLowerCase();
      let inCharSection = false;

      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes(lowerName)) {
          // Check for inline health e.g. - Goblin A: Health 15/15, - Goblin A: Health -10/15
          const inlineMatch = line.match(/(\b(?:Health|HP|Hit\s*Points)[:=\s]+)([+-]?\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(.*)$/i);
          if (inlineMatch) {
            const current = parseFloat(inlineMatch[2]);
            const max = parseFloat(inlineMatch[3]);
            if (!isNaN(current) && !isNaN(max)) {
              return {
                prefix: inlineMatch[1],
                current,
                max,
                suffix: inlineMatch[4] || '',
                rawLine: line
              };
            }
          }
          inCharSection = true;
          continue;
        }

        if (inCharSection) {
          if (line.startsWith('#') || (line.startsWith('- ') && line.includes(':') && !line.toLowerCase().includes('health') && !line.toLowerCase().includes('hp') && !line.toLowerCase().includes('status') && !line.toLowerCase().includes('energy'))) {
            inCharSection = false;
          } else {
            const secMatch = line.match(/^(\s*[-*•]?\s*(?:Current\s+)?(?:Health|HP|Hit\s*Points)(?:\s*\([^)]*\))?\s*[:=]\s*)([+-]?\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(.*)$/i);
            if (secMatch) {
              const current = parseFloat(secMatch[2]);
              const max = parseFloat(secMatch[3]);
              if (!isNaN(current) && !isNaN(max)) {
                return {
                  prefix: secMatch[1],
                  current,
                  max,
                  suffix: secMatch[4] || '',
                  rawLine: line
                };
              }
            }
          }
        }
      }
    }

    // 2. Standard character health parsing (supports negative current health e.g. -15 / 100)
    for (const line of lines) {
      const match = line.match(/^(\s*[-*•]?\s*(?:Current\s+)?(?:Health|HP|Hit\s*Points)(?:\s*\([^)]*\))?\s*[:=]\s*)([+-]?\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(.*)$/i);
      if (match) {
        const current = parseFloat(match[2]);
        const max = parseFloat(match[3]);
        if (!isNaN(current) && !isNaN(max)) {
          return {
            prefix: match[1],
            current,
            max,
            suffix: match[4] || '',
            rawLine: line
          };
        }
      }
    }

    return null;
  }

  /**
   * Replaces or inserts the Health line in character file content with new current value,
   * applying the full dynamic health state machine:
   * - 0 HP Unconsciousness (5-minute duration + living modifiers like Constitution/Willpower/Survival).
   * - Lethal unconscious strike (taking >= 15% max HP damage while at 0 HP causes instant death).
   * - Massive damage overkill (taking >= 1.5x current HP damage causes instant death).
   * - Dead character retention & gradual decomposition/rot based on WorldTime.txt.
   * - Recovery back to consciousness when healed above 0 HP.
   */
  private updateCharacterHealthInContent(
    content: string,
    newCurrent: number,
    injuryNote?: string,
    bodyPart?: string,
    charName?: string,
    options?: {
      damageDealt?: number;
      previousHP?: number;
      worldTimeStr?: string;
      isMassiveDamage?: boolean;
      isLethalUnconsciousStrike?: boolean;
    }
  ): { updatedContent: string; isUnconscious: boolean; isDead: boolean; deathReason?: string } {
    const parsed = this.parseCharacterHealth(content, charName);
    let updated = content;
    // Health CAN GO NEGATIVE to track status, trauma, and overkill even while dead/unconscious!
    const targetHP = Math.round(newCurrent);
    const maxHP = parsed?.max || 100;
    const previousHP = options?.previousHP !== undefined ? options.previousHP : (parsed ? parsed.current : newCurrent);
    const damageDealt = options?.damageDealt !== undefined ? options.damageDealt : (previousHP - targetHP > 0 ? previousHP - targetHP : 0);

    const lowerContent = content.toLowerCase();
    const isImmortal = lowerContent.includes('immortal') || lowerContent.includes('undying') || lowerContent.includes('death ward');
    const isNonBiological = lowerContent.includes('construct') || lowerContent.includes('golem') || lowerContent.includes('automaton') || lowerContent.includes('undead') || lowerContent.includes('ghost') || lowerContent.includes('skeleton');

    let isDead = false;
    let isUnconscious = false;
    let deathReason: string | undefined;

    const wasDead = lowerContent.includes('status: dead') || lowerContent.includes('(dead)');
    const wasUnconscious = (lowerContent.includes('status: unconscious') || lowerContent.includes('(unconscious')) || previousHP <= 0;

    if (wasDead) {
      // Already dead: subsequent damage continues reducing HP into negative numbers
      isDead = true;
      deathReason = 'Dead (Remains deceased)';
    }
    // A) Massive damage overkill threshold: damage >= 1.5x previous/current HP (skips unconscious, automatically dead)
    else if (!isImmortal && (options?.isMassiveDamage || (damageDealt > 0 && previousHP > 0 && damageDealt >= (1.5 * previousHP)))) {
      isDead = true;
      deathReason = `Instant death: Massive trauma / overkill of ${damageDealt} damage dealt vs ${previousHP} current HP (exceeds 1.5x current HP threshold)`;
    }
    // B) Lethal strike while Unconscious at <= 0 HP: damage >= 15% of max HP
    else if (!isImmortal && (options?.isLethalUnconsciousStrike || (wasUnconscious && damageDealt > 0 && damageDealt >= (maxHP * 0.15)))) {
      const lethalThreshold = Math.round(maxHP * 0.15 * 10) / 10;
      isDead = true;
      deathReason = `Instant death: Lethal damage of ${damageDealt} dealt while unconscious at ${previousHP} HP (exceeds 15% max HP threshold [${lethalThreshold}])`;
    }
    // C) Health reaches 0 or negative without instant overkill
    else if (targetHP <= 0) {
      if (isNonBiological) {
        isDead = true;
        deathReason = 'Deactivated / destroyed at 0 or negative HP';
      } else {
        isUnconscious = true;
      }
    }

    // Determine current active WorldTime string
    const worldTimeStr = options?.worldTimeStr || this.fs.read('WorldTime.txt') || '';

    // Calculate effective unconscious duration (base 5 minutes + context modifiers)
    let effectiveDurationMinutes = 5;
    let unconsciousExpirationTimestamp = '';

    if (isUnconscious) {
      let conMod = 0;
      const conM = content.match(/(?:Constitution|CON|Endurance|Toughness)[:=\s]+([+-]?\d+)/i);
      if (conM) {
        const v = parseInt(conM[1], 10);
        conMod = v > 20 ? Math.floor((v - 10) / 2) : v;
      }
      let willMod = 0;
      const willM = content.match(/(?:Willpower|WILL)[:=\s]+([+-]?\d+)/i);
      if (willM) {
        const v = parseInt(willM[1], 10);
        willMod = v > 20 ? Math.floor((v - 10) / 2) : v;
      }
      let survMod = 0;
      const survM = content.match(/(?:Survival)[:=\s]+([+-]?\d+)/i);
      if (survM) {
        const v = parseInt(survM[1], 10);
        survMod = v > 20 ? Math.floor((v - 10) / 2) : v;
      }
      let penaltyMinutes = 0;
      if (lowerContent.includes('bleeding') || lowerContent.includes('severe hemorrhage') || lowerContent.includes('venom') || lowerContent.includes('hypothermia') || lowerContent.includes('drowning')) {
        penaltyMinutes = 1.5;
      }

      const totalBonus = (conMod * 1.0) + (willMod * 0.5) + (survMod * 0.5) - penaltyMinutes;
      effectiveDurationMinutes = Math.max(1, Math.round((5 + totalBonus) * 10) / 10);

      // Compute expiration timestamp
      if (worldTimeStr) {
        try {
          const cleanTime = worldTimeStr.replace(/\[CURRENT ACTIVE TIME\]/i, '').replace(/Timestamp:\s*/i, '').trim();
          const parts = cleanTime.split(' - ');
          const baseDate = parts.length === 2 ? new Date(`${parts[1]} ${parts[0]}`) : new Date(cleanTime);
          if (!isNaN(baseDate.getTime())) {
            const expDate = new Date(baseDate.getTime() + effectiveDurationMinutes * 60 * 1000);
            const timePart = expDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
            const datePart = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            unconsciousExpirationTimestamp = `${timePart} - ${datePart}`;
          }
        } catch {}
      }
      if (!unconsciousExpirationTimestamp) {
        unconsciousExpirationTimestamp = `+${effectiveDurationMinutes}m from current WorldTime`;
      }
    }

    // Format health line and status
    let healthSuffix = '';
    if (isDead) {
      healthSuffix = ' (Dead)';
    } else if (isUnconscious) {
      healthSuffix = ` (Unconscious - ${effectiveDurationMinutes}m survival window)`;
    } else if (targetHP > 0 && injuryNote) {
      healthSuffix = ` (Injured: ${injuryNote})`;
    }

    if (parsed) {
      const updatedLine = `${parsed.prefix}${targetHP} / ${parsed.max}${healthSuffix}`;
      updated = updated.replace(parsed.rawLine, updatedLine);
    } else {
      const statsHeaderIdx = updated.indexOf('[STATS & MODIFIERS]');
      const healthLine = `\n- Health: ${targetHP} / 100${healthSuffix}`;
      if (statsHeaderIdx >= 0) {
        const insertPos = statsHeaderIdx + '[STATS & MODIFIERS]'.length;
        updated = updated.slice(0, insertPos) + healthLine + updated.slice(insertPos);
      } else {
        updated = healthLine + '\n' + updated;
      }
    }

    // Status line management
    if (isDead) {
      updated = updated.replace(/Status:\s*Unconscious[^\n\r]*/i, `Status: Dead (${deathReason || 'Slain'})`);
      if (!updated.toLowerCase().includes('status: dead')) {
        const statusHeader = updated.search(/\[STATUS EFFECTS/i);
        const statusEntry = `- Status: Dead (${deathReason || 'Slain'}; Incapacitated; Inactive)\n`;
        if (statusHeader >= 0) {
          const insertIdx = updated.indexOf('\n', statusHeader) + 1;
          updated = updated.slice(0, insertIdx) + statusEntry + updated.slice(insertIdx);
        } else {
          updated += `\n[STATUS EFFECTS & LORE]\n${statusEntry}`;
        }
      }

      // Add decomposition/rot if biological and not already present
      if (!isNonBiological && !updated.includes('Decomposition / Rot:')) {
        const stageInfo = WeightInventoryEngine.calculateDecompositionStage(worldTimeStr, worldTimeStr);
        const rotEntry = `- Decomposition / Rot: ${stageInfo.stageName} (Began: ${worldTimeStr || 'Death'}; ${stageInfo.description}; Advances with WorldTime)\n`;
        const statusHeader = updated.search(/\[STATUS EFFECTS/i);
        if (statusHeader >= 0) {
          const insertIdx = updated.indexOf('\n', statusHeader) + 1;
          updated = updated.slice(0, insertIdx) + rotEntry + updated.slice(insertIdx);
        } else {
          updated += rotEntry;
        }
      }
    } else if (isUnconscious) {
      const lethalThreshold = Math.round(maxHP * 0.15 * 10) / 10;
      const unconsciousLine = `- Status: Unconscious (Expires: ${unconsciousExpirationTimestamp}; Duration: ${effectiveDurationMinutes}m [Base 5m + Modifiers]; Trigger: HP reached 0 or below; Incapacitated; In lethal danger: taking >= 15% max HP [${lethalThreshold} damage] causes instant death; Wakes when HP > 0 or stabilized)\n`;
      if (updated.match(/Status:\s*Unconscious[^\n\r]*/i)) {
        updated = updated.replace(/Status:\s*Unconscious[^\n\r]*/i, unconsciousLine.trim());
      } else {
        const statusHeader = updated.search(/\[STATUS EFFECTS/i);
        if (statusHeader >= 0) {
          const insertIdx = updated.indexOf('\n', statusHeader) + 1;
          updated = updated.slice(0, insertIdx) + unconsciousLine + updated.slice(insertIdx);
        } else {
          updated += `\n[STATUS EFFECTS & LORE]\n${unconsciousLine}`;
        }
      }
    } else if (targetHP > 0 && wasUnconscious) {
      updated = updated.replace(/Status:\s*Unconscious[^\n\r]*/i, `- Status: Conscious (Recovered from unconscious state; Wounded)`);
    }

    // Dynamic wound / injury record in body parts or status
    if (injuryNote || bodyPart) {
      const injuryText = injuryNote || `Injured ${bodyPart || 'body'}`;
      if (updated.includes('[BODY PARTS & STATUS]') || updated.includes('[BODY PARTS')) {
        const bodyPartsHeader = updated.search(/\[BODY PARTS/i);
        if (bodyPartsHeader >= 0) {
          const nextSection = updated.indexOf('[', bodyPartsHeader + 12);
          const endPos = nextSection > 0 ? nextSection : updated.length;
          const bodySection = updated.substring(bodyPartsHeader, endPos);
          if (bodyPart && bodySection.toLowerCase().includes(bodyPart.toLowerCase())) {
            const bpRegex = new RegExp(`(^\\s*[-*•]?\\s*${bodyPart}[:=].*)$`, 'im');
            if (bpRegex.test(updated)) {
              updated = updated.replace(bpRegex, `- ${bodyPart}: ${injuryText} (Wounded)`);
            }
          } else {
            const insertIdx = updated.indexOf('\n', bodyPartsHeader) + 1;
            updated = updated.slice(0, insertIdx) + `- ${bodyPart || 'Wound'}: ${injuryText}\n` + updated.slice(insertIdx);
          }
        }
      } else if (updated.includes('[STATUS EFFECTS & LORE]') || updated.includes('[STATUS EFFECTS')) {
        const statusHeader = updated.search(/\[STATUS EFFECTS/i);
        if (statusHeader >= 0) {
          const insertIdx = updated.indexOf('\n', statusHeader) + 1;
          const effectEntry = `- Injury: ${injuryText} (${isDead ? 'Lethal' : isUnconscious ? 'Critical' : 'Active'})\n`;
          if (!updated.includes(injuryText)) {
            updated = updated.slice(0, insertIdx) + effectEntry + updated.slice(insertIdx);
          }
        }
      }
    }

    return {
      updatedContent: updated,
      isUnconscious,
      isDead,
      deathReason
    };
  }

  /**
   * Parses current and max Energy/Mana/Stamina from character file text.
   */
  private parseCharacterEnergy(content: string): { prefix: string; current: number; max: number; suffix: string; rawLine: string } | null {
    if (!content) return null;
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\s*[-*•]?\s*(?:Current\s+)?(?:Energy(?:\/(?:Mana|Stamina))*|Stamina(?:\/(?:Energy|Mana))*|Mana(?:\/(?:Energy|Stamina))*)(?:\s*\/\s*(?:Mana|Stamina|Energy))*(?:\s*\([^)]*\))?\s*[:=]\s*)(\d+(?:\.\d+)?)\s*(?:\/|\s+of\s+)\s*(\d+(?:\.\d+)?)(.*)$/i);
      if (match) {
        const current = parseFloat(match[2]);
        const max = parseFloat(match[3]);
        if (!isNaN(current) && !isNaN(max)) {
          return {
            prefix: match[1],
            current,
            max,
            suffix: match[4] || '',
            rawLine: line
          };
        }
      }
    }
    return null;
  }

  /**
   * Replaces or inserts the Energy line in character file content with new current value.
   */
  private updateCharacterEnergyInContent(content: string, newCurrent: number): string {
    const parsed = this.parseCharacterEnergy(content);
    if (parsed) {
      const clamped = Math.max(0, Math.min(parsed.max, Math.round(newCurrent)));
      const updatedLine = `${parsed.prefix}${clamped} / ${parsed.max}${parsed.suffix}`;
      return content.replace(parsed.rawLine, updatedLine);
    }

    // If no existing energy line, insert under - Health: or [STATS & MODIFIERS]
    const clamped = Math.max(0, Math.round(newCurrent));
    const healthMatch = content.match(/^(\s*[-*•]?\s*Health[:=].*)$/im);
    if (healthMatch) {
      return content.replace(healthMatch[0], `${healthMatch[0]}\n- Energy/Mana/Stamina: ${clamped} / 100`);
    }

    const statsHeaderIdx = content.indexOf('[STATS & MODIFIERS]');
    if (statsHeaderIdx >= 0) {
      const insertPos = statsHeaderIdx + '[STATS & MODIFIERS]'.length;
      return content.slice(0, insertPos) + `\n- Energy/Mana/Stamina: ${clamped} / 100` + content.slice(insertPos);
    }

    return content;
  }

  /**
   * Extracts energy delta from updates array.
   */
  private extractEnergyDeltaFromUpdates(updates: UpdateItem[]): number | null {
    if (!updates || !Array.isArray(updates)) return null;
    let totalDelta = 0;
    let found = false;

    for (const u of updates) {
      if (!u || !u.text) continue;
      const textLower = u.text.toLowerCase();
      const isEnergyRelated = textLower.includes('energy') || textLower.includes('stamina') || textLower.includes('mana');
      if (!isEnergyRelated) continue;

      if (typeof u.value === 'number' && u.value !== 0) {
        totalDelta += u.value;
        found = true;
      } else {
        // Skip current/max fraction notation like "Energy: 95/100" (not a delta)
        if (/\d+\s*\/\s*\d+/.test(u.text)) continue;

        const signedMatch = u.text.match(/([+-]\s*\d+(?:\.\d+)?)/);
        if (signedMatch) {
          const val = parseFloat(signedMatch[1].replace(/\s+/g, ''));
          if (!isNaN(val) && val !== 0) {
            totalDelta += val;
            found = true;
          }
        } else {
          const isSpent = textLower.includes('spent') || textLower.includes('cost') || textLower.includes('lost') || textLower.includes('drain') || textLower.includes('exhaust');
          const isGained = textLower.includes('restor') || textLower.includes('recov') || textLower.includes('gain') || textLower.includes('heal');
          if (isSpent || isGained) {
            const numMatch = u.text.match(/(\d+(?:\.\d+)?)/);
            if (numMatch) {
              let val = parseFloat(numMatch[1]);
              if (!isNaN(val) && val !== 0) {
                totalDelta += isSpent ? -Math.abs(val) : Math.abs(val);
                found = true;
              }
            }
          }
        }
      }
    }

    return found ? totalDelta : null;
  }

  /**
   * Extracts explicit energy changes from narrative text.
   */
  private extractEnergyDeltaFromText(text: string): number | null {
    if (!text) return null;

    // Skip current/max fraction notations like [Energy: 95/100]
    const bracketMatch = text.match(/[\[\(](?:Energy|Stamina|Mana)[:\s]*([+-]\s*\d+(?:\.\d+)?)[\]\)]/i);
    if (bracketMatch) {
      const val = parseFloat(bracketMatch[1].replace(/\s+/g, ''));
      if (!isNaN(val) && val !== 0) return val;
    }

    const spentMatch = text.match(/(?:spent|cost|costs|consumed|drained|used|lost)\s+(\d+(?:\.\d+)?)\s*(?:energy|stamina|mana|points of energy|points of stamina)/i);
    if (spentMatch) {
      const val = parseFloat(spentMatch[1]);
      if (!isNaN(val) && val > 0) return -val;
    }

    const restoreMatch = text.match(/(?:restored|recovered|gained|regained|regenerated)\s+(\d+(?:\.\d+)?)\s*(?:energy|stamina|mana|points of energy|points of stamina)/i);
    if (restoreMatch) {
      const val = parseFloat(restoreMatch[1]);
      if (!isNaN(val) && val > 0) return val;
    }

    return null;
  }

  /**
   * Automatically verifies and synchronizes character energy between updates,
   * narrative, and the character file. Guarantees that character energy is never forgotten
   * while dynamically protecting against accidental energy loss on menial/non-exertive tasks.
   */
  private syncPlayerEnergy(data: AIResponse, username?: string, auditContext?: any) {
    if (!data) return;

    // 1. Locate the player's character file
    const targetFile = this.findPlayerCharacterFile(username, data.files);
    if (!targetFile) return;

    // Existing content in file system before this turn
    const existingContent = this.fs.read(targetFile);

    // Incoming content in data.files (if provided by AI)
    let incomingFileData = data.files ? data.files[targetFile] : null;
    let incomingContent: string | null = null;
    if (incomingFileData) {
      incomingContent = typeof incomingFileData === 'string'
        ? incomingFileData
        : (typeof incomingFileData === 'object' && incomingFileData.content ? incomingFileData.content : null);
    }

    const baselineContent = existingContent || incomingContent;
    if (!baselineContent) return;

    const existingEnergy = this.parseCharacterEnergy(baselineContent);
    if (!existingEnergy) return;

    // Dynamic AI contextual evaluation: Check if the AI logic auditor determined this is a menial or non-exertive task
    const isMenialOrNonExertive = Boolean(
      auditContext?.energyAudit?.isMenialOrNonExertive === true ||
      (auditContext?.energyAudit && !auditContext.energyAudit.isEnergyAffected && (auditContext.energyAudit.expectedChange === 0 || auditContext.energyAudit.expectedChange === undefined))
    );

    // 2. Extract energy delta from updates, narrative, or auditContext
    const deltaFromUpdates = this.extractEnergyDeltaFromUpdates(data.updates || []);
    const deltaFromNarrative = this.extractEnergyDeltaFromText(data.narrative || '');
    let detectedDelta = deltaFromUpdates !== null ? deltaFromUpdates : deltaFromNarrative;

    if (detectedDelta === null && auditContext?.energyAudit && typeof auditContext.energyAudit.expectedChange === 'number') {
      detectedDelta = auditContext.energyAudit.expectedChange;
    }

    // 2b. Check if action or narrative used an ability or attack from character file with an explicit stamina/energy cost
    if (detectedDelta === null && existingContent) {
      const narrativeLower = (data.narrative || '').toLowerCase();
      const costMatches = Array.from(existingContent.matchAll(/([A-Za-z0-9\s'-]+)[:=][^\n]*(?:Stamina Cost|Energy Cost|Cost)[:\s]*(\d+(?:\.\d+)?)\s*(?:Mana|Energy|Stamina)?/gi));
      for (const m of costMatches) {
        const abilityName = m[1].replace(/^[-*•]\s*/, '').trim().toLowerCase();
        const costVal = parseFloat(m[2]);
        if (abilityName.length > 2 && costVal > 0 && narrativeLower.includes(abilityName)) {
          detectedDelta = -costVal;
          break;
        }
      }
    }

    // Dynamic Contextual Protection: If the dynamic AI audit context evaluated that this is a menial/non-exertive task,
    // protect against negative energy drain (accidental deduction in narrative, updates, or character file)
    if (isMenialOrNonExertive) {
      if (detectedDelta !== null && detectedDelta < 0) {
        detectedDelta = null;
      }
      if (data.updates && Array.isArray(data.updates)) {
        data.updates = data.updates.filter(u => {
          if (!u || !u.text) return true;
          const t = u.text.toLowerCase();
          const isEnergy = t.includes('energy') || t.includes('stamina') || t.includes('mana');
          if (isEnergy && (u.value !== undefined ? u.value < 0 : (t.includes('-') || t.includes('spent') || t.includes('cost') || t.includes('lost') || t.includes('drain')))) {
            return false;
          }
          return true;
        });
      }
    }

    // 3. Check if the AI already updated the energy in incomingContent
    if (incomingContent && existingContent) {
      const incomingEnergy = this.parseCharacterEnergy(incomingContent);
      if (incomingEnergy && incomingEnergy.current !== existingEnergy.current) {
        // If dynamic contextual audit determined the action is menial/non-exertive, but incoming content decreased energy:
        if (isMenialOrNonExertive && incomingEnergy.current < existingEnergy.current) {
          const restoredContent = this.updateCharacterEnergyInContent(incomingContent, existingEnergy.current);
          if (typeof data.files![targetFile] === 'object' && (data.files![targetFile] as any).content !== undefined) {
            (data.files![targetFile] as any).content = restoredContent;
          } else {
            data.files![targetFile] = restoredContent;
          }
          return;
        }

        // AI already properly updated energy in the character file
        const actualDelta = incomingEnergy.current - existingEnergy.current;
        if (data.updates && Array.isArray(data.updates)) {
          const hasEnergyUpdate = data.updates.some(u =>
            u.text && (u.text.toLowerCase().includes('energy') || u.text.toLowerCase().includes('stamina') || u.text.toLowerCase().includes('mana'))
          );
          if (!hasEnergyUpdate) {
            data.updates.push({
              type: 'stat',
              text: `Energy ${actualDelta > 0 ? '+' : ''}${actualDelta}`,
              value: actualDelta
            });
          }
        }
        return;
      }
    }

    // 4. If AI forgot to update the file but an energy delta occurred:
    if (detectedDelta !== null && detectedDelta !== 0) {
      const newCurrent = Math.max(0, Math.min(existingEnergy.max, Math.round(existingEnergy.current + detectedDelta)));

      if (incomingContent) {
        // Character file was in data.files, update its energy line
        const updatedContent = this.updateCharacterEnergyInContent(incomingContent, newCurrent);
        if (typeof data.files![targetFile] === 'object' && (data.files![targetFile] as any).content !== undefined) {
          (data.files![targetFile] as any).content = updatedContent;
        } else {
          data.files![targetFile] = updatedContent;
        }
      } else {
        // Character file was omitted from data.files: read existing, update, and add to data.files
        if (existingContent) {
          const updatedContent = this.updateCharacterEnergyInContent(existingContent, newCurrent);
          if (!data.files || typeof data.files !== 'object') data.files = {};
          data.files[targetFile] = updatedContent;
        }
      }

      // Ensure data.updates has the update item
      if (data.updates && Array.isArray(data.updates) && deltaFromUpdates === null) {
        data.updates.push({
          type: 'stat',
          text: `Energy ${detectedDelta > 0 ? '+' : ''}${detectedDelta}`,
          value: detectedDelta
        });
      }

      // 5. If Guide.txt is present, synchronize the Master Stat Table
      const guideKey = data.files && data.files['Guide.txt'] ? 'Guide.txt' : (this.fs.read('Guide.txt') ? 'Guide.txt' : null);
      if (guideKey) {
        const rawGuide = data.files && data.files['Guide.txt']
          ? (typeof data.files['Guide.txt'] === 'string' ? data.files['Guide.txt'] : (data.files['Guide.txt'] as any).content)
          : this.fs.read('Guide.txt');

        if (typeof rawGuide === 'string' && rawGuide.length > 0) {
          const charBaseName = targetFile.replace(/\.txt$/, '').split('-')[0].trim();
          if (charBaseName && rawGuide.includes(charBaseName)) {
            const lines = rawGuide.split('\n');
            let modifiedGuide = false;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.includes(charBaseName) && (line.includes('|') || line.toLowerCase().includes('energy'))) {
                const energyPattern = /(\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b)/g;
                const matches = Array.from(line.matchAll(energyPattern));
                if (matches.length >= 2) {
                  const secondMatch = matches[1];
                  const oldEnergyStr = secondMatch[0];
                  const maxVal = oldEnergyStr.split('/')[1].trim();
                  lines[i] = line.replace(oldEnergyStr, `${newCurrent}/${maxVal}`);
                  modifiedGuide = true;
                } else if (line.toLowerCase().includes('energy')) {
                  const singleMatch = line.match(/(energy[:=\s]+)(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/i);
                  if (singleMatch) {
                    const maxVal = singleMatch[3] || existingEnergy.max;
                    lines[i] = line.replace(singleMatch[0], `Energy: ${newCurrent}/${maxVal}`);
                    modifiedGuide = true;
                  }
                }
              }
            }
            if (modifiedGuide) {
              const updatedGuide = lines.join('\n');
              if (!data.files || typeof data.files !== 'object') data.files = {};
              if (typeof data.files['Guide.txt'] === 'object' && (data.files['Guide.txt'] as any).content !== undefined) {
                (data.files['Guide.txt'] as any).content = updatedGuide;
              } else {
                data.files['Guide.txt'] = updatedGuide;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Extracts health changes from updates array.
   */
  private extractHealthDeltasFromUpdates(updates: UpdateItem[]): { target?: string; delta: number; type: 'damage' | 'heal' }[] {
    if (!updates || !Array.isArray(updates)) return [];
    const deltas: { target?: string; delta: number; type: 'damage' | 'heal' }[] = [];

    for (const u of updates) {
      const text = (u.text || '').toLowerCase();
      const val = typeof u.value === 'number' ? u.value : null;

      if (u.type === 'stat' || u.category === 'health' || text.includes('health') || text.includes('hp') || text.includes('damage')) {
        if (val !== null && val !== 0 && (u.category === 'health' || text.includes('health') || text.includes('hp'))) {
          let target: string | undefined;
          const colonIdx = u.text.indexOf(':');
          if (colonIdx > 0 && !u.text.toLowerCase().startsWith('health') && !u.text.toLowerCase().startsWith('hp')) {
            target = u.text.substring(0, colonIdx).trim();
          }
          deltas.push({
            target,
            delta: val,
            type: val < 0 ? 'damage' : 'heal'
          });
          continue;
        }

        const numMatch = u.text.match(/([+-]?\s*\d+(?:\.\d+)?)\s*(?:health|hp|damage)/i) ||
                         u.text.match(/(?:health|hp|damage)[:\s]*([+-]?\s*\d+(?:\.\d+)?)/i);
        if (numMatch) {
          const extracted = parseFloat(numMatch[1].replace(/\s+/g, ''));
          if (!isNaN(extracted) && extracted !== 0) {
            const isDamage = text.includes('damage') || text.includes('hurt') || text.includes('wound') || extracted < 0;
            const delta = isDamage ? -Math.abs(extracted) : Math.abs(extracted);
            let target: string | undefined;
            const colonIdx = u.text.indexOf(':');
            if (colonIdx > 0 && !u.text.toLowerCase().startsWith('health') && !u.text.toLowerCase().startsWith('hp')) {
              target = u.text.substring(0, colonIdx).trim();
            }
            deltas.push({
              target,
              delta,
              type: delta < 0 ? 'damage' : 'heal'
            });
          }
        }
      }
    }

    return deltas;
  }

  /**
   * Reconciles character and entity Health, damage, and healing dynamically when detected.
   * Only updates health when damage or healing actually occurs.
   */
  private syncCharacterHealth(data: AIResponse, username?: string, auditContext?: any) {
    if (!data) return;

    // 1. Gather all damage / healing events dynamically detected by AI
    const healthEvents: {
      target?: string;
      targetFile?: string;
      delta: number;
      type: 'damage' | 'heal';
      damageType?: string;
      bodyPart?: string;
      injury?: string;
    }[] = [];

    // From auditContext (Phase 1 logic audit)
    if (auditContext?.healthAudit?.damageAndHealing && Array.isArray(auditContext.healthAudit.damageAndHealing)) {
      for (const ev of auditContext.healthAudit.damageAndHealing) {
        if (ev && typeof ev.amount === 'number' && ev.amount > 0) {
          const delta = ev.type === 'heal' ? ev.amount : -Math.abs(ev.amount);
          healthEvents.push({
            target: ev.target,
            targetFile: ev.targetFile,
            delta,
            type: ev.type || 'damage',
            damageType: ev.damageType,
            bodyPart: ev.bodyPart,
            injury: ev.injury,
            isMassiveDamage: (ev as any).isMassiveDamage,
            isLethalUnconsciousStrike: (ev as any).isLethalUnconsciousStrike
          });
        }
      }
    }

    // From data.healthTransactions
    if (data.healthTransactions && Array.isArray(data.healthTransactions)) {
      for (const tx of data.healthTransactions) {
        if (tx && typeof tx.amount === 'number' && tx.amount > 0) {
          const delta = tx.operation === 'heal' ? tx.amount : -Math.abs(tx.amount);
          healthEvents.push({
            target: tx.target,
            delta,
            type: tx.operation || 'damage',
            damageType: tx.damageType,
            bodyPart: tx.bodyPart,
            injury: tx.injury,
            isMassiveDamage: (tx as any).isMassiveDamage,
            isLethalUnconsciousStrike: (tx as any).isLethalUnconsciousStrike
          });
        }
      }
    }

    // From data.updates
    if (data.updates && Array.isArray(data.updates)) {
      const updateDeltas = this.extractHealthDeltasFromUpdates(data.updates);
      for (const ud of updateDeltas) {
        const exists = healthEvents.some(h => 
          (!ud.target || !h.target || h.target.toLowerCase() === ud.target.toLowerCase()) &&
          Math.sign(h.delta) === Math.sign(ud.delta) &&
          Math.abs(h.delta) === Math.abs(ud.delta)
        );
        if (!exists) {
          healthEvents.push(ud);
        }
      }
    }

    if (healthEvents.length === 0) return;

    // 2. Process each event and reconcile character health
    const playerFile = this.findPlayerCharacterFile(username, data.files);

    for (const event of healthEvents) {
      let targetFile = event.targetFile;
      if (!targetFile && event.target) {
        targetFile = this.findCharacterOrEntityFile(event.target, data.files);
      }
      if (!targetFile) {
        targetFile = playerFile || null;
      }
      if (!targetFile) continue;

      // Determine baseline content
      const baselineContent = this.fs.read(targetFile);
      const incomingRaw = data.files && data.files[targetFile]
        ? (typeof data.files[targetFile] === 'string' ? data.files[targetFile] : (data.files[targetFile] as any).content)
        : null;

      const existingContent = incomingRaw || baselineContent;
      if (!existingContent || typeof existingContent !== 'string') continue;

      const existingHealth = this.parseCharacterHealth(baselineContent || existingContent, event.target);
      if (!existingHealth) continue;

      let alreadyUpdated = false;
      let newCurrent = existingHealth.current;

      if (incomingRaw && typeof incomingRaw === 'string' && baselineContent) {
        const incomingHealth = this.parseCharacterHealth(incomingRaw, event.target);
        if (incomingHealth) {
          if (event.delta < 0 && incomingHealth.current < existingHealth.current) {
            alreadyUpdated = true;
            newCurrent = incomingHealth.current;
          } else if (event.delta > 0 && incomingHealth.current > existingHealth.current) {
            alreadyUpdated = true;
            newCurrent = incomingHealth.current;
          }
        }
      }

      const previousHP = existingHealth.current;
      const damageDealt = event.delta < 0 ? Math.abs(event.delta) : 0;

      if (!alreadyUpdated) {
        // The AI forgot to update health or omitted the file! Auto-correct it without clamping to 0 (supports negative HP)
        newCurrent = Math.min(existingHealth.max, Math.round(existingHealth.current + event.delta));
      }

      const activeWorldTime = this.fs.read('WorldTime.txt') || undefined;
      const healthRes = this.updateCharacterHealthInContent(
        incomingRaw || existingContent,
        newCurrent,
        event.injury || (event.delta < 0 ? `${Math.abs(event.delta)} damage taken` : undefined),
        event.bodyPart,
        event.target,
        {
          damageDealt,
          previousHP,
          worldTimeStr: activeWorldTime,
          isMassiveDamage: event.isMassiveDamage,
          isLethalUnconsciousStrike: event.isLethalUnconsciousStrike
        }
      );

      if (!data.files || typeof data.files !== 'object') data.files = {};
      if (typeof data.files[targetFile] === 'object' && (data.files[targetFile] as any).content !== undefined) {
        (data.files[targetFile] as any).content = healthRes.updatedContent;
      } else {
        data.files[targetFile] = healthRes.updatedContent;
      }

      // Check if player died -> gameOver (CRITICAL: Only if confirmed DEAD, not unconscious!)
      const isTargetPlayer = targetFile === playerFile || (username && targetFile.toLowerCase().includes(username.toLowerCase()));
      if (isTargetPlayer) {
        if (healthRes.isDead) {
          data.gameOver = true;
        } else if (data.gameOver && !healthRes.isDead) {
          data.gameOver = false;
        }
      }

      // Ensure data.updates has a stat change entry
      if (!data.updates) data.updates = [];
      const hasUpdate = data.updates.some(u => 
        u.text && (u.text.toLowerCase().includes('health') || u.text.toLowerCase().includes('hp')) &&
        (typeof u.value === 'number' && Math.sign(u.value) === Math.sign(event.delta))
      );
      if (!hasUpdate) {
        const charLabel = event.target || (targetFile === playerFile ? 'Health' : targetFile.replace(/\.txt$/, ''));
        data.updates.push({
          type: 'stat',
          text: `${charLabel} ${event.delta > 0 ? '+' : ''}${event.delta} HP (${newCurrent}/${existingHealth.max})`,
          value: event.delta,
          category: 'health'
        });
      }

      // Synchronize Master Stat Table in Guide.txt
      const guideKey = data.files && data.files['Guide.txt'] ? 'Guide.txt' : (this.fs.read('Guide.txt') ? 'Guide.txt' : null);
      if (guideKey) {
        const rawGuide = data.files && data.files['Guide.txt']
          ? (typeof data.files['Guide.txt'] === 'string' ? data.files['Guide.txt'] : (data.files['Guide.txt'] as any).content)
          : this.fs.read('Guide.txt');

        if (typeof rawGuide === 'string' && rawGuide.length > 0) {
          const charBaseName = (event.target || targetFile.replace(/\.txt$/, '').split('-')[0]).trim();
          if (charBaseName && rawGuide.includes(charBaseName)) {
            const lines = rawGuide.split('\n');
            let modifiedGuide = false;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.includes(charBaseName) && (line.includes('|') || line.toLowerCase().includes('health'))) {
                const hpPattern = /([+-]?\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)/g;
                const matches = Array.from(line.matchAll(hpPattern));
                if (matches.length >= 1) {
                  const firstMatch = matches[0];
                  const oldHpStr = firstMatch[0];
                  const maxVal = oldHpStr.split('/')[1].trim();
                  lines[i] = line.replace(oldHpStr, `${newCurrent}/${maxVal}`);
                  modifiedGuide = true;
                } else if (line.toLowerCase().includes('health') || line.toLowerCase().includes('hp')) {
                  const singleMatch = line.match(/((?:health|hp)[:=\s]+)([+-]?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/i);
                  if (singleMatch) {
                    const maxVal = singleMatch[3] || existingHealth.max;
                    lines[i] = line.replace(singleMatch[0], `Health: ${newCurrent}/${maxVal}`);
                    modifiedGuide = true;
                  }
                }
              }
            }
            if (modifiedGuide) {
              const updatedGuide = lines.join('\n');
              if (!data.files || typeof data.files !== 'object') data.files = {};
              if (typeof data.files['Guide.txt'] === 'object' && (data.files['Guide.txt'] as any).content !== undefined) {
                (data.files['Guide.txt'] as any).content = updatedGuide;
              } else {
                data.files['Guide.txt'] = updatedGuide;
              }
            }
          }
        }
      }
    }
  }

  private syncPlayerInventory(data: AIResponse, username?: string, auditContext?: any) {
    if (!data) return;

    // Collect structured transactions dynamically determined by AI
    const transactions: InventoryTransaction[] = [];

    // 1. From structured data.inventoryTransactions
    if (Array.isArray(data.inventoryTransactions)) {
      transactions.push(...data.inventoryTransactions);
    }

    // 2. From data.updates with inventory object or inventory category
    if (Array.isArray(data.updates)) {
      for (const u of data.updates) {
        if (u.inventory) {
          transactions.push(u.inventory);
        } else if (u.type === 'item' || u.category === 'inventory') {
          const isRemove = (u.value !== undefined && u.value < 0) || (u.text && u.text.trim().startsWith('-'));
          const cleanName = (u.text || '').replace(/^[-+]\s*/, '').replace(/[:=].*$/, '').trim();
          if (cleanName) {
            transactions.push({
              name: cleanName,
              operation: isRemove ? 'remove' : 'add',
              quantity: Math.abs(u.value || 1)
            });
          }
        }
      }
    }

    // 3. From dynamic AI audit from Phase 1
    if (auditContext?.inventoryAudit?.isInventoryAffected && Array.isArray(auditContext.inventoryAudit.items)) {
      for (const item of auditContext.inventoryAudit.items) {
        const exists = transactions.some(t =>
          t.name.toLowerCase() === item.name.toLowerCase() &&
          t.operation === item.operation
        );
        if (!exists) {
          transactions.push(item);
        }
      }
    }

    if (transactions.length === 0) return;

    for (const tx of transactions) {
      const charName = tx.targetCharacter || username;
      const targetFile = this.findPlayerCharacterFile(charName, data.files) ||
        this.findPlayerCharacterFile(username, data.files) ||
        (charName ? `${charName}.txt` : null) ||
        (username ? `${username}.txt` : null);

      if (!targetFile) continue;

      let content: string | null = null;
      if (data.files && data.files[targetFile]) {
        const fd = data.files[targetFile];
        content = typeof fd === 'string' ? fd : (fd as any)?.content;
      }
      if (!content) {
        content = this.fs.read(targetFile);
      }
      if (!content) continue;

      let updatedContent = content;
      const stats = WeightInventoryEngine.parseCharacterStatsAndInventory(content);

      if (tx.operation === 'add') {
        const existingNames = new Set([
          ...stats.containers.flatMap(c => c.items.map(i => i.name.toLowerCase())),
          ...stats.equippedGear.map(i => i.name.toLowerCase()),
          ...stats.carriedItems.map(i => i.name.toLowerCase()),
          ...stats.storedItems.map(i => i.name.toLowerCase()),
        ]);

        if (!existingNames.has(tx.name.toLowerCase())) {
          // Ensure [CONTAINERS & CARRIED GEAR] section exists
          if (!updatedContent.includes('[CONTAINERS & CARRIED GEAR]') && !updatedContent.includes('[INVENTORY')) {
            const insertPos = updatedContent.indexOf('[OWNED / STORED') >= 0
              ? updatedContent.indexOf('[OWNED / STORED')
              : (updatedContent.indexOf('[STATUS EFFECTS') >= 0 ? updatedContent.indexOf('[STATUS EFFECTS') : updatedContent.length);

            const newSection = `\n[CONTAINERS & CARRIED GEAR]\n- Total Carried Weight on Person: 2.0 lbs / ${stats.bodyWeight || 150} lbs (GOOD: Unencumbered) | Max Lift: ${stats.maxLiftStrength || 150} lbs\n- Containers Equipped/Carried:\n  * Backpack: Dimensions 18x12x8 inches, Max Capacity: 40 lbs, Weight: 2 lbs\n- Carried Inventory (Inside Containers):\n`;
            updatedContent = updatedContent.substring(0, insertPos) + newSection + updatedContent.substring(insertPos);
          }

          const containerLabel = tx.container || (stats.containers.length > 0 ? stats.containers[0].name : 'Backpack');
          const itemLine = `  - ${tx.name}: 1.0 lbs, 8x4x2 inches. Container: [${containerLabel}]\n`;

          const carriedIdx = updatedContent.search(/^[-\s]*carried inventory.*:$/im);
          if (carriedIdx >= 0) {
            const lineEnd = updatedContent.indexOf('\n', carriedIdx);
            const insertAt = lineEnd >= 0 ? lineEnd + 1 : updatedContent.length;
            const afterHeader = updatedContent.substring(insertAt);
            if (afterHeader.trim().startsWith('* (none)') || afterHeader.trim().startsWith('- (none)')) {
              const noneEnd = updatedContent.indexOf('\n', insertAt);
              updatedContent = updatedContent.substring(0, insertAt) + itemLine + (noneEnd >= 0 ? updatedContent.substring(noneEnd + 1) : '');
            } else {
              updatedContent = updatedContent.substring(0, insertAt) + itemLine + updatedContent.substring(insertAt);
            }
          } else {
            const containersHeaderIdx = updatedContent.indexOf('[CONTAINERS & CARRIED GEAR]');
            if (containersHeaderIdx >= 0) {
              const nextHeader = updatedContent.indexOf('[', containersHeaderIdx + 25);
              const insertAt = nextHeader > 0 ? nextHeader : updatedContent.length;
              updatedContent = updatedContent.substring(0, insertAt) + `- Carried Inventory (Inside Containers):\n${itemLine}\n` + updatedContent.substring(insertAt);
            } else {
              updatedContent += `\n- Carried Inventory (Inside Containers):\n${itemLine}`;
            }
          }
        }
      } else if (tx.operation === 'remove' || tx.operation === 'drop' || tx.operation === 'transfer') {
        const lines = updatedContent.split('\n');
        const itemNameLower = tx.name.toLowerCase();
        const filteredLines = lines.filter(l => {
          const lower = l.toLowerCase();
          return !lower.includes(itemNameLower);
        });
        if (filteredLines.length !== lines.length) {
          updatedContent = filteredLines.join('\n');
        }
      } else if (tx.operation === 'consume_use' || tx.operation === 'refill' || tx.operation === 'set_usage') {
        const lines = updatedContent.split('\n');
        const itemNameLower = tx.name.toLowerCase();
        let changed = false;

        const newLines = lines.map(line => {
          if (changed) return line;
          const lower = line.toLowerCase();
          if (lower.includes(itemNameLower) && (line.trim().startsWith('-') || line.trim().startsWith('*'))) {
            const parsedUsage = WeightInventoryEngine.parseItemUsage(line, tx.name);
            let current = parsedUsage?.current ?? (tx.currentUsage ?? (tx.maxUsage || 5));
            const max = tx.maxUsage ?? parsedUsage?.max ?? current;

            if (tx.operation === 'consume_use') {
              const delta = typeof tx.usageChange === 'number' ? Math.abs(tx.usageChange) : (typeof (tx as any).amount === 'number' ? Math.abs((tx as any).amount) : 1);
              current = Math.max(0, current - delta);
            } else if (tx.operation === 'refill') {
              const delta = typeof tx.usageChange === 'number' ? Math.abs(tx.usageChange) : (typeof (tx as any).amount === 'number' ? Math.abs((tx as any).amount) : max);
              current = Math.min(max, current + delta);
            } else if (tx.operation === 'set_usage') {
              const targetVal = typeof tx.currentUsage === 'number' ? tx.currentUsage : (typeof (tx as any).amount === 'number' ? (tx as any).amount : current);
              current = Math.max(0, Math.min(max, targetVal));
            }

            changed = true;
            return WeightInventoryEngine.updateItemUsageInLine(
              line,
              current,
              max,
              tx.refillResource || parsedUsage?.refillResource
            );
          }
          return line;
        });

        if (changed) {
          updatedContent = newLines.join('\n');
        }
      }

      // Re-sync file through WeightInventoryEngine
      try {
        const activeTime = this.fs.read('WorldTime.txt') || undefined;
        const res = WeightInventoryEngine.syncCharacterFileContent(updatedContent, activeTime);
        updatedContent = res.updatedContent;
      } catch (e) {
        console.warn("Inventory sync engine error", e);
      }

      if (!data.files || typeof data.files !== 'object') data.files = {};
      if (typeof data.files[targetFile] === 'object' && (data.files[targetFile] as any).content !== undefined) {
        (data.files[targetFile] as any).content = updatedContent;
      } else {
        data.files[targetFile] = updatedContent;
      }
    }
  }

  private async syncPlayerCurrency(data: AIResponse, username?: string, auditContext?: any, playerAction?: string) {
    if (!data) return;

    // 1. Collect all structured currency transactions dynamically determined by AI
    const transactions: CurrencyTransaction[] = [];

    if (Array.isArray(data.currencyTransactions)) {
      transactions.push(...data.currencyTransactions);
    }

    if (Array.isArray(data.updates)) {
      for (const u of data.updates) {
        if (u.currency) {
          transactions.push(u.currency);
        } else {
          // Check all update texts for currency entries
          const parsed = WeightInventoryEngine.parseCurrencyEntries(u.text || '');
          if (parsed.length > 0) {
            const isDeduction = (u.value !== undefined && u.value < 0) ||
              (u.text || '').trim().startsWith('-');
            for (const p of parsed) {
              const alreadyExists = transactions.some(t =>
                t.name.toLowerCase() === p.name.toLowerCase() &&
                t.amount === Math.abs(p.amount)
              );
              if (!alreadyExists) {
                transactions.push({
                  name: p.name,
                  amount: Math.abs(p.amount),
                  operation: isDeduction ? 'deduct' : 'add',
                  container: p.container,
                  rawText: u.text
                });
              }
            }
          }
        }
      }
    }

    if (auditContext?.currencyAudit?.isCurrencyAffected && Array.isArray(auditContext.currencyAudit.transactions)) {
      for (const t of auditContext.currencyAudit.transactions) {
        const exists = transactions.some(existing =>
          existing.name.toLowerCase() === t.name.toLowerCase() &&
          existing.amount === t.amount &&
          existing.operation === t.operation
        );
        if (!exists) {
          transactions.push(t);
        }
      }
    }

    // 2. Game Engine State Detection: Detect direct currency differences in incoming files vs disk
    if (data.files && typeof data.files === 'object') {
      for (const [fname, fdata] of Object.entries(data.files)) {
        if (!fname.endsWith('.txt')) continue;
        const incomingContent = typeof fdata === 'string' ? fdata : (fdata as any)?.content;
        const diskContent = this.fs.read(fname);
        if (!incomingContent || !diskContent) continue;
        try {
          const inStats = WeightInventoryEngine.parseCharacterStatsAndInventory(incomingContent);
          const dStats = WeightInventoryEngine.parseCharacterStatsAndInventory(diskContent);
          for (const inc of inStats.currency.carriedCurrencies) {
            const diskMatch = dStats.currency.carriedCurrencies.find(dc =>
              dc.name.toLowerCase() === inc.name.toLowerCase() ||
              dc.name.toLowerCase().includes(inc.name.toLowerCase()) ||
              inc.name.toLowerCase().includes(dc.name.toLowerCase())
            );
            const prevAmt = diskMatch ? diskMatch.amount : 0;
            if (inc.amount > prevAmt) {
              const diff = inc.amount - prevAmt;
              const exists = transactions.some(t =>
                t.name.toLowerCase() === inc.name.toLowerCase() && t.amount === diff
              );
              if (!exists) {
                transactions.push({
                  name: inc.name,
                  amount: diff,
                  operation: 'add',
                  container: inc.container,
                  recipient: inStats.characterName || username,
                  rawText: `+${diff} ${inc.name}`
                });
              }
            } else if (inc.amount < prevAmt) {
              const diff = prevAmt - inc.amount;
              const exists = transactions.some(t =>
                t.name.toLowerCase() === inc.name.toLowerCase() && t.amount === diff
              );
              if (!exists) {
                transactions.push({
                  name: inc.name,
                  amount: diff,
                  operation: 'deduct',
                  container: inc.container,
                  giver: inStats.characterName || username,
                  rawText: `-${diff} ${inc.name}`
                });
              }
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }

    // 3. Dynamic AI Narrative Extraction: If no structured transactions were returned and incoming files did not alter currency,
    // dynamically extract currency transactions from narrative context using the AI engine (no rigid keywords).
    if (transactions.length === 0 && typeof data.narrative === 'string' && data.narrative.trim()) {
      const narrativeEntries = WeightInventoryEngine.parseCurrencyEntries(data.narrative);
      if (narrativeEntries.length > 0) {
        // Find player character name
        const playerFile = this.findPlayerCharacterFile(username, data.files);
        const charContent = playerFile ? (data.files && data.files[playerFile] ? (typeof data.files[playerFile] === 'string' ? data.files[playerFile] : (data.files[playerFile] as any).content) : this.fs.read(playerFile)) : null;
        const charStats = charContent ? WeightInventoryEngine.parseCharacterStatsAndInventory(charContent) : null;
        const charName = charStats?.characterName || username || 'Player';

        try {
          const aiExtractPrompt = `TASK: Dynamic Currency Transaction Extraction.
You are the Game Engine Currency Auditor.
Analyze the player's action and the game master's narrative to dynamically extract any currency or monetary transactions involving the active player character "${charName}" or party.

Player Action: ${playerAction || data.intent || 'None'}
Game Narrative:
"""
${data.narrative.slice(0, 3000)}
"""

Active Character: "${charName}" (Username: "${username || 'player'}")

INSTRUCTIONS:
1. Comprehend the full narrative context dynamically (e.g. receiving quest pay, finding or looting gold coins/silver/credits, gifts, wages, trading, tipping, paying for goods or services).
2. DO NOT rely on rigid keywords. Understand dialogue, passive voice, character third-person actions, and loot discovery.
3. For each transaction, return a JSON object:
   - "name": Currency denomination name (e.g. "Gold Coins", "Silver Coins", "Credits", "Dollars")
   - "amount": positive numeric amount (e.g. 50, 10, 1)
   - "operation": "add" (if acquired, looted, earned, rewarded, found, received) | "deduct" (if paid, spent, given away, donated, lost)
   - "container": container name if mentioned (e.g. "Coin Pouch", "Leather Wallet", "Backpack") or null
   - "recipient": character receiving or null
   - "giver": character giving or null

Return ONLY a strict JSON array: [ { ... } ]. If no currency was transacted, return [].`;

          const aiResp = await this.callAI(aiExtractPrompt);
          const cleaned = aiResp.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              if (item.name && typeof item.amount === 'number' && item.amount > 0) {
                transactions.push({
                  name: item.name,
                  amount: item.amount,
                  operation: item.operation === 'deduct' ? 'deduct' : 'add',
                  container: item.container || undefined,
                  recipient: item.recipient || charName,
                  giver: item.giver || undefined,
                  rawText: `${item.operation === 'deduct' ? '-' : '+'}${item.amount} ${item.name}`
                });
              }
            }
          }
        } catch (err) {
          console.warn("[Dynamic Currency AI Extraction Error]", err);
        }

        // If AI call produced nothing or failed, use Game Engine dynamic fallback (no rigid keywords)
        if (transactions.length === 0) {
          const sentences = data.narrative.split(/[.!?\n]+/);
          for (const sent of sentences) {
            const trimmedSent = sent.trim();
            if (!trimmedSent) continue;
            const parsedEntries = WeightInventoryEngine.parseCurrencyEntries(trimmedSent);
            if (parsedEntries.length === 0) continue;

            for (const p of parsedEntries) {
              const isNegative = p.amount < 0 || trimmedSent.trim().startsWith('-');
              const operation = isNegative ? 'deduct' : 'add';
              const exists = transactions.some(t =>
                t.name.toLowerCase() === p.name.toLowerCase() && t.amount === Math.abs(p.amount)
              );
              if (!exists) {
                transactions.push({
                  name: p.name,
                  amount: Math.abs(p.amount),
                  operation,
                  container: p.container,
                  recipient: charName,
                  rawText: trimmedSent
                });
              }
            }
          }
        }
      }
    }

    if (transactions.length === 0) return;

    for (const tx of transactions) {
      const isDeduction = tx.operation === 'deduct' || tx.operation === 'transfer';
      const actorName = isDeduction ? (tx.giver || username) : (tx.recipient || username);

      const targetFile = this.findPlayerCharacterFile(actorName, data.files) ||
        this.findPlayerCharacterFile(username, data.files) ||
        (actorName ? `${actorName}.txt` : null) ||
        (username ? `${username}.txt` : null);

      if (!targetFile) continue;

      let content: string | null = null;
      if (data.files && data.files[targetFile]) {
        const fd = data.files[targetFile];
        content = typeof fd === 'string' ? fd : (fd as any)?.content;
      }
      if (!content) {
        content = this.fs.read(targetFile);
      }
      if (!content) continue;

      let updatedContent = content;
      const pStats = WeightInventoryEngine.parseCharacterStatsAndInventory(updatedContent);
      let changed = false;

      // Check if the AI model ALREADY applied this transaction directly into data.files[targetFile]
      const diskContent = this.fs.read(targetFile);
      const diskStats = diskContent ? WeightInventoryEngine.parseCharacterStatsAndInventory(diskContent) : null;
      let alreadyAppliedInIncomingFile = false;

      if (diskStats && data.files && data.files[targetFile]) {
        const diskEntry = diskStats.currency.carriedCurrencies.find(c =>
          c.name.toLowerCase() === tx.name.toLowerCase() ||
          c.name.toLowerCase().includes(tx.name.toLowerCase()) ||
          tx.name.toLowerCase().includes(c.name.toLowerCase())
        );
        const incomingEntry = pStats.currency.carriedCurrencies.find(c =>
          c.name.toLowerCase() === tx.name.toLowerCase() ||
          c.name.toLowerCase().includes(tx.name.toLowerCase()) ||
          tx.name.toLowerCase().includes(c.name.toLowerCase())
        );
        const diskAmt = diskEntry ? diskEntry.amount : 0;
        const incomingAmt = incomingEntry ? incomingEntry.amount : 0;

        if (isDeduction) {
          if (diskAmt > 0 && incomingAmt <= diskAmt - tx.amount) {
            alreadyAppliedInIncomingFile = true;
          }
        } else {
          if (incomingAmt >= diskAmt + tx.amount && diskAmt !== incomingAmt) {
            alreadyAppliedInIncomingFile = true;
          }
        }
      }

      if (isDeduction) {
        // Find matching carried currency by container and/or denomination
        let matchIdx = -1;
        if (tx.container) {
          const tCont = tx.container.toLowerCase();
          matchIdx = pStats.currency.carriedCurrencies.findIndex(c => {
            const cCont = (c.container || '').toLowerCase();
            return (cCont.includes(tCont) || tCont.includes(cCont)) &&
              (c.name.toLowerCase() === tx.name.toLowerCase() ||
               c.name.toLowerCase().includes(tx.name.toLowerCase()) ||
               tx.name.toLowerCase().includes(c.name.toLowerCase()));
          });
          if (matchIdx < 0) {
            matchIdx = pStats.currency.carriedCurrencies.findIndex(c => {
              const cCont = (c.container || '').toLowerCase();
              return cCont.includes(tCont) || tCont.includes(cCont);
            });
          }
        }
        if (matchIdx < 0) {
          matchIdx = pStats.currency.carriedCurrencies.findIndex(c =>
            c.name.toLowerCase() === tx.name.toLowerCase() ||
            c.name.toLowerCase().includes(tx.name.toLowerCase()) ||
            tx.name.toLowerCase().includes(c.name.toLowerCase())
          );
        }
        if (matchIdx < 0 && pStats.currency.carriedCurrencies.length > 0) {
          matchIdx = 0;
        }

        if (matchIdx >= 0) {
          if (!alreadyAppliedInIncomingFile) {
            const currentAmt = pStats.currency.carriedCurrencies[matchIdx].amount;
            const newAmt = Math.max(0, currentAmt - tx.amount);
            if (newAmt === 0) {
              pStats.currency.carriedCurrencies.splice(matchIdx, 1);
            } else {
              pStats.currency.carriedCurrencies[matchIdx].amount = newAmt;
            }
          }
          changed = true;
        }
      } else {
        // Addition
        let matchIdx = pStats.currency.carriedCurrencies.findIndex(c =>
          (c.name.toLowerCase() === tx.name.toLowerCase() ||
           c.name.toLowerCase().includes(tx.name.toLowerCase()) ||
           tx.name.toLowerCase().includes(c.name.toLowerCase())) &&
          (!tx.container || !c.container || c.container.toLowerCase().includes(tx.container.toLowerCase()) || tx.container.toLowerCase().includes(c.container.toLowerCase()))
        );
        if (matchIdx >= 0) {
          if (!alreadyAppliedInIncomingFile) {
            pStats.currency.carriedCurrencies[matchIdx].amount += tx.amount;
          }
        } else {
          // Prefer pouch, wallet, purse, pocket, money belt, or first container
          const targetCont = tx.container ||
            pStats.containers.find(ct => /pouch|wallet|purse|pocket|money\s*belt/i.test(ct.name))?.name ||
            (pStats.containers.length > 0 ? pStats.containers[0].name : 'Coin Pouch');
          pStats.currency.carriedCurrencies.push({
            name: tx.name,
            amount: tx.amount,
            container: targetCont
          });
        }
        changed = true;
      }

      if (changed) {
        // Ensure data.updates reflects the transaction if not already present
        if (!data.updates || !Array.isArray(data.updates)) {
          data.updates = [];
        }
        const hasUpdate = data.updates.some(u =>
          u.text && u.text.toLowerCase().includes(tx.name.toLowerCase()) && u.text.includes(tx.amount.toString())
        );
        if (!hasUpdate) {
          data.updates.push({
            type: 'currency',
            text: `${isDeduction ? '-' : '+'}${tx.amount.toLocaleString()} ${tx.name}${tx.container ? ` (${tx.container})` : ''}`,
            value: isDeduction ? -tx.amount : tx.amount
          });
        }

        // Ensure data.currencyTransactions contains tx
        if (!data.currencyTransactions || !Array.isArray(data.currencyTransactions)) {
          data.currencyTransactions = [];
        }
        const hasTx = data.currencyTransactions.some(t =>
          t.name.toLowerCase() === tx.name.toLowerCase() && t.amount === tx.amount && t.operation === tx.operation
        );
        if (!hasTx) {
          data.currencyTransactions.push(tx);
        }

        try {
          const activeTime = this.fs.read('WorldTime.txt') || undefined;
          const res = WeightInventoryEngine.syncCharacterFileContent(updatedContent, activeTime, { carried: pStats.currency.carriedCurrencies });
          updatedContent = res.updatedContent;
        } catch (e) {
          console.warn("Currency sync error", e);
        }

        if (!data.files || typeof data.files !== 'object') data.files = {};
        if (typeof data.files[targetFile] === 'object' && (data.files[targetFile] as any).content !== undefined) {
          (data.files[targetFile] as any).content = updatedContent;
        } else {
          data.files[targetFile] = updatedContent;
        }
        this.fs.write(targetFile, updatedContent);
      }

      // If currency was transferred or given to a recipient, update the recipient character file as well
      if (isDeduction && tx.recipient && tx.recipient.toLowerCase() !== (username || '').toLowerCase()) {
        const recipFile = this.findPlayerCharacterFile(tx.recipient, data.files) ||
          Object.keys(this.fs.getAll()).find(f => f.toLowerCase().includes(tx.recipient!.toLowerCase()) && f.endsWith('.txt'));

        if (recipFile) {
          let recipContent = (data.files && data.files[recipFile])
            ? (typeof data.files[recipFile] === 'string' ? data.files[recipFile] as string : (data.files[recipFile] as any)?.content)
            : this.fs.read(recipFile);

          if (recipContent) {
            const rStats = WeightInventoryEngine.parseCharacterStatsAndInventory(recipContent);
            const rMatchIdx = rStats.currency.carriedCurrencies.findIndex(c => c.name.toLowerCase() === tx.name.toLowerCase());
            if (rMatchIdx >= 0) {
              rStats.currency.carriedCurrencies[rMatchIdx].amount += tx.amount;
            } else {
              rStats.currency.carriedCurrencies.push({
                name: tx.name,
                amount: tx.amount,
                container: rStats.containers.length > 0 ? rStats.containers[0].name : undefined
              });
            }
            try {
              const activeTime = this.fs.read('WorldTime.txt') || undefined;
              const res = WeightInventoryEngine.syncCharacterFileContent(recipContent, activeTime, { carried: rStats.currency.carriedCurrencies });
              recipContent = res.updatedContent;
            } catch (e) {
              console.warn("Recipient currency sync error", e);
            }
            if (typeof data.files[recipFile] === 'object' && (data.files[recipFile] as any).content !== undefined) {
              (data.files[recipFile] as any).content = recipContent;
            } else {
              data.files[recipFile] = recipContent;
            }
            this.fs.write(recipFile, recipContent);
          }
        }
      }
    }
  }

  private handleTimeTravelReversion(timeTravel: TimeTravelDirective, username?: string) {
    try {
      const targetSnapshot = HistoryService.findClosestSnapshot({
        targetTime: timeTravel.targetTime,
        turnsBack: timeTravel.turnsBack || 1
      });

      if (targetSnapshot && targetSnapshot.fileSystemState) {
        const currentState = this.fs.exportState();
        const preserveTargets = [...(timeTravel.preserveFiles || [])];
        if (username && preserveTargets.length === 0) {
          const charFile = this.findPlayerCharacterFile(username);
          if (charFile) preserveTargets.push(charFile);
        }

        const mergedState = HistoryService.applyStateWithExclusions(
          targetSnapshot.fileSystemState,
          currentState,
          preserveTargets
        );

        this.fs.importState(mergedState);
        console.log(`[Time Travel Engine] Restored state to turn snapshot (${targetSnapshot.worldTime || targetSnapshot.id}) preserving:`, preserveTargets);
      }
    } catch (err) {
      console.error('[Time Travel Engine Error]', err);
    }
  }

  /**
   * Reconciles dead characters and resurrected characters:
   * 1. If a character dies, don't delete them; remove the player's username from the character's name
   *    and file (e.g. charactername-username into charactername-dead.txt).
   * 2. If a player's character is alive again (resurrection), AI detects from context and they
   *    become an NPC instead since the player is no longer controlling them after death.
   */
  private reconcileDeadAndResurrectedCharacters(data: AIResponse, username?: string) {
    if (!data) return;
    if (!data.files || typeof data.files !== 'object' || Array.isArray(data.files)) {
      data.files = {};
    }

    const narrativeLower = (typeof data.narrative === 'string' ? data.narrative : '').toLowerCase();
    const isResurrectionNarrative =
      narrativeLower.includes('resurrect') ||
      narrativeLower.includes('reviv') ||
      narrativeLower.includes('raised from the dead') ||
      narrativeLower.includes('brings back to life') ||
      narrativeLower.includes('brought back to life') ||
      narrativeLower.includes('restores life') ||
      narrativeLower.includes('returned to life') ||
      narrativeLower.includes('breath returns') ||
      narrativeLower.includes('heart begins beating') ||
      narrativeLower.includes('wakes from death');

    // 1. RECONCILE RESURRECTED CHARACTERS: *-dead.txt coming back to life -> become NPC!
    const allFilesList = Array.from(new Set([...Object.keys(data.files), ...this.fs.list()]));
    const deadFiles = allFilesList.filter(f => f.endsWith('-dead.txt') || f.endsWith('_dead.txt'));

    for (const deadFile of deadFiles) {
      let content = data.files[deadFile]
        ? (typeof data.files[deadFile] === 'string' ? data.files[deadFile] : (data.files[deadFile] as any).content)
        : this.fs.read(deadFile);

      if (typeof content !== 'string') continue;

      const charBaseName = deadFile.replace(/\.txt$/, '').replace(/[-_]dead$/i, '').trim();
      const charLower = charBaseName.toLowerCase();

      // Check if health is now positive
      const hpMatch = content.match(/[-*•]?\s*Health\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
      const currentHp = hpMatch ? parseFloat(hpMatch[1]) : -1;

      // Check if status is no longer dead, or health is > 0, or narrative specifically resurrects this character
      const hasDeadStatus = /Status\s*[:=]\s*Dead/i.test(content) || /Status\s*[:=][^\n\r]*\(Dead/i.test(content);
      const isCharacterNamedInRevive = isResurrectionNarrative && charLower && narrativeLower.includes(charLower);
      const isAliveAgain = (currentHp > 0 && !hasDeadStatus) || (currentHp > 0 && isCharacterNamedInRevive) || (isCharacterNamedInRevive && !hasDeadStatus);

      if (isAliveAgain) {
        console.log(`[AI Engine] Dead character "${charBaseName}" resurrected -> converting to autonomous NPC "${charBaseName}-npc.txt"`);
        const npcFileName = `${charBaseName}-npc.txt`;

        let updatedContent = content;
        // Ensure HP is at least 10 / max if <= 0
        if (currentHp <= 0 && hpMatch) {
          const maxVal = hpMatch[2];
          updatedContent = updatedContent.replace(hpMatch[0], `- Health: 10 / ${maxVal} (Conscious)`);
        } else {
          updatedContent = updatedContent.replace(/\s*\(Dead\)/gi, ' (Alive)');
        }

        // Remove dead status and set NPC status
        updatedContent = updatedContent
          .replace(/Status:\s*Dead[^\n\r]*/gi, 'Status: Healthy (Resurrected autonomous NPC)')
          .replace(/Status:\s*npc[^\n\r]*/gi, 'Status: Healthy')
          .replace(/[-*•]?\s*Decomposition\s*\/\s*Rot[^\n\r]*/gi, '');

        // Remove player assignment and mark as NPC
        if (updatedContent.match(/[-*•]?\s*Player\s*[:=][^\n\r]*/i)) {
          updatedContent = updatedContent.replace(/[-*•]?\s*Player\s*[:=][^\n\r]*/i, '- Type: Non-Player Character (NPC) (Resurrected former adventurer)\n- Player: None (Independent NPC)');
        } else if (!updatedContent.includes('Non-Player Character')) {
          const nameHeader = updatedContent.indexOf('[NAME & DESCRIPTION]');
          if (nameHeader >= 0) {
            const insertIdx = updatedContent.indexOf('\n', nameHeader) + 1;
            updatedContent = updatedContent.slice(0, insertIdx) + '- Type: Non-Player Character (NPC) (Resurrected former adventurer)\n- Player: None (Independent NPC)\n' + updatedContent.slice(insertIdx);
          }
        }

        // Apply file transition
        data.files[deadFile] = null;
        data.files[npcFileName] = updatedContent;
        if (this.fs.exists(deadFile)) {
          this.fs.delete(deadFile);
        }
        this.fs.write(npcFileName, updatedContent);

        // Update CurrentMap.json: place in npcs, remove from players
        this.updateMapForResurrectedNpc(data, charBaseName);

        // Notify in updates
        if (!data.updates) data.updates = [];
        data.updates.push({
          type: 'story',
          text: `✨ ${charBaseName} has returned to life as an independent NPC!`
        });
      }
    }

    // 2. RECONCILE DEAD CHARACTERS: charactername-username -> charactername-dead while dead
    const activeFilesList = Array.from(new Set([...Object.keys(data.files), ...this.fs.list()]));
    for (const f of activeFilesList) {
      if (!f.endsWith('.txt')) continue;
      if (
        f.endsWith('-dead.txt') ||
        f.endsWith('-npc.txt') ||
        f.startsWith('World') ||
        f.startsWith('Guide') ||
        f.startsWith('Log') ||
        f.startsWith('History')
      ) continue;

      let content = data.files[f]
        ? (typeof data.files[f] === 'string' ? data.files[f] : (data.files[f] as any).content)
        : this.fs.read(f);

      if (typeof content !== 'string') continue;

      // Check if dead
      const hpMatch = content.match(/[-*•]?\s*Health\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
      const isDeadStatus = /Status\s*[:=]\s*Dead/i.test(content) || /Health\s*[:=][^\n\r]*\(Dead\)/i.test(content);
      const isDeadHealth = hpMatch && parseFloat(hpMatch[1]) <= 0 && isDeadStatus;
      const isDeadGameOver = Boolean(data.gameOver && username && f.toLowerCase().includes(username.toLowerCase()));

      if (isDeadStatus || isDeadHealth || isDeadGameOver) {
        // This character is dead! Convert charactername-username into charactername-dead.txt
        const baseNoExt = f.replace(/\.txt$/, '');
        const parts = baseNoExt.split(/[-_]/);
        const charBaseName = parts.length > 1 ? parts.slice(0, -1).join('-') : parts[0];
        const deadFileName = `${charBaseName}-dead.txt`;

        if (f !== deadFileName) {
          console.log(`[AI Engine] Converting fallen player character file "${f}" -> "${deadFileName}"`);
          let updatedDeadContent = content;
          if (username) {
            updatedDeadContent = updatedDeadContent.replace(
              new RegExp(`[-*•]?\\s*Player\\s*[:=]\\s*${username}[^\\n\\r]*`, 'gi'),
              `- Status: Dead (Preserved corpse; former character for ${username})\n- Player: None (Deceased)`
            );
          } else {
            updatedDeadContent = updatedDeadContent.replace(
              /[-*•]?\s*Player\s*[:=][^\n\r]*/gi,
              '- Status: Dead (Preserved corpse; player control ended)\n- Player: None (Deceased)'
            );
          }
          if (!updatedDeadContent.includes('Status: Dead')) {
            updatedDeadContent = updatedDeadContent.replace(/\[STATUS EFFECTS[^\]]*\]/i, `[STATUS EFFECTS & LORE]\n- Status: Dead (Fallen adventurer)`);
          }

          data.files[f] = null;
          data.files[deadFileName] = updatedDeadContent;
          if (this.fs.exists(f)) {
            this.fs.delete(f);
          }
          this.fs.write(deadFileName, updatedDeadContent);

          // Update map: remove from players
          this.updateMapForFallenPlayer(data, charBaseName, username);
        }
      }
    }
  }

  private updateMapForFallenPlayer(data: AIResponse, charBaseName: string, username?: string) {
    try {
      const mapRaw = data.files['CurrentMap.json']
        ? (typeof data.files['CurrentMap.json'] === 'string' ? data.files['CurrentMap.json'] : (data.files['CurrentMap.json'] as any).content)
        : this.fs.read('CurrentMap.json');
      if (!mapRaw) return;
      const mapObj = typeof mapRaw === 'string' ? JSON.parse(mapRaw) : mapRaw;
      const uLower = (username || '').toLowerCase();
      const charLower = charBaseName.toLowerCase();

      let modified = false;
      const filterPlayers = (playersList: any[]) => {
        if (!Array.isArray(playersList)) return playersList;
        return playersList.filter((p: any) => {
          const pUser = (p.username || '').toLowerCase();
          const pChar = (p.characterName || p.name || '').toLowerCase();
          if (uLower && pUser === uLower) {
            modified = true;
            return false;
          }
          if (pChar && (pChar === charLower || pChar.includes(charLower))) {
            modified = true;
            return false;
          }
          return true;
        });
      };

      if (Array.isArray(mapObj.players)) {
        mapObj.players = filterPlayers(mapObj.players);
      }
      if (Array.isArray(mapObj.pages)) {
        for (const page of mapObj.pages) {
          if (Array.isArray(page.players)) {
            page.players = filterPlayers(page.players);
          }
        }
      }

      if (modified) {
        const jsonStr = JSON.stringify(mapObj, null, 2);
        if (typeof data.files['CurrentMap.json'] === 'object' && (data.files['CurrentMap.json'] as any).content !== undefined) {
          (data.files['CurrentMap.json'] as any).content = jsonStr;
        } else {
          data.files['CurrentMap.json'] = jsonStr;
        }
        this.fs.write('CurrentMap.json', jsonStr);
      }
    } catch (e) {
      // non-fatal
    }
  }

  private updateMapForResurrectedNpc(data: AIResponse, charBaseName: string) {
    try {
      const mapRaw = data.files['CurrentMap.json']
        ? (typeof data.files['CurrentMap.json'] === 'string' ? data.files['CurrentMap.json'] : (data.files['CurrentMap.json'] as any).content)
        : this.fs.read('CurrentMap.json');
      if (!mapRaw) return;
      const mapObj = typeof mapRaw === 'string' ? JSON.parse(mapRaw) : mapRaw;
      const charLower = charBaseName.toLowerCase();
      const npcName = `${charBaseName}-npc`;

      // 1. Remove from all players arrays
      const removePlayer = (playersList: any[]) => {
        if (!Array.isArray(playersList)) return [];
        return playersList.filter((p: any) => {
          const pChar = (p.characterName || p.name || '').toLowerCase();
          return !(pChar === charLower || pChar.includes(charLower));
        });
      };

      if (Array.isArray(mapObj.players)) mapObj.players = removePlayer(mapObj.players);
      if (Array.isArray(mapObj.pages)) {
        for (const pg of mapObj.pages) {
          if (Array.isArray(pg.players)) pg.players = removePlayer(pg.players);
        }
      }

      // 2. Ensure present in npcs
      const targetPage = (Array.isArray(mapObj.pages) && mapObj.pages.length > 0) ? mapObj.pages[0] : null;
      const npcsArray = targetPage ? (targetPage.npcs || (targetPage.npcs = [])) : (mapObj.npcs || (mapObj.npcs = []));
      const alreadyHasNpc = npcsArray.some((n: any) => (n.name || '').toLowerCase() === npcName.toLowerCase() || (n.name || '').toLowerCase() === charLower);
      if (!alreadyHasNpc) {
        npcsArray.push({
          name: npcName,
          type: 'npc',
          description: `Resurrected former adventurer ${charBaseName}, now autonomous NPC.`,
          x: 50,
          y: 50
        });
      }

      const jsonStr = JSON.stringify(mapObj, null, 2);
      if (typeof data.files['CurrentMap.json'] === 'object' && (data.files['CurrentMap.json'] as any).content !== undefined) {
        (data.files['CurrentMap.json'] as any).content = jsonStr;
      } else {
        data.files['CurrentMap.json'] = jsonStr;
      }
      this.fs.write('CurrentMap.json', jsonStr);
    } catch (e) {
      // non-fatal
    }
  }

  private async processResponseData(data: AIResponse, username?: string, auditContext?: any, playerAction?: string) {
    if (!data) return;

    // Normalize narrative to string if provided as object
    if (data.narrative && typeof data.narrative === 'object') {
      data.narrative = (data.narrative as any).text || (data.narrative as any).content || (data.narrative as any).narrative || JSON.stringify(data.narrative);
    }

    // Normalize recommendations to string array (preventing React child object errors)
    if (data.recommendations && Array.isArray(data.recommendations)) {
      data.recommendations = data.recommendations.map((r: any) => {
        if (typeof r === 'string') return r;
        if (typeof r === 'object' && r !== null) {
          return r.text || r.label || r.action || r.recommendation || JSON.stringify(r);
        }
        return String(r || '');
      }).filter((r: string) => typeof r === 'string' && r.trim().length > 0);
    }

    // Normalize playerRecommendations for multiplayer per-player uniqueness
    if (!data.playerRecommendations || typeof data.playerRecommendations !== 'object') {
      data.playerRecommendations = {};
    }
    const sanitizedPlayerRecs: Record<string, string[]> = {};
    for (const [userKey, recs] of Object.entries(data.playerRecommendations)) {
      if (Array.isArray(recs)) {
        sanitizedPlayerRecs[userKey] = recs.map((r: any) => {
          if (typeof r === 'string') return r;
          if (typeof r === 'object' && r !== null) {
            return r.text || r.label || r.action || r.recommendation || JSON.stringify(r);
          }
          return String(r || '');
        }).filter((r: string) => typeof r === 'string' && r.trim().length > 0);
      }
    }
    data.playerRecommendations = sanitizedPlayerRecs;

    // Scan all human player files in the game and ensure every player has unique recommendations
    try {
      const allFiles = this.fs.getAll();
      for (const fileName of Object.keys(allFiles)) {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.txt') && !lower.includes('world') && !lower.includes('map') && !lower.includes('rule') && !lower.includes('guide') && !lower.includes('lore') && !lower.endsWith('-npc.txt')) {
          const raw = allFiles[fileName] || '';
          const playerMatch = raw.match(/Player:\s*([^\n\r]+)/i);
          let pUser = playerMatch ? playerMatch[1].trim() : '';
          if (!pUser) {
            const parts = fileName.replace(/\.txt$/, '').split(/[-_]/);
            if (parts.length > 1) {
              pUser = parts[parts.length - 1].trim();
            }
          }
          if (pUser && (!data.playerRecommendations[pUser] || data.playerRecommendations[pUser].length === 0)) {
            data.playerRecommendations[pUser] = AIEngine.generateCharacterUniqueRecommendations(pUser, this.fs, fileName);
          }
        }
      }
    } catch (e) {
      // non-fatal
    }

    // Normalize updates texts to strings (preventing React child object errors)
    if (data.updates && Array.isArray(data.updates)) {
      data.updates = data.updates.map((u: any) => {
        if (!u) return { type: 'misc', text: '', value: 0 };
        let textStr = u.text;
        if (typeof textStr === 'object' && textStr !== null) {
          textStr = textStr.text || textStr.description || textStr.message || JSON.stringify(textStr);
        }
        return {
          ...u,
          text: typeof textStr === 'string' ? textStr : String(textStr || '')
        };
      });
    }

    // Handle Time Travel & selective state reversion before applying this turn's new/modified files
    if (data.timeTravel) {
      this.handleTimeTravelReversion(data.timeTravel, username);
    }

    // Dynamically reconcile health, damage, and healing when detected
    this.syncCharacterHealth(data, username, auditContext);

    // Ensure character energy is always properly updated and in sync
    this.syncPlayerEnergy(data, username, auditContext);

    // Ensure items added or placed in containers are properly reflected
    this.syncPlayerInventory(data, username, auditContext);

    // Ensure currency transactions and balance changes are synchronized
    await this.syncPlayerCurrency(data, username, auditContext, playerAction);

    // Reconcile dead characters (charactername-username -> charactername-dead) and resurrected characters (dead -> NPC)
    this.reconcileDeadAndResurrectedCharacters(data, username);

    // Dynamically repair any accidentally corrupted player files
    cleanAndRepairPlayerFiles(this.fs);

    // Dynamically reconcile and deduplicate NPC files to prevent accidental cloning
    reconcileNpcFiles(this.fs, data.files);

    if (data.files && typeof data.files === 'object' && !Array.isArray(data.files)) {
      // 0. Enforce strict Player vs NPC file segregation
      const fileNames = Object.keys(data.files);
      for (const filename of fileNames) {
        if (!filename.endsWith('.txt')) continue;
        const fileData = data.files[filename];
        const contentStr = typeof fileData === 'string' ? fileData : (fileData as any)?.content;

        // Check if this file represents a human player character sheet
        const playerCheck = isPlayerCharacterFile(filename, contentStr);
        if (playerCheck.isPlayer) {
          // If the AI accidentally returned a player file with -npc.txt, strip -npc.txt!
          if (filename.toLowerCase().endsWith('-npc.txt') || filename.toLowerCase().endsWith('_npc.txt')) {
            const cleanFilename = `${filename.replace(/[-_]npc\.txt$/i, '')}.txt`;
            data.files[cleanFilename] = fileData;
            delete data.files[filename];
            if (this.fs.exists(filename)) {
              this.fs.delete(filename);
            }
          }
          continue;
        }

        const fLower = filename.toLowerCase();
        if (
          fLower.endsWith('-npc.txt') ||
          fLower.endsWith('_npc.txt') ||
          fLower.startsWith('world') ||
          fLower.startsWith('guide') ||
          fLower.startsWith('log') ||
          fLower.startsWith('history') ||
          fLower.startsWith('event') ||
          fLower.startsWith('combat')
        ) {
          continue;
        }

        const isItemOrVehicle = typeof contentStr === 'string' && (
          /category\s*[:=]\s*(?:item|equipment|gear|weapon|vehicle|container|armor|clothing)|type\s*[:=]\s*(?:item|weapon|vehicle|equipment)|attached\s*to\s*[:=]|equipped\s*by\s*[:=]/i.test(contentStr)
        );

        // Only add -npc.txt if this is genuinely a non-player entity/creature sheet, NOT an item, weapon, equipment, or vehicle!
        if (
          !isItemOrVehicle &&
          typeof contentStr === 'string' &&
          (contentStr.includes('[NAME & DESCRIPTION]') || contentStr.includes('[STATS & MODIFIERS]') || contentStr.includes('[CURRENTLY HOLDING]'))
        ) {
          const newFilename = filename.replace(/\.txt$/, '-npc.txt');
          data.files[newFilename] = fileData;
          delete data.files[filename];
          if (this.fs.exists(filename)) {
            this.fs.delete(filename);
          }
        }
      }

      // Reconcile NPC files against existing established filenames to prevent accidental cloning
      reconcileNpcFiles(this.fs, data.files);

      // 1. Check for player file duplicates/naming changes if we have a username
      if (username) {
        const uLower = username.toLowerCase();
        const incomingPlayerFiles = Object.keys(data.files).filter(f => {
          const lower = f.toLowerCase();
          return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
        });

        if (incomingPlayerFiles.length > 0) {
          // AI is sending at least one player file. Ensure we don't have others with different names.
          const existingPlayerFiles = this.fs.list().filter(f => {
            const lower = f.toLowerCase();
            return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
          });

          // If the AI is creating a NEW filename, delete the old ones
          for (const oldFile of existingPlayerFiles) {
            if (!data.files[oldFile]) {
              console.log(`Auto-cleaning duplicate/old player file: ${oldFile}`);
              this.fs.delete(oldFile);
            }
          }
        }
      }

      // ==================== ENHANCED MAP MERGE GUARD ====================
      if (data.files['CurrentMap.json']) {
        try {
          const rawIncoming = (data.files['CurrentMap.json'] as any)?.content ?? data.files['CurrentMap.json'];
          const incomingStr = typeof rawIncoming === 'object' ? JSON.stringify(rawIncoming) : String(rawIncoming);
          const incomingParsed = JSON.parse(incomingStr);
          const mergedMap = this.mergeAndNormalizeMap(incomingParsed, this.lastValidMap || this.fs.read('CurrentMap.json'), username);
          const mergedJson = JSON.stringify(mergedMap, null, 2);

          if (typeof data.files['CurrentMap.json'] === 'object' && (data.files['CurrentMap.json'] as any).content !== undefined) {
            (data.files['CurrentMap.json'] as any).content = mergedJson;
          } else {
            data.files['CurrentMap.json'] = mergedJson;
          }
          this.lastValidMap = mergedJson;
        } catch (e) {
          console.error("Map merge guard failed", e);
        }
      }
      
      // ==================== ADVANCE & SYNCHRONIZE WORLD TIME FIRST ====================
      let latestWorldTime = this.fs.read('WorldTime.txt') || undefined;

      // 1. If AI provided updated WorldTime.txt in files, write it immediately so character sync has the current time
      if (data.files['WorldTime.txt']) {
        const wtObj = data.files['WorldTime.txt'];
        const wtContent = typeof wtObj === 'string' ? wtObj : (wtObj as any)?.content;
        if (typeof wtContent === 'string' && wtContent.trim()) {
          latestWorldTime = wtContent;
          this.fs.write('WorldTime.txt', wtContent, (wtObj as any)?.displayName || 'World Time');
        }
      } else if (data.updates && Array.isArray(data.updates)) {
        // 2. If AI omitted WorldTime.txt but data.updates advanced time (e.g. type: 'time', "+3s", "Time passed: 3 seconds", etc.)
        let elapsedSec = 0;
        for (const u of data.updates) {
          const uText = (u.text || '').toLowerCase();
          if (u.type === 'time' || uText.includes('time pass') || uText.includes('elapsed') || uText.includes('time +')) {
            const timeMatch = uText.match(/(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/i);
            if (timeMatch) {
              const val = parseFloat(timeMatch[1]);
              const unit = timeMatch[2].toLowerCase();
              if (unit.startsWith('m')) elapsedSec += val * 60;
              else if (unit.startsWith('h')) elapsedSec += val * 3600;
              else if (unit.startsWith('d')) elapsedSec += val * 86400;
              else elapsedSec += val;
            }
          }
        }
        if (elapsedSec > 0 && latestWorldTime) {
          latestWorldTime = WeightInventoryEngine.advanceWorldTimestamp(latestWorldTime, elapsedSec);
          this.fs.write('WorldTime.txt', latestWorldTime, 'World Time');
          data.files['WorldTime.txt'] = latestWorldTime;
        }
      }

      // Sort files so WorldTime.txt is processed first, character sheets & entity files next,
      // and CurrentMap.json is processed strictly LAST so all character inventories & attachments are fully up to date!
      const sortedFileEntries = Object.entries(data.files).sort(([a], [b]) => {
        if (a === 'WorldTime.txt') return -1;
        if (b === 'WorldTime.txt') return 1;
        if (a === 'CurrentMap.json') return 1;
        if (b === 'CurrentMap.json') return -1;
        return 0;
      });
      
      for (const [filename, fileData] of sortedFileEntries) {
        if (fileData === null || (typeof fileData === 'object' && fileData.content === null)) {
          this.fs.delete(filename);
        } else {
          let contentStr = typeof fileData === 'string' ? fileData : (fileData as any).content;
          if (typeof contentStr === 'object') {
            contentStr = JSON.stringify(contentStr);
          }
          const displayName = (typeof fileData === 'object' && (fileData as any).displayName) ? (fileData as any).displayName : undefined;

          // Anti-Laziness Guard: Check for truncated placeholder files attempting to replace rich existing files
          const existingFile = this.fs.read(filename);
          if (typeof contentStr === 'string' && existingFile && existingFile.length > 250) {
            const isTruncatedPlaceholder = /\.\.\.\s*(?:rest of|same as|unchanged|previous|content continues)|\/\/\s*\.\.\.|\[rest of [^\]]+ unchanged\]|\[same as before\]/i.test(contentStr);
            if (isTruncatedPlaceholder) {
              console.warn(`[Anti-Laziness Guard] Detected placeholder/truncated file content for ${filename}. Preserving existing rich content.`);
              contentStr = existingFile;
            }
          }

          // Auto-synchronize weight, dimensions, containers, encumbrance, and status effects on character files
          if (typeof contentStr === 'string' && filename.endsWith('.txt') && (contentStr.includes('[NAME & DESCRIPTION]') || contentStr.includes('[STATS & MODIFIERS]') || contentStr.includes('[CONTAINERS') || contentStr.includes('[INVENTORY') || contentStr.includes('[STATUS EFFECTS'))) {
            try {
              const existingCharacterFile = existingFile;
              // If this is a newly created character file, enforce starting inventory carrying limit (<= 2x hand slots)
              if (!existingCharacterFile) {
                const limitEnforcement = WeightInventoryEngine.enforceStartingInventoryLimit(contentStr);
                if (limitEnforcement.modified) {
                  contentStr = limitEnforcement.updatedContent;
                  if (data.updates && Array.isArray(data.updates)) {
                    data.updates.push({
                      type: 'misc',
                      text: `Starting Inventory Limit Enforced: Carried items capped at ${limitEnforcement.maxAllowed} (2x ${limitEnforcement.handSlots} hand slots). Excess items (${limitEnforcement.movedItems.join(', ')}) placed in [OWNED / STORED ITEMS (NOT ON PERSON)].`,
                      value: 0
                    });
                  }
                }
              }

              const activeTime = latestWorldTime || this.fs.read('WorldTime.txt') || undefined;
              const syncResult = WeightInventoryEngine.syncCharacterFileContent(contentStr, activeTime);
              contentStr = syncResult.updatedContent;

              if (data.updates && Array.isArray(data.updates)) {
                // Report status effect expirations, transitions, and transformation appearances
                for (const chg of syncResult.changes) {
                  const chgLower = chg.toLowerCase();
                  if (chgLower.includes('expired') || chgLower.includes('transitioned') || chgLower.includes('appearance') || chgLower.includes('reverted body weight')) {
                    const alreadyPresent = data.updates.some(u => u.text && u.text.toLowerCase().includes(chgLower));
                    if (!alreadyPresent) {
                      data.updates.push({
                        type: 'status',
                        text: chg,
                        value: 0
                      });
                    }
                  }
                }

                const stats = syncResult.stats;
                if (stats.isEncumbered) {
                  const hasEncumberedUpdate = data.updates.some(u => u.text && u.text.toLowerCase().includes('encumber'));
                  if (!hasEncumberedUpdate) {
                    data.updates.push({
                      type: 'status',
                      text: `Encumbered: ${stats.totalCarriedWeight} lbs (${stats.encumbranceRatio}% body wt) - Speed reduced to ${stats.currentWalkingSpeed} m/s`,
                      value: -1
                    });
                  }
                }

                // Report overall overflow accidental drop chance
                if (stats.totalOverflowCount > 0) {
                  const hasOverallOverflowUpdate = data.updates.some(u => u.text && u.text.toLowerCase().includes('accidental drop risk'));
                  if (!hasOverallOverflowUpdate) {
                    data.updates.push({
                      type: 'misc',
                      text: `Overflow Alert: ${stats.totalOverflowCount} item(s) in overflow (${stats.overallOverflowDropChancePercent}% accidental drop risk). Heavier/bulkier items have higher chance of dropping than lighter/smaller ones!`,
                      value: 0
                    });
                  }
                }

                // Individual container overflow items with weight-scaled drop risk
                for (const cont of stats.containers) {
                  if (cont.hasOverflow) {
                    for (const item of cont.items) {
                      if (item.isOverflow) {
                        const hasOverflowUpdate = data.updates.some(u => u.text && u.text.includes(item.name) && u.text.includes('overflow'));
                        if (!hasOverflowUpdate) {
                          const dropPct = item.dropChancePercent || 25;
                          data.updates.push({
                            type: 'misc',
                            text: `Warning: [${item.name}] (${item.weight} lbs) overflows [${cont.name}] (${dropPct}% accidental drop risk - scaled by weight & size)`,
                            value: 0
                          });
                        }
                      }
                    }
                  }
                }

                // Individual held overflow items
                for (const held of stats.currentlyHolding) {
                  if (held.isOverflowHold) {
                    const hasHeldOverflowUpdate = data.updates.some(u => u.text && u.text.includes(held.name) && u.text.includes('overflow hold'));
                    if (!hasHeldOverflowUpdate) {
                      const dropPct = held.dropChancePercent || 25;
                      data.updates.push({
                        type: 'misc',
                        text: `Warning: [${held.name}] (${held.weight} lbs) held in overflow (${dropPct}% accidental drop risk - heavier/bulkier items drop first)`,
                        value: 0
                      });
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Weight & encumbrance sync error", err);
            }
          }

          const existing = this.fs.read(filename);
          if (existing === contentStr) continue;
          if (filename === 'CurrentMap.json') {
            this.writeMapSafe(contentStr, username);
          } else {
            this.fs.write(filename, contentStr, displayName);
          }
        }
      }
    }
  }

  /**
   * Safely writes CurrentMap.json by validating it is proper JSON first.
   * If the new content is invalid, attempts repair. If repair fails,
   * merges the old valid map data with any salvageable new data.
   */
  /**
   * Normalizes arbitrary AI map output structures into a standard { pages: [...] } schema.
   * Handles top-level page wrappers, arrays of pages, and legacy single-map flat objects.
   */
  private normalizeMapStructure(parsed: any): { pages: any[] } {
    if (!parsed || typeof parsed !== 'object') {
      return { pages: [] };
    }

    // Case 1: Already wrapped in standard schema: { pages: [...] }
    if (Array.isArray(parsed.pages)) {
      return parsed;
    }

    // Case 2: AI returned a direct top-level array of page objects: [{ name: "...", areas: [...] }, ...]
    if (Array.isArray(parsed)) {
      return { pages: parsed };
    }

    // Case 3: Flat single-page map object: { name?: "...", areas: [...], players: [...] }
    return { pages: [parsed] };
  }

  private getFileNamesList(): string[] {
    if (!this.fs) return [];
    if (typeof (this.fs as any).list === 'function') {
      return (this.fs as any).list();
    }
    if (typeof (this.fs as any).listFiles === 'function') {
      return (this.fs as any).listFiles();
    }
    if (typeof (this.fs as any).getAll === 'function') {
      return Object.keys((this.fs as any).getAll() || {});
    }
    if ((this.fs as any).files && typeof (this.fs as any).files === 'object') {
      return Object.keys((this.fs as any).files);
    }
    return [];
  }

  /**
   * Cleans any duplicate player occurrences across or within pages.
   * Ensures each player exists strictly ONCE across the entire map,
   * purging any stale positions left from prior turns or previous map scenes.
   */
  private cleanDuplicatePlayerPositions(
    normalized: { pages: any[] },
    oldPlayerLocations: Map<string, { pageIndex: number; pageName: string; x: number; y: number; facing: number; raw: any }>,
    username?: string,
    playerRegistry?: RegisteredPlayer[]
  ): void {
    if (!normalized.pages || normalized.pages.length === 0) return;
    const allFiles = this.getFileNamesList();
    const registry = playerRegistry || buildPlayerRegistry(allFiles, this.fs);
    deduplicatePlayersOnMap(normalized.pages, registry, {
      activeUsername: username,
      oldPlayerLocations
    });
  }

  /**
   * Deeply merges incoming AI map with previous valid map and file system character states.
   * Ensures players, landmarks, NPCs, items, and areas are not inadvertently omitted or deleted,
   * while strictly preventing duplicate player records when transitioning between maps.
   */
  private mergeAndNormalizeMap(incomingParsed: any, oldMapStr: string | null, username?: string): any {
    const normalized = this.normalizeMapStructure(incomingParsed);
    if (!normalized.pages || normalized.pages.length === 0) {
      normalized.pages = [{ name: 'World Map', areas: [], players: [], items: [], landmarks: [] }];
    }

    const allFileNames = this.getFileNamesList();
    const playerRegistry = buildPlayerRegistry(allFileNames, this.fs);

    // Distribute root-level entities to page 0 only if undefined on page 0
    const hasAnyPagePlayers = normalized.pages.some((p: any) => Array.isArray(p.players) && p.players.length > 0);
    if (!hasAnyPagePlayers && Array.isArray((incomingParsed as any)?.players) && (incomingParsed as any).players.length > 0) {
      if (normalized.pages[0].players === undefined) {
        normalized.pages[0].players = (incomingParsed as any).players;
      }
    }
    if (Array.isArray((incomingParsed as any)?.items) && (incomingParsed as any).items.length > 0) {
      if (normalized.pages[0].items === undefined) {
        normalized.pages[0].items = (incomingParsed as any).items;
      }
    }
    if (Array.isArray((incomingParsed as any)?.landmarks) && (incomingParsed as any).landmarks.length > 0) {
      if (normalized.pages[0].landmarks === undefined) {
        normalized.pages[0].landmarks = (incomingParsed as any).landmarks;
      }
    }
    if (Array.isArray((incomingParsed as any)?.npcs) && (incomingParsed as any).npcs.length > 0) {
      if (normalized.pages[0].npcs === undefined) {
        normalized.pages[0].npcs = (incomingParsed as any).npcs;
      }
    }

    let oldMap: any = null;
    if (oldMapStr) {
      try {
        const rawOld = typeof oldMapStr === 'object' ? oldMapStr : JSON.parse(oldMapStr);
        oldMap = this.normalizeMapStructure(rawOld);
      } catch (e) {
        // ignore parse error of old map
      }
    }

    // Map each player's previous position from the old map
    const oldPlayerLocations = new Map<string, { pageIndex: number; pageName: string; x: number; y: number; facing: number; raw: any }>();
    if (oldMap && Array.isArray(oldMap.pages)) {
      for (let pIdx = 0; pIdx < oldMap.pages.length; pIdx++) {
        const oPage = oldMap.pages[pIdx];
        const oPageName = (oPage.name || '').trim().toLowerCase();
        if (Array.isArray(oPage.players)) {
          for (const pl of oPage.players) {
            const res = resolvePlayerIdentity(pl, playerRegistry);
            const key = res.canonicalKey;
            if (key && !oldPlayerLocations.has(key)) {
              oldPlayerLocations.set(key, {
                pageIndex: pIdx,
                pageName: oPageName,
                x: Number(pl.x) || 0,
                y: Number(pl.y) || 0,
                facing: Number(pl.facing) || 0,
                raw: pl
              });
            }
          }
        }
      }
    }

    // Multi-page preservation:
    // Only preserve additional distinct pages if the old map explicitly had MULTIPLE distinct pages (> 1)
    // AND the incoming map explicitly returned MULTIPLE pages with different names.
    // If incoming is a single page or replacing the current map scene, update that scene directly (do not duplicate into extra pages!).
    if (oldMap && Array.isArray(oldMap.pages) && oldMap.pages.length > 1 && normalized.pages.length > 1) {
      const returnedNames = new Set(normalized.pages.map((p: any) => (p.name || '').trim().toLowerCase()));
      for (const oldPage of oldMap.pages) {
        const oldName = (oldPage.name || '').trim().toLowerCase();
        if (oldName && !returnedNames.has(oldName)) {
          const clonedPage = JSON.parse(JSON.stringify(oldPage));
          normalized.pages.push(clonedPage);
          returnedNames.add(oldName);
        }
      }
    }

    // Gather all possessions of registered players and known item files to avoid normalizing items as NPCs or loose ground entities
    const knownPossessions = new Set<string>();
    const registerPossession = (str: string) => {
      if (!str) return;
      const lower = str.trim().toLowerCase();
      if (!lower || lower.length < 2) return;
      knownPossessions.add(lower);
      const unspaced = lower.replace(/[\s_-]+/g, '');
      if (unspaced.length >= 2) knownPossessions.add(unspaced);
      const pascal = str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      if (pascal !== lower && pascal.length >= 2) knownPossessions.add(pascal);
    };

    if (playerRegistry) {
      for (const reg of playerRegistry) {
        const c = this.fs.read(reg.filename);
        if (c) {
          extractAllPossessionsFromCharacterSheet(c).forEach(p => registerPossession(p));
        }
      }
    }
    for (const f of allFileNames) {
      if (f.endsWith('.txt')) {
        const c = this.fs.read(f);
        if (c) {
          extractAllPossessionsFromCharacterSheet(c).forEach(p => registerPossession(p));
          // If the file represents an item, vehicle, or equipment attached to someone
          if (
            /category\s*[:=]\s*(?:item|equipment|gear|weapon|vehicle|mount|container|armor|tool|transport)/i.test(c) ||
            /(?:attached|equipped|hitched|towed|held|carried|riding)\s*(?:to|by)?\s*[:=]/i.test(c) ||
            /\[(?:IDENTIFICATION|TECHNICAL RULES|SPECIAL PROPERTIES|CONDITION & ACTIVE EFFECTS)\]/i.test(c)
          ) {
            const base = f.replace(/\.txt$/, '');
            registerPossession(base);
            const nameMatch = c.match(/[-*•]?\s*Name\s*[:=]\s*([^\n\r]+)/i);
            if (nameMatch && nameMatch[1]) {
              registerPossession(nameMatch[1].replace(/\[[^\]]+\]/g, ''));
            }
          }
        }
      }
    }

    const isPossessionMatch = (name: string): boolean => {
      if (!name) return false;
      const clean = name.toLowerCase().replace(/[-_]npc$/i, '').trim();
      if (!clean) return false;
      if (knownPossessions.has(clean)) return true;
      const unspaced = clean.replace(/[\s_-]+/g, '');
      if (knownPossessions.has(unspaced)) return true;
      const pascal = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[-_]npc$/i, '').trim();
      if (knownPossessions.has(pascal)) return true;
      for (const p of knownPossessions) {
        if (clean === p || clean.includes(p) || p.includes(clean) || areItemNamesEquivalent(clean, p) || areItemNamesEquivalent(pascal, p)) return true;
      }
      return false;
    };

    // Ensure all entities are initialized arrays and normalize NPC naming
    for (const page of normalized.pages) {
      if (!Array.isArray(page.areas)) page.areas = [];
      if (!Array.isArray(page.players)) page.players = [];
      if (!Array.isArray(page.items)) page.items = [];
      if (!Array.isArray(page.landmarks)) page.landmarks = [];
      if (!Array.isArray(page.npcs)) page.npcs = [];

      const isFreeHandTag = (name: string): boolean => {
        const clean = String(name || '').toLowerCase().replace(/[-_]npc$/i, '').trim();
        return !clean || clean === 'free hand' || clean === 'empty hand' || clean === 'bare hand' || clean === 'open hand';
      };

      // Purge any loose ground items or landmarks that match a player's possession, free hand tags, or are attached
      page.items = page.items.filter((it: any) => it && it.name && !isFreeHandTag(it.name) && !isPossessionMatch(it.name) && !it.attachedTo && !it.isHeld && (!it.holder || it.holder === 'ground'));
      page.landmarks = page.landmarks.filter((lm: any) => lm && lm.name && !isFreeHandTag(lm.name) && !isPossessionMatch(lm.name) && !lm.attachedTo);

      // Purge any areas that represent items, weapons, equipment, free hand tags, or character possessions
      page.areas = page.areas.filter((a: any) => {
        if (!a || typeof a !== 'object') return false;
        const aName = String(a.name || '');
        if (isFreeHandTag(aName) || isPossessionMatch(aName) || a.attachedTo || a.isHeld || (a.holder && a.holder !== 'ground')) return false;
        return true;
      });

      // Purge any NPCs that match a possessed, held, attached item/vehicle, or free hand tags
      page.npcs = page.npcs.filter((n: any) => {
        if (!n || typeof n !== 'object') return false;
        const nName = String(n.name || '').trim();
        // If entity matches an item, piece of equipment, attached cart, vehicle, or free hand tag, purge it from NPCs!
        if (isFreeHandTag(nName) || isPossessionMatch(nName) || n.attachedTo || n.isHeld || (n.holder && n.holder !== 'ground')) {
          return false;
        }
        return true;
      }).map((n: any) => {
        let nName = (n.name || '').trim();
        if (nName && !nName.toLowerCase().endsWith('-npc')) {
          nName = `${nName}-npc`;
        }
        return { ...n, name: nName };
      });

      // Also purge creatures and entities if present on page
      if (Array.isArray(page.creatures)) {
        page.creatures = page.creatures.filter((c: any) => {
          if (!c || typeof c !== 'object') return false;
          const cName = String(c.name || '').trim();
          if (isFreeHandTag(cName) || isPossessionMatch(cName) || c.attachedTo || c.isHeld) return false;
          return true;
        });
      }
      if (Array.isArray(page.entities)) {
        page.entities = page.entities.filter((e: any) => {
          if (!e || typeof e !== 'object') return false;
          const eName = String(e.name || '').trim();
          if (isFreeHandTag(eName) || isPossessionMatch(eName) || e.attachedTo || e.isHeld) return false;
          return true;
        });
      }
    }

    // Clean duplicate players across and within pages (removes player's stale last position)
    deduplicatePlayersOnMap(normalized.pages, playerRegistry, {
      activeUsername: username,
      oldPlayerLocations
    });

    // 3. File-System Player Verification:
    // Ensure every player with a character file is represented on the map
    try {
      // Reconcile players cleanly using player registry
      reconcileRegisteredPlayersOnMap(normalized.pages, playerRegistry);

      // Purge any accidental player duplicates from npcs
      purgePlayerDuplicatesFromNpcs(normalized.pages, playerRegistry);
      deduplicatePlayersOnMap(normalized.pages, playerRegistry, {
        activeUsername: username
      });

      // Clean and deduplicate cloned or duplicate NPCs across map pages
      deduplicateNpcsOnMap(normalized.pages, allFileNames);

      // Reconcile and snap any held items with range that were placed far away back to their holder
      reconcileHeldItemsOnMap(normalized.pages, this.fs, playerRegistry);
    } catch (e) {
      console.error("Player reconciliation on map failed", e);
    }

    // Synchronize and dynamically validate vision, blindness, and facing for all players and NPCs
    syncMapEntitiesVision(normalized, this.fs);

    return normalized;
  }

  /**
   * Safely writes CurrentMap.json by validating it is proper JSON first.
   * Enforces structural schema normalization to prevent nested or corrupt arrays.
   * Attempts sequential fallback: direct parse -> repairJSON -> lastValidMap -> sanitizeJSON.
   */
  private writeMapSafe(content: string, username?: string): void {
    // 1. Direct parse attempt with normalization and merging
    try {
      const parsed = JSON.parse(content);
      const mergedObj = this.mergeAndNormalizeMap(parsed, this.lastValidMap || this.fs.read('CurrentMap.json'), username);
      const normalized = JSON.stringify(mergedObj, null, 2);
      this.fs.write('CurrentMap.json', normalized);
      this.lastValidMap = normalized;
      return;
    } catch (e) {
      // Direct parse failed, fall through to repair
    }

    // 2. Syntax auto-repair attempt
    const repaired = this.repairJSON(content);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        const mergedObj = this.mergeAndNormalizeMap(parsed, this.lastValidMap || this.fs.read('CurrentMap.json'), username);
        const normalized = JSON.stringify(mergedObj, null, 2);
        this.fs.write('CurrentMap.json', normalized);
        this.lastValidMap = normalized;
        console.warn('CurrentMap.json required JSON repair — repaired and normalized successfully');
        return;
      } catch (e) {
        // Repair wasn't sufficient, fall through
      }
    }

    // 3. Fallback to last known good map state
    if (this.lastValidMap) {
      console.warn('CurrentMap.json had malformed JSON — falling back to last valid map');
      this.fs.write('CurrentMap.json', this.lastValidMap);
      return;
    }

    // 4. Last resort: aggressive string sanitization
    try {
      const sanitized = this.sanitizeJSON(content);
      const parsed = JSON.parse(sanitized);
      const mergedObj = this.mergeAndNormalizeMap(parsed, this.lastValidMap || this.fs.read('CurrentMap.json'), username);
      const normalized = JSON.stringify(mergedObj, null, 2);
      this.fs.write('CurrentMap.json', normalized);
      this.lastValidMap = normalized;
      console.warn('CurrentMap.json required sanitization — recovered and normalized successfully');
      return;
    } catch (e) {
      console.error('CurrentMap.json is completely unrecoverable — discarding corrupt update');
    }
  }

  private getWorldContextForAI(username?: string, action?: string): string {
    const files = this.getRelevantFiles(username, action);
    const contextBlocks: string[] = [];

    for (const [filename, content] of Object.entries(files)) {
      contextBlocks.push(`=== FILE: ${filename} ===\n${content}`);
    }
    return contextBlocks.join('\n\n');
  }

  /**
   * Uses AI to dynamically detect which rules apply to the given action.
   * Instead of just picking strings, the AI interprets context and returns structured math bits.
   */
  private async detectRelevantModifiers(actionDesc: string, worldContext: string, username?: string): Promise<DetectedModifier[]> {
    if (!worldContext) return [];

    const detectionPrompt = `TASK: Analyze the provided World Context and identify ALL modifiers, character stats, active conditions, and world rules that logically affect this action: "${actionDesc}".
    ${username ? `ACTOR: The player "${username}".` : ''}
    
World Context:
${worldContext}

INSTRUCTIONS:
1. Identify every factor that mathematically influences the outcome based on CONTEXT (not just literal matches).
2. For each factor, extract the "Mathematical Essence" exactly as written in the text.
   - For stats/formulas (e.g. "Strength: base + 10%(1000)"), extract the math after the colon.
   - For flat bonuses (e.g. "+5 to hit"), extract the value.
   - For status effects (e.g. "[Status:Bleeding: -10]"), extract the value.
3. Only include factors that apply to the ACTOR or the WORLD generally.
4. IGNORE TIME COSTS: Never include time-based strings (e.g. "+30s", "10 seconds", "1m") as modifiers. They are for the player's duration of action, not the probability check.
5. Return a JSON array of objects with this exact structure:
   {
     "label": "Short name for the breakdown",
     "math": "The numeric expression or variable name",
     "origin_file": "The filename where this was found",
     "reasoning": "Brief explanation of why this applies to this specific action"
   }
5. Return ONLY the JSON array. If nothing applies, return [].`;

    try {
      const response = await this.callAI(detectionPrompt);
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const detected = JSON.parse(cleaned);
      if (Array.isArray(detected)) {
        return detected;
      }
    } catch (e) {
      console.warn("AI modifier detection failed.", e);
    }
    return [];
  }

  /**
   * Calculates numeric bonus from a specific set of AI-selected rule strings.
   */
  /**
   * Calculates numeric bonus from AI-detected structured modifiers.
   * Resolves formulas and variables using the system's math engine.
   */
  private calculateBonusFromAI(detected: DetectedModifier[], username?: string): { total: number, breakdown: string } {
    const files = this.fs.getAll();
    let totalBonus = 0;
    const breakdownParts: string[] = [];
    const resolvedVarsInFormulas = new Set<string>();

    const charFile = username ? this.fs.list().find(f => f.toLowerCase().includes(username.toLowerCase()) && f.endsWith('.txt')) : undefined;

    // Sort to process formulas (which define base stats) before modifiers that might add to them
    const sorted = [...detected].sort((a, b) => {
      const aIsFormula = a.math.includes('base') || a.math.includes('+') || a.math.includes('%');
      const bIsFormula = b.math.includes('base') || b.math.includes('+') || b.math.includes('%');
      if (aIsFormula && !bIsFormula) return -1;
      if (!aIsFormula && bIsFormula) return 1;
      return 0;
    });

    for (const mod of sorted) {
      const rhs = mod.math.trim();

      // Determine if it's a complex formula (system math required)
      const isFormula = rhs.includes('base') || (rhs.split('+').length > 1);

      if (isFormula) {
        const preferredFiles = [mod.origin_file, charFile].filter((f): f is string => !!f);
        const formulaBonus = this.executeMath(rhs, files, preferredFiles);
        if (formulaBonus !== 0) {
          totalBonus += formulaBonus;
          breakdownParts.push(`${mod.label}: ${formulaBonus > 0 ? '+' : ''}${formulaBonus}`);
        }

        // Track variables consumed by this formula to avoid double counting
        const parts = rhs.split('+').map(p => p.trim().toLowerCase());
        for (const p of parts) {
          if (/^\w+$/.test(p) && p !== 'base') resolvedVarsInFormulas.add(p);
        }
      } else {
        // Simple value or variable
        const vLower = rhs.toLowerCase();
        if (resolvedVarsInFormulas.has(vLower)) continue;

        const val = this.parseValue(rhs);
        if (val !== 0) {
          totalBonus += val;
          breakdownParts.push(`${mod.label}: ${val > 0 ? '+' : ''}${val}`);
        } else if (/^\w+$/.test(rhs)) {
          // Might be a variable reference
          const resolved = this.resolveVariable(rhs, files, [mod.origin_file, charFile].filter((f): f is string => !!f));
          if (resolved !== 0) {
            totalBonus += resolved;
            breakdownParts.push(`${mod.label}: ${resolved > 0 ? '+' : ''}${resolved}`);
          }
        }
      }
    }

    return { total: totalBonus, breakdown: breakdownParts.join(' + ').replace(/\+ -/g, '- ') };
  }

  /**
   * Wrapper for parseFormula that works directly on the RHS/Math portion
   */
  private executeMath(mathExpr: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    // parseFormula expects "Key: formula", so we give it a dummy key
    return this.parseFormula(`eval: ${mathExpr}`, allFiles, preferredFiles);
  }


  /**
   * Helper to check if a username belongs to a player (has a character file)
   */
  private isKnownPlayer(username: string): boolean {
    return this.fs.list().some(f => f.toLowerCase().includes(username.toLowerCase()) && f.endsWith('.txt'));
  }

  /**
   * Parses complex formulae like "base + 15%(1000) + bonus_var"
   */
  private parseFormula(formulaLine: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    const rhs = formulaLine.split(/[:=]/)[1] || '';
    // Split by '+' but IGNORE '+' inside brackets/parentheses for now
    const parts = rhs.split(/\+(?![^\[]*\])/).map(p => p.trim());
    let bonus = 0;

    for (const part of parts) {
      if (part.toLowerCase().includes('base')) continue;

      // Handle percentage of 1000: "15%(1000)" or just "15%"
      const pctMatch = part.match(/([+-]?\d+)\s*%\s*(\(\s*1000\s*\))?/);
      if (pctMatch) {
        bonus += (parseInt(pctMatch[1]) / 100) * 1000;
        continue;
      }

      // Handle raw numbers (including negative)
      if (/^[+-]?\s*\d+$/.test(part)) {
        bonus += parseInt(part.replace(/\s+/g, ''));
        continue;
      }

      // Handle Bracketed Status/Effect bonuses: [Status:NAME: +X]
      const bracketMatch = part.match(/\[(?:Status|Condition|Effect):.*?[:=]\s*([+-]?\s*\d+.*?)\]/i);
      if (bracketMatch) {
        bonus += this.parseValue(bracketMatch[1]);
        continue;
      }

      // Handle variable references (e.g., "suit_mobility_bonus" or "armor bonus")
      // Allow spaces and underscores
      if (/^[\w\s]+$/.test(part)) {
        const cleanVar = part.trim();
        if (cleanVar === 'effects') continue; // skip placeholder
        bonus += this.resolveVariable(cleanVar, allFiles, preferredFiles);
      }
    }

    return bonus;
  }

  /**
   * Searches files for a variable definition like "suit_mobility_bonus: 50"
   * Prioritizes preferred files if provided (Multiplayer support).
   */
  private resolveVariable(varName: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    const vLower = varName.toLowerCase();

    // 1. Check preferred files first (e.g. Origin of formula or Actor character file)
    if (preferredFiles) {
      for (const f of preferredFiles) {
        const content = allFiles[f];
        if (content) {
          const val = this.findVarInContent(vLower, content);
          if (val !== null) return val;
        }
      }
    }

    // 2. Fallback to global search
    for (const content of Object.values(allFiles)) {
      const val = this.findVarInContent(vLower, content);
      if (val !== null) return val;
    }
    return 0;
  }

  private findVarInContent(varName: string, content: string): number | null {
    const lines = content.split('\n');
    for (const line of lines) {
      const lLower = line.toLowerCase();
      const varMatch = lLower.match(/^(?:[\s\-*>]|\d+\.)*\s*(\w+)\s*[:=]\s*(.*)$/);
      if (varMatch && varMatch[1] === varName) {
        return this.parseValue(varMatch[2]);
      }
    }
    return null;
  }

  /**
   * Converts strings like "+5%", "10", "-15%(1000)" to numeric bonuses on a 0-1000 scale.
   */
  private parseValue(valStr: string): number {
    const clean = valStr.replace(/\s+/g, '').toLowerCase();

    // Ignore time-based values (+10s, 30sec, 1m) to prevent leaks into math engine
    if (clean.match(/[+-]?\d+(s|sec|seconds|m|min|minutes|h|hr|hours)$/)) {
      return 0;
    }

    if (clean.includes('%')) {
      const numMatch = clean.match(/([+-]?\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        // Whether it's "15%" or "15%(1000)", it's the same math in our engine
        return (num / 100) * 1000;
      }
    }
    return parseInt(clean) || 0;
  }
  private cachedAI: GoogleGenAI | null = null;
  private cachedAIKey: string | null = null;

  private getAI(): GoogleGenAI {
    const customKey = typeof window !== 'undefined'
      ? (localStorage.getItem('aifinity_custom_api_key') || localStorage.getItem('aimud_apikey'))
      : null;
    const activeKey = customKey || process.env.API_KEY || '';
    if (!this.cachedAI || this.cachedAIKey !== activeKey) {
      this.cachedAI = new GoogleGenAI({ apiKey: activeKey });
      this.cachedAIKey = activeKey;
    }
    return this.cachedAI;
  }

  private lastActionUsage: ActionUsageCost | null = null;
  private currentTurnAccumulatedUsage = {
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0,
    calls: 0,
    model: 'gemini-3.8-flash'
  };

  public getLastActionUsage(): ActionUsageCost | null {
    return this.lastActionUsage;
  }

  public resetTurnUsage(): void {
    this.currentTurnAccumulatedUsage = {
      promptTokens: 0,
      candidatesTokens: 0,
      totalTokens: 0,
      calls: 0,
      model: 'gemini-3.8-flash'
    };
    this.lastActionUsage = null;
  }

  private async callAI(prompt: string, mapScreenshot?: string, modelName?: string): Promise<string> {
    const controller = new AbortController();
    this.currentAbortController = controller;
    // 2-minute request timeout (120,000ms)
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        // ignore
      }
    }, 120000);

    try {
      let contents: any;
      if (mapScreenshot) {
        contents = [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: mapScreenshot
                }
              }
            ]
          }
        ];
      } else {
        contents = [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ];
      }

      const activeModel = modelName || (typeof process !== 'undefined' && process.env?.VITE_GEMINI_MODEL) || 'gemini-3.8-flash';
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 16384,
          abortSignal: controller.signal
        }
      });

      clearTimeout(timeoutId);
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }

      // Track token usage & calculate accurate cost based on model rates:
      // gemini-3.8-flash rates:
      // Input tokens: $0.15 per 1,000,000 tokens ($0.00000015 per token)
      // Output tokens: $0.60 per 1,000,000 tokens ($0.00000060 per token)
      // gemini-3.1-flash-lite rates:
      // Input tokens: $0.10 per 1,000,000 tokens ($0.00000010 per token)
      // Output tokens: $0.40 per 1,000,000 tokens ($0.00000040 per token)
      const isFlashLite = activeModel.includes('flash-lite');
      const inputPricePerM = isFlashLite ? 0.10 : 0.15;
      const outputPricePerM = isFlashLite ? 0.40 : 0.60;

      const meta = (response as any).usageMetadata;
      const respText = response.text || "{}";
      const pTokens = (meta?.promptTokenCount && meta.promptTokenCount > 0)
        ? meta.promptTokenCount
        : Math.max(1, Math.ceil(prompt.length / 3.8));
      const cTokens = (meta?.candidatesTokenCount && meta.candidatesTokenCount > 0)
        ? meta.candidatesTokenCount
        : Math.max(1, Math.ceil(respText.length / 3.8));
      const tTokens = meta?.totalTokenCount || (pTokens + cTokens);

      this.currentTurnAccumulatedUsage.promptTokens += pTokens;
      this.currentTurnAccumulatedUsage.candidatesTokens += cTokens;
      this.currentTurnAccumulatedUsage.totalTokens += tTokens;
      this.currentTurnAccumulatedUsage.calls = (this.currentTurnAccumulatedUsage.calls || 0) + 1;
      this.currentTurnAccumulatedUsage.model = activeModel;

      const inputCost = (this.currentTurnAccumulatedUsage.promptTokens * inputPricePerM) / 1_000_000;
      const outputCost = (this.currentTurnAccumulatedUsage.candidatesTokens * outputPricePerM) / 1_000_000;
      const totalCost = inputCost + outputCost;
      const totalCalls = this.currentTurnAccumulatedUsage.calls;
      const passesLabel = totalCalls > 1 ? ` (${totalCalls} passes)` : '';

      this.lastActionUsage = {
        promptTokens: this.currentTurnAccumulatedUsage.promptTokens,
        candidatesTokens: this.currentTurnAccumulatedUsage.candidatesTokens,
        totalTokens: this.currentTurnAccumulatedUsage.totalTokens,
        inputCost,
        outputCost,
        totalCost,
        calls: totalCalls,
        model: activeModel,
        costFormatted: `Total Action Cost: $${totalCost.toFixed(6)} total ($${inputCost.toFixed(6)} input + $${outputCost.toFixed(6)} output | ${this.currentTurnAccumulatedUsage.promptTokens.toLocaleString()} in, ${this.currentTurnAccumulatedUsage.candidatesTokens.toLocaleString()} out · ${activeModel}${passesLabel})`
      };

      return respText;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        throw new Error('AI request timed out (exceeded 2 minutes) or was cancelled.');
      }
      console.error("Gemini API Call Failed", e);
      throw e;
    }
  }
}
