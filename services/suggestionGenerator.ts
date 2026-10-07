
interface TaggedWord {
    text: string;
    tags: string[];
}

const adjectives: TaggedWord[] = [
    { text: 'cosmic', tags: ['sci-fi', 'space'] },
    { text: 'gritty', tags: [] },
    { text: 'lush', tags: ['nature'] },
    { text: 'decaying', tags: [] },
    { text: 'neon-drenched', tags: ['sci-fi'] },
    { text: 'frozen', tags: [] },
    { text: 'floating', tags: ['fantasy'] },
    { text: 'ancient', tags: ['fantasy'] },
    { text: 'sentient', tags: ['sci-fi'] },
    { text: 'crystalline', tags: ['fantasy', 'sci-fi'] },
    { text: 'radioactive', tags: ['sci-fi'] },
    { text: 'underwater', tags: ['water'] },
    { text: 'steam-powered', tags: ['steampunk'] },
    { text: 'volcanic', tags: ['dry'] },
    { text: 'dreamlike', tags: ['fantasy'] },
    { text: 'monolithic', tags: [] },
    { text: 'overgrown', tags: ['nature'] },
    { text: 'shadow-infested', tags: ['fantasy', 'horror'] },
    { text: 'golden', tags: [] },
    { text: 'hollow', tags: [] },
    { text: 'cybernetic', tags: ['sci-fi'] },
    { text: 'eldritch', tags: ['fantasy', 'horror'] },
    { text: 'mechanical', tags: ['steampunk', 'sci-fi'] },
    { text: 'spectral', tags: ['fantasy', 'horror'] },
    { text: 'verdant', tags: ['nature'] },
    { text: 'desolate', tags: [] },
    { text: 'opulent', tags: [] },
    { text: 'eternal', tags: [] },
    { text: 'fractal', tags: ['sci-fi'] },
    { text: 'astral', tags: ['fantasy', 'space'] },
    { text: 'obsidian', tags: [] },
    { text: 'forgotten', tags: [] },
    { text: 'shimmering', tags: [] }
];

const classes: TaggedWord[] = [
    { text: 'detective', tags: ['steampunk', 'sci-fi'] },
    { text: 'mage', tags: ['fantasy'] },
    { text: 'scavenger', tags: [] },
    { text: 'knight', tags: ['fantasy'] },
    { text: 'bio-hacker', tags: ['sci-fi'] },
    { text: 'priest', tags: [] },
    { text: 'mercenary', tags: [] },
    { text: 'scholar', tags: [] },
    { text: 'pilot', tags: ['sci-fi', 'space'] },
    { text: 'druid', tags: ['fantasy', 'nature'] },
    { text: 'monk', tags: ['fantasy'] },
    { text: 'engineer', tags: ['steampunk', 'sci-fi'] },
    { text: 'assassin', tags: [] },
    { text: 'bard', tags: ['fantasy'] },
    { text: 'merchant', tags: [] },
    { text: 'chronomancer', tags: ['fantasy', 'sci-fi'] },
    { text: 'necro-technician', tags: ['sci-fi', 'horror'] },
    { text: 'spacer', tags: ['sci-fi', 'space'] },
    { text: 'gladiator', tags: ['fantasy'] },
    { text: 'rogue', tags: ['fantasy'] },
    { text: 'alchemist', tags: ['fantasy', 'steampunk'] },
    { text: 'bounty hunter', tags: ['sci-fi'] },
    { text: 'diplomat', tags: [] },
    { text: 'exorcist', tags: ['fantasy', 'horror'] },
    { text: 'inquisitor', tags: ['fantasy'] },
    { text: 'navigator', tags: ['space', 'sci-fi'] },
    { text: 'oracle', tags: ['fantasy'] },
    { text: 'paladin', tags: ['fantasy'] },
    { text: 'ranger', tags: ['nature', 'fantasy'] },
    { text: 'technomancer', tags: ['sci-fi', 'fantasy'] },
    { text: 'warden', tags: [] },
    { text: 'warlock', tags: ['fantasy'] },
    { text: 'witch', tags: ['fantasy'] },
    { text: 'samurai', tags: ['fantasy', 'sci-fi'] },
    { text: 'cyber-samurai', tags: ['sci-fi'] },
    { text: 'void-walker', tags: ['space', 'sci-fi', 'fantasy'] },
    { text: 'dream-weaver', tags: ['fantasy'] },
    { text: 'runesmith', tags: ['fantasy'] },
    { text: 'beast-master', tags: ['nature', 'fantasy'] }
];

const settings: TaggedWord[] = [
    { text: 'Neo-Tokyo', tags: ['sci-fi', 'urban'] },
    { text: 'a dying nebula', tags: ['sci-fi', 'space'] },
    { text: 'an orbital prison', tags: ['sci-fi', 'space'] },
    { text: 'a subterranean jungle', tags: ['nature'] },
    { text: 'a Victorian cloud-city', tags: ['steampunk'] },
    { text: 'the belly of a leviathan', tags: ['fantasy', 'water'] },
    { text: 'a desert of glass', tags: ['dry'] },
    { text: 'a clockwork fortress', tags: ['steampunk', 'fantasy'] },
    { text: 'a sentient library', tags: ['fantasy'] },
    { text: 'a lunar colony', tags: ['sci-fi', 'space'] },
    { text: 'the ruins of Atlantis', tags: ['fantasy', 'water'] },
    { text: 'a digital afterlife', tags: ['sci-fi'] },
    { text: 'a parasitic planet', tags: ['sci-fi', 'space', 'horror'] },
    { text: 'a canyon of whispering bones', tags: ['fantasy', 'horror'] },
    { text: 'a sky-ocean', tags: ['fantasy', 'water'] },
    { text: 'a mega-mall at the end of time', tags: ['sci-fi'] },
    { text: 'the edge of a black hole', tags: ['sci-fi', 'space'] },
    { text: 'a hive-world', tags: ['sci-fi'] },
    { text: 'a floating monastery', tags: ['fantasy'] },
    { text: 'a gravity-defying archipelago', tags: ['fantasy'] },
    { text: 'a world made of circuitry', tags: ['sci-fi'] },
    { text: 'a prehistoric asteroid', tags: ['space'] },
    { text: 'a valley of giant mushrooms', tags: ['nature', 'fantasy'] },
    { text: 'a city inside a giant robot', tags: ['sci-fi', 'steampunk'] },
    { text: 'a labyrinthine salt mine', tags: [] },
    { text: 'a forest of giant crystals', tags: ['nature', 'fantasy'] },
    { text: 'a frozen ocean on Europa', tags: ['sci-fi', 'space', 'water'] },
    { text: 'a steam-punk London', tags: ['steampunk'] },
    { text: 'a Mars colony in revolt', tags: ['sci-fi', 'space'] },
    { text: 'a haunted space station', tags: ['sci-fi', 'space', 'horror'] }
];

const goals: TaggedWord[] = [
    { text: 'a lost memory', tags: [] },
    { text: 'the spark of creation', tags: ['fantasy', 'sci-fi'] },
    { text: 'a cure for a planet-wide plague', tags: ['sci-fi'] },
    { text: 'revenge against a god', tags: ['fantasy'] },
    { text: 'the key to the multiverse', tags: ['sci-fi', 'fantasy'] },
    { text: 'the last remaining seed', tags: ['nature'] },
    { text: 'a way home', tags: [] },
    { text: 'the hidden treasure of a dead star', tags: ['sci-fi', 'space'] },
    { text: 'a forbidden spell', tags: ['fantasy'] },
    { text: 'a legendary artifact', tags: ['fantasy'] },
    { text: 'a missing sibling', tags: [] },
    { text: 'the truth behind the Veil', tags: ['fantasy', 'horror'] },
    { text: 'an audience with the Emperor', tags: [] },
    { text: 'the ultimate weapon', tags: [] },
    { text: 'a way to stop time', tags: ['fantasy', 'sci-fi'] },
    { text: 'the source of the corruption', tags: ['fantasy', 'horror'] },
    { text: 'a mythical beast', tags: ['fantasy'] },
    { text: 'a sunken city', tags: ['water', 'fantasy'] },
    { text: 'the heart of the machine', tags: ['sci-fi', 'steampunk'] },
    { text: 'a lost starship', tags: ['sci-fi', 'space'] }
];

const backgrounds: TaggedWord[] = [
    { text: 'from a noble house', tags: [] },
    { text: 'raised by wolves', tags: ['nature'] },
    { text: 'who escaped a slave camp', tags: [] },
    { text: 'with a mysterious tattoo', tags: ['fantasy'] },
    { text: 'seeking redemption', tags: [] },
    { text: 'haunted by ghosts', tags: ['horror', 'fantasy'] },
    { text: 'trained in secret', tags: [] },
    { text: 'who possesses a cursed item', tags: ['fantasy', 'horror'] },
    { text: 'burdened by debt', tags: [] },
    { text: 'with a photographic memory', tags: ['sci-fi'] },
    { text: 'born under a blood moon', tags: ['fantasy', 'horror'] },
    { text: 'who can see the future', tags: ['fantasy'] },
    { text: 'who survived a catastrophe', tags: [] },
    { text: 'carrying a secret message', tags: [] },
    { text: 'exiled from their homeland', tags: [] },
    { text: 'who was once a king', tags: ['fantasy'] },
    { text: 'born in a test tube', tags: ['sci-fi'] },
    { text: 'with a mechanical heart', tags: ['steampunk', 'sci-fi'] },
    { text: 'who speaks with animals', tags: ['nature', 'fantasy'] },
    { text: 'forgetting their own name', tags: [] }
];

const traits: TaggedWord[] = [
    { text: 'extremely tall', tags: [] },
    { text: 'covered in scars', tags: [] },
    { text: 'always humming a low tune', tags: [] },
    { text: 'with glowing eyes', tags: ['fantasy', 'sci-fi'] },
    { text: 'obsessed with clocks', tags: ['steampunk'] },
    { text: 'terrified of the dark', tags: ['horror'] },
    { text: 'unfailing polite', tags: [] },
    { text: 'with a missing finger', tags: [] },
    { text: 'who smells of lavender', tags: ['nature'] },
    { text: 'constantly twitching', tags: [] },
    { text: 'wearing heavy iron chains', tags: ['fantasy'] },
    { text: 'with a robotic arm', tags: ['sci-fi', 'steampunk'] },
    { text: 'always carrying a withered rose', tags: ['horror', 'nature'] },
    { text: 'speaking only in whispers', tags: [] },
    { text: 'with skin like marble', tags: ['fantasy'] }
];

const weirdFacts: TaggedWord[] = [
    { text: 'gravity is optional', tags: ['sci-fi', 'fantasy'] },
    { text: 'time flows backwards', tags: ['sci-fi', 'fantasy'] },
    { text: 'the sun is a giant eye', tags: ['horror', 'fantasy'] },
    { text: 'everything is made of candy', tags: [] },
    { text: 'magic requires sacrifice', tags: ['fantasy'] },
    { text: 'dreams manifest as reality', tags: ['fantasy'] },
    { text: 'the sky is a mirror', tags: [] },
    { text: 'the trees walk', tags: ['nature', 'fantasy'] },
    { text: 'shadows have their own lives', tags: ['horror', 'fantasy'] },
    { text: 'the earth is hollow', tags: [] },
    { text: 'nothing ever dies', tags: [] },
    { text: 'sound can be seen', tags: [] },
    { text: 'colors are poisonous', tags: [] },
    { text: 'memory is currency', tags: ['sci-fi'] }
];

const creatures: TaggedWord[] = [
    { text: 'mechanical dragons', tags: ['steampunk', 'fantasy'] },
    { text: 'sentient clouds', tags: ['sci-fi', 'fantasy'] },
    { text: 'space whales', tags: ['space', 'sci-fi'] },
    { text: 'clockwork spiders', tags: ['steampunk'] },
    { text: 'ghostly wolves', tags: ['fantasy', 'horror'] },
    { text: 'crystalline giants', tags: ['fantasy'] },
    { text: 'floating jellyfish', tags: ['water', 'nature'] },
    { text: 'shadow beasts', tags: ['fantasy', 'horror'] },
    { text: 'hyper-intelligent apes', tags: ['sci-fi'] },
    { text: 'star-children', tags: ['space', 'sci-fi'] },
    { text: 'lava eels', tags: ['dry'] },
    { text: 'void-raptors', tags: ['space', 'sci-fi'] },
    { text: 'bio-luminescent insects', tags: ['nature'] },
    { text: 'ancient golems', tags: ['fantasy'] },
    { text: 'telepathic spores', tags: ['sci-fi', 'nature'] }
];

const dangers: TaggedWord[] = [
    { text: 'a spreading void', tags: ['horror', 'space'] },
    { text: 'a rogue AI', tags: ['sci-fi'] },
    { text: 'an ancient curse', tags: ['fantasy', 'horror'] },
    { text: 'a planetary collision', tags: ['space', 'sci-fi'] },
    { text: 'a civil war', tags: [] },
    { text: 'a swarm of nanobots', tags: ['sci-fi'] },
    { text: 'a cosmic entity', tags: ['space', 'horror'] },
    { text: 'a reality-warping virus', tags: ['sci-fi'] },
    { text: 'a solar storm', tags: ['space', 'sci-fi'] },
    { text: 'a cult of doom', tags: ['horror'] },
    { text: 'a legendary beast', tags: ['fantasy'] },
    { text: 'a tyrannical overlord', tags: [] },
    { text: 'a temporal rift', tags: ['sci-fi', 'fantasy'] },
    { text: 'a toxic atmosphere', tags: ['sci-fi'] },
    { text: 'a localized gravity collapse', tags: ['sci-fi', 'space'] }
];

const names: TaggedWord[] = [
    { text: 'Aethelgard', tags: ['fantasy'] },
    { text: 'Neo-Prime', tags: ['sci-fi'] },
    { text: 'The Iron Reach', tags: ['steampunk', 'sci-fi'] },
    { text: 'Zion-9', tags: ['sci-fi'] },
    { text: 'Othos', tags: [] },
    { text: 'Xylos', tags: [] },
    { text: 'The Glimmer', tags: [] },
    { text: 'Nova Terra', tags: ['sci-fi', 'space'] },
    { text: 'Elysium', tags: [] },
    { text: 'The Silent Maw', tags: ['horror'] },
    { text: 'Void-Station Delta', tags: ['sci-fi', 'space'] },
    { text: 'Kaldwin’s Peak', tags: [] },
    { text: 'The Verdant Core', tags: ['nature'] },
    { text: 'Obsidia', tags: [] },
    { text: 'Aetheria', tags: ['fantasy'] },
    { text: 'Solstice', tags: [] },
    { text: 'The Rust Wastes', tags: ['steampunk', 'sci-fi'] },
    { text: 'Chronos', tags: [] },
    { text: 'The Azure Coast', tags: ['water'] },
    { text: 'Titan’s Cradle', tags: ['space'] }
];

const mainThemes = ['fantasy', 'sci-fi', 'steampunk', 'horror', 'nature'];

function getRandomCompatible(arr: TaggedWord[], theme: string): string {
    const compatible = arr.filter(item => item.tags.length === 0 || item.tags.includes(theme));
    const pool = compatible.length > 0 ? compatible : arr;
    return pool[Math.floor(Math.random() * pool.length)].text;
}

export class SuggestionGenerator {
    static generateSinglePlayer(): string[] {
        const suggestions: string[] = [];
        const count = 3;
        let attempts = 0;

        while (suggestions.length < count && attempts++ < 60) {
            const theme = mainThemes[Math.floor(Math.random() * mainThemes.length)];

            const charTemplates = [
                () => `A ${getRandomCompatible(adjectives, theme)} ${getRandomCompatible(classes, theme)} ${getRandomCompatible(traits, theme)} ${getRandomCompatible(backgrounds, theme)}`,
                () => `${getRandomCompatible(adjectives, theme)} ${getRandomCompatible(classes, theme)}`,
                () => `A ${getRandomCompatible(classes, theme)} ${getRandomCompatible(backgrounds, theme)}`
            ];

            const scenarioTemplates = [
                () => `Exploring ${getRandomCompatible(settings, theme)} seeking ${getRandomCompatible(goals, theme)}.`,
                () => `You are in ${getRandomCompatible(settings, theme)}.`,
                () => `Survive ${getRandomCompatible(settings, theme)} where ${getRandomCompatible(weirdFacts, theme)}.`,
                () => `${getRandomCompatible(settings, theme)}`,
                () => `Finding ${getRandomCompatible(goals, theme)} in ${getRandomCompatible(names, theme)}.`
            ];

            const charPart = charTemplates[Math.floor(Math.random() * charTemplates.length)]();
            const scenarioPart = scenarioTemplates[Math.floor(Math.random() * scenarioTemplates.length)]();

            const res = Math.random() > 0.3
                ? `${charPart}. ${scenarioPart}`
                : `${charPart} in ${scenarioPart}`;
            if (!suggestions.includes(res)) {
                suggestions.push(res);
            }
        }
        if (suggestions.length === 0) {
            suggestions.push("A lone wanderer exploring an ancient ruin.");
        }
        return suggestions;
    }

    static generateMultiplayer(): string[] {
        const suggestions: string[] = [];
        const count = 3;
        let attempts = 0;

        while (suggestions.length < count && attempts++ < 60) {
            const theme = mainThemes[Math.floor(Math.random() * mainThemes.length)];

            const templates = [
                () => `A ${getRandomCompatible(adjectives, theme)} world in ${getRandomCompatible(settings, theme)} where ${getRandomCompatible(weirdFacts, theme)}.`,
                () => `The ${getRandomCompatible(adjectives, theme)} land of ${getRandomCompatible(names, theme)}, home to ${getRandomCompatible(creatures, theme)} and ${getRandomCompatible(dangers, theme)}.`,
                () => `Exploration of ${getRandomCompatible(settings, theme)} after ${getRandomCompatible(dangers, theme)} changed everything.`,
                () => `A high-stakes adventure in ${getRandomCompatible(settings, theme)} featuring ${getRandomCompatible(creatures, theme)}.`,
                () => `Conflict in ${getRandomCompatible(names, theme)} between ${getRandomCompatible(creatures, theme)} and ${getRandomCompatible(creatures, theme)}.`,
                // Shorter phrases
                () => `${getRandomCompatible(adjectives, theme)} ${getRandomCompatible(names, theme)}`,
                () => `${getRandomCompatible(settings, theme)} plagued by ${getRandomCompatible(dangers, theme)}`,
                () => `Journey to ${getRandomCompatible(settings, theme)}`,
                () => `The ${getRandomCompatible(creatures, theme)} of ${getRandomCompatible(names, theme)}`,
                () => `${getRandomCompatible(goals, theme)} in ${getRandomCompatible(settings, theme)}`
            ];

            const template = templates[Math.floor(Math.random() * templates.length)];
            const res = template();
            if (!suggestions.includes(res)) {
                suggestions.push(res);
            }
        }
        if (suggestions.length === 0) {
            suggestions.push("The shattered realm of ancient magic.");
        }
        return suggestions;
    }
}
