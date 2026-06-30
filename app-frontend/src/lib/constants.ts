export const CATEGORIES: {
  id:          string;
  label:       string;
  emoji:       string;
  description: string;
}[] = [
  { id: "Software & DevOps",    label: "Software & DevOps",    emoji: "🛠️", description: "Architecture, system design, cloud, CI/CD" },
  { id: "Technology",           label: "Technology",           emoji: "💡", description: "AI, product, innovation, industry trends" },
  { id: "World Politics",       label: "World Politics",       emoji: "🌍", description: "Geopolitics, policy, international affairs" },
  { id: "Business",             label: "Business",             emoji: "📈", description: "Strategy, leadership, management thinking" },
  { id: "Economics",            label: "Economics",            emoji: "💰", description: "Markets, finance, economic trends" },
  { id: "Science",              label: "Science",              emoji: "🔬", description: "Research, discoveries, physics, biology" },
  { id: "Productivity",         label: "Productivity",         emoji: "⚡", description: "Focus, habits, tools, mental models" },
  { id: "History",              label: "History",              emoji: "🏛️", description: "Ancient to modern, events, civilizations" },
  { id: "Arts & Culture",       label: "Arts & Culture",       emoji: "🎭", description: "Literature, film, music, criticism" },
  { id: "Military",             label: "Military",             emoji: "⚔️", description: "Strategy, defense policy, military history" },
  { id: "Health",               label: "Health",               emoji: "🧬", description: "Medicine, mental health, longevity, well-being" },
  { id: "Environment",          label: "Environment",          emoji: "🌿", description: "Climate, ecology, sustainability, energy" },
  { id: "Philosophy & Ethics",  label: "Philosophy & Ethics",  emoji: "🧠", description: "Moral philosophy, ethics, logic, political thought" },
  { id: "Fashion & Style",      label: "Fashion & Style",      emoji: "👗", description: "Design, industry, sustainability, culture" },
  { id: "Life & Relationships", label: "Life & Relationships", emoji: "💛", description: "Relationships, family, personal growth, well-being" },
];

export const SUB_TOPICS: Record<string, string[]> = {
  "Software & DevOps":    ["Backend Engineering", "Cloud & DevOps", "Security & Cybersecurity", "AI & ML Engineering", "Open Source", "Engineering Culture"],
  "Technology":           ["Emerging Tech", "Space Technology", "Robotics & Automation", "Semiconductors & Hardware", "Biotech & Deep Tech", "Tech Policy & Society"],
  "World Politics":       ["US Politics", "Europe", "Middle East", "Asia & China", "Russia & Eurasia", "International Institutions"],
  "Business":             ["Startups & Venture", "Strategy & Management", "Leadership", "Marketing", "Finance", "Future of Work"],
  "Economics":            ["Macroeconomics", "Trade & Globalization", "Labor Markets", "Monetary Policy", "Development Economics", "Behavioral Economics"],
  "Science":              ["Biology & Life Sciences", "Physics", "Space & Astronomy", "Climate Science", "Neuroscience", "Mathematics"],
  "Productivity":         ["Decision Making", "Mental Models", "Habits & Systems", "Focus & Deep Work", "Learning & Memory", "Creativity"],
  "History":              ["Ancient History", "Medieval", "Modern History", "Military History", "Social History", "Cultural History"],
  "Arts & Culture":       ["Literature", "Film & Cinema", "Music", "Visual Arts", "Architecture", "Philosophy"],
  "Military":             ["Strategy & Doctrine", "Geopolitics & Conflict", "Technology & Weapons", "Intelligence", "Military History", "Naval & Air Power"],
  "Health":               ["Nutrition & Longevity", "Mental Health", "Neuroscience", "Exercise Science", "Medicine & Research", "Public Health"],
  "Environment":          ["Climate Change", "Renewable Energy", "Biodiversity", "Oceans", "Urban Sustainability", "Policy & Activism"],
  "Philosophy & Ethics":  ["Moral Philosophy", "Political Philosophy", "Existentialism", "Applied Ethics", "Philosophy of Mind", "Logic & Epistemology"],
  "Fashion & Style":      ["Sustainable Fashion", "Luxury & Design", "Street Style", "Fashion Industry", "Beauty & Wellness", "Fashion History"],
  "Life & Relationships": ["Relationships & Dating", "Parenting", "Career & Life Balance", "Personal Finance", "Self-Development", "Community & Belonging"],
};
