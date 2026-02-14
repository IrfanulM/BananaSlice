# Changelog

All notable changes to BananaSlice will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.4] - 2026-02-14

### Fixed
- Exporting layers with feathering applied

## [0.1.3] - 2025-01-12

### Added
- Export individual layers
- Project tabs allowing for multiple projects to be open at the same time

## [0.1.2] - 2025-12-31

### Added
- Disclaimer message for closing projects with unsaved changes

### Changed
- Drag-and-drop support for reference image slots + canvas images/projects
- Removed sequential ordering from reference image slots

## [0.1.1] - 2025-12-22

### Changed
- Replaced layer panel lock and visibility icons with svg for consistent styling on macOS.
- Improved model selection UI with chevron down icon for consistent styling on macOS. 

## [0.1.0] - 2025-12-20

### Added
- Initial release of BananaSlice
- AI-powered generative fill using Google Gemini (Nano Banana and Nano Banana Pro models)
- Layer-based editing system with visibility, opacity, and drag-to-reorder
- Layer edge feathering control (contextual toolbar appears when layer selected)
- Selection tools: Rectangle, Lasso, and Shape (rectangle/ellipse)
- Move tool for repositioning and transforming layers
- Project file format (`.banslice`) for saving and loading complete projects
- Multi-format export support (PNG, JPG, WEBP, BMP)
- Reference image support for guiding AI generation
- Full undo/redo history
- Keyboard shortcuts for efficient workflow
- Secure API key storage using OS native keychain
- Canvas zoom and pan controls
- Layer panel with drag-and-drop reordering
- Settings modal for API key management
- Toast notifications for user feedback
- Error boundaries for graceful error handling
- Cross-platform support (Windows, macOS, Linux)
- Automated release workflow via GitHub Actions

### Security
- API keys encrypted and stored in OS native keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
