# Adopt the new Strategic Mates logos

Store the two uploaded logos as the official brand marks, without building new screens.

## What changes
- Both uploads are the official logos. There is no negative (light) version yet.
- Blue side rail: only the gold isotype (tower with SM), expanded or collapsed.
- Horizontal logo ("Strategic Mates" with the tower): only on white backgrounds (e.g. sign-in, white headers), never on blue.
- Isotype also used as the browser tab icon; default Lovable icon removed; site title set to "SM Platform".
- A shared logo piece (horizontal / isotype) that only allows the horizontal version on white. Logos are never stretched or recolored.
- These placement rules are saved as project memory so future screens follow them.

## Technical details
- `lovable-assets create` for LogoF.png and Isotype.png into `src/assets/*.asset.json`.
- `public/favicon.png` from Isotype (64x64 padded via magick), update `__root.tsx` icon link, delete `public/favicon.ico`.
- `src/components/brand/Logo.tsx` with `variant: "full" | "isotype"`, `object-contain`, alt text from i18n later.
- Root head: title/description "SM Platform — Strategic Mates".
