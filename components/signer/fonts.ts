import { Dancing_Script, Great_Vibes, Caveat, Homemade_Apple } from "next/font/google";

const dancing = Dancing_Script({ subsets: ["latin"], weight: "400", display: "swap" });
const vibes = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "400", display: "swap" });
const homemade = Homemade_Apple({ subsets: ["latin"], weight: "400", display: "swap" });

export const SIGNATURE_FONTS = [
  { id: "dancing", label: "Dancing Script", family: dancing.style.fontFamily, className: dancing.className },
  { id: "vibes", label: "Great Vibes", family: vibes.style.fontFamily, className: vibes.className },
  { id: "caveat", label: "Caveat", family: caveat.style.fontFamily, className: caveat.className },
  { id: "homemade", label: "Homemade Apple", family: homemade.style.fontFamily, className: homemade.className },
] as const;
