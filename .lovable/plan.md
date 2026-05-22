Update `src/routes/__root.tsx`:

1. In `head()` meta array, add: `{ name: "google", content: "notranslate" }`
2. In `RootShell`, change `<html lang="en">` to `<html lang="pt-BR" translate="no">`