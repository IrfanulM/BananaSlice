### <img src="public/logo_cropped.png" width="64" alt="BananaSlice Logo">

# BananaSlice
Open-Source alternative to Adobe Photoshop's Generative Fill using Nano Banana & Nano Banana Pro

[![Version: 0.1.4](https://img.shields.io/badge/Version-0.1.4-yellow.svg)](https://github.com/IrfanulM/BananaSlice/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

![Demo](https://raw.githubusercontent.com/IrfanulM/BananaSlice/main/demo.gif)

## Features

- **AI-Powered Generative Fill**: Fill selections using Google Gemini's Nano Banana and Nano Banana Pro models
- **Layer-Based Editing**: Non-destructive workflow with layer visibility, opacity, and reordering
- **Multiple Selection Tools**: Rectangle, lasso, and shape-based selections
- **Project Files**: Save and load projects with full layer history (`.banslice` format)
- **Reference Images**: Guide AI generation with optional reference images
- **Secure API Storage**: API keys encrypted via OS native keychain
- **Cross-Platform**: Available for Windows, macOS, and Linux

## Getting Started

### Download

Grab the latest release for your platform from the [Releases page](https://github.com/IrfanulM/BananaSlice/releases).

### Build from Source

If you'd prefer to build the app yourself:

**Prerequisites:**
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (for Tauri builds)

**Steps:**
1. Clone the repository:
   ```bash
   git clone https://github.com/IrfanulM/BananaSlice.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Canvas Engine**: Fabric.js 6
- **State Management**: Zustand
- **Desktop Wrapper**: Tauri 2 (Rust)
- **Styling**: CSS (Modern CSS3)
- **Testing**: Vitest + JSDOM

## License

MIT © [Irfanul Majumder](https://github.com/IrfanulM)

See [LICENSE](./LICENSE) for details.

## Acknowledgments

- Inspired by Adobe Photoshop's Generative Fill
- Powered by Google Gemini's Image Generation API (Nano Banana & Nano Banana)

---

<div align="center">
  <strong>If this project helped you, consider giving it a ⭐️!</strong>
</div>
