# Tiberium Wars RTS - Command & Conquer Clone

Web-based real-time strategy game inspired by Command & Conquer: Tiberium Wars. Built with React 19, Vite, and Canvas 2D.

## 🎮 About the Game

Tiberium Wars RTS is a free, browser-based Command & Conquer clone featuring:

- **2 Factions**: GDI (Global Defense Initiative) vs Nod (Brotherhood of Nod)
- **9 Structures** and **9 Units** per faction
- **3 Maps**: Wasteland, Sarajevo, and Yellow Zone
- ** Tiberium harvesting** economy system
- **Power grid** management
- **Engineers** for repair, capture, and relocating buildings
- **Veterancy system** with 4 ranks and passive regeneration
- **Superweapons**: Ion Cannon (GDI) / Nuclear Missile (Nod)
- **Dynamic weather**: Sunny, Rain, Ion Storm, Fog
- **Fog of War** system
- **AI opponent** with 3 difficulty levels
- **Save/Load** games via localStorage
- **Procedural audio**: 100% synthesized sound effects (Web Audio API)

No external sound files or game engines required - everything runs in the browser!

## 🚀 Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open your browser
#    http://127.0.0.1:5199 (or the port shown in terminal)
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (Vite, port 5199) |
| `npm run build` | Build for production (`dist/` folder) |
| `npm run preview` | Preview production build locally |

## 📁 Project Structure

```
Tiberium War RTS/
├── src/                    # Source code
│   ├── game/               # Game logic (engine, renderer, AI, pathfinding)
│   ├── components/         # React UI components
│   ├── assets/             # Game assets (images, audio synthesised)
│   ├── App.tsx             # Main React component
│   ├── main.tsx            # Entry point
│   └── index.css           # Styles (Tailwind v4)
├── index.html              # HTML template
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

## 🏗️ Built With

- **React 19** + **Vite 8** - Frontend framework and build tool
- **Canvas 2D** - Rendering all graphics (no WebGL dependencies)
- **Tailwind CSS v4** - Styling
- **lucide-react** - Icons
- **Web Audio API** - 100% synthesized sound (no external files)
- **No external game engines** - Pure canvas implementation

## 🎯 Features

- ✅ 2 playable factions (GDI / Nod)
- ✅ 9 structures and 9 units each
- ✅ 3 playable maps with terrain obstacles
- ✅ Tiberium harvesting economy
- ✅ Power grid system (overload = slower production)
- ✅ Engineer gameplay (repair, capture enemy structures, relocate at Level 2)
- ✅ 4-level veterancy system with passive health regeneration
- ✅ AI Commander with 3 difficulty levels
- ✅ Superweapons (Ion Cannon / Nuclear Missile)
- ✅ Dynamic weather system (rain, ion storms, fog)
- ✅ Fog of War based on line-of-sight
- ✅ Save/Load games to localStorage
- ✅ Keyboard shortcuts (WASD/Arrows for camera, number keys for control groups)
- ✅ CRT scanline filter effect
- ✅ Fullscreen mode
- ✅ Mobile-friendly UI (sidebar, modals)

## 📦 Deployment

This game is designed for free deployment on **OnlyFunPeople Studios**:

1. Build the production version: `npm run build`
2. Deploy the `dist/` folder to any static hosting (GitHub Pages, Netlify, Vercel, etc.)
3. Or integrate via iframe on OnlyFunPeople Studios panel

The game runs entirely client-side - no servers or databases required!

## 🎛️ Controls

### Keyboard

| Key | Action |
|-----|--------|
| `W / Arrow Up` | Move camera up |
| `S / Arrow Down` | Move camera down |
| `A / Arrow Left` | Move camera left |
| `D / Arrow Right` | Move camera right |
| `Space` | Pause/Resume game |
| `Q` | Select structures category |
| `W` | Select defenses category |
| `E` | Select infantry category |
| `R` | Select vehicles category |
| `1-9` | Control groups (Ctrl+number = set, number = recall) |
| `U` | Order harvesters to unload tiberium |
| `T` | Repair selected structure with engineer |
| `M` | Relocate selected structure (Level 2 engineers) |
| `H` | Center camera on player ConYard |
| `Escape` | Cancel selection/placement/relocation |

### Mouse

- **Left drag box**: Select units in area
- **Left click on unit**: Select unit (Shift+click = multi-select)
- **Left click on structure**: Select structure
- **Right click**: Move/attack command
- **Middle click + drag**: Pan camera

## 📦 npm Dependencies

```json
{
  "dependencies": {
    "@google/genai": "^2.4.0",     # Gemini AI SDK (for EVA voice)
    "@tailwindcss/vite": "^4.3.3",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0",
    "express": "^4.21.2",
    "dotenv": "^17.2.3",
    "motion": "^12.23.24"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2",
    "@types/express": "^4.17.21"
  }
}
```

> **Note**: `@google/genai` is used only for the EVA voice synthesizer procedural voice lines. The game runs fully without it - voice features gracefully degrade.

## 🎨 Customization

### Branding

Edit these files to customize the game's appearance:

- `src/components/EmbedModal.tsx` - Embed modal text and iframe snippet
- `src/App.tsx` - App title and credits
- `metadata.json` - App metadata

### Game Balance

Game data is defined in `src/game/gameData.ts`:
- Structure costs, build times, HP, power stats
- Unit costs, stats, prerequisites
- Map presets with Tiberium patches and terrain obstacles

## 📜 License

This project is open source and available for free deployment on OnlyFunPeople Studios platforms.

---

Despliega tu juego en OnlyFunPeople Studios: https://onlyfunpeople.com.ar