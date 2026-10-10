# assets/

Drop production artwork here before running `eas build`:

| File                       | Size                    | Purpose                             |
| -------------------------- | ----------------------- | ----------------------------------- |
| `icon.png`                 | 1024 × 1024             | iOS + Android launcher icon         |
| `adaptive-icon.png`        | 1024 × 1024 (fg)        | Android adaptive icon foreground    |
| `splash.png`               | 1242 × 2436 (center)    | Splash screen artwork               |
| `favicon.png`              | 48 × 48                 | Web favicon                         |
| `notification-icon.png`    | 96 × 96 (monochrome)    | Android status-bar notification icon|
| `sounds/new-order.wav`     | ~1–2 s PCM/WAV          | Chime fired on new-order realtime   |

These paths are referenced from `app.json` and are hot-swappable per white-label
customer — no code changes needed.
