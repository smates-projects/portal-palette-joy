# Adopt the new Strategic Mates logos

Store the two uploaded logos as the official brand marks, without building new screens.

## What changes
- Horizontal logo ("Strategic Mates" with the tower) saved as the main logo, for the top of the side rail.
- Isotype (tower with SM) saved as the collapsed-rail logo and used as the browser tab icon.
- Default Lovable tab icon removed; site title set to "SM Platform".
- A small shared logo piece (full / isotype) ready for the rail when it is built. Logos are never stretched or recolored.

## Technical details
- `lovable-assets create` for LogoF.png and Isotype.png into `src/assets/*.asset.json`.
- `public/favicon.png` from Isotype (64x64 padded via magick), update `__root.tsx` icon link, delete `public/favicon.ico`.
- `src/components/brand/Logo.tsx` with `variant: "full" | "isotype"`, `object-contain`, alt text from i18n later.
- Root head: title/description "SM Platform — Strategic Mates".
