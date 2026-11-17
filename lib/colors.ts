/** Recipient colors in the tagger and signer view (Imagine-friendly pastels, rose first). */
export const RECIPIENT_COLORS = [
  { bg: "#FCE3E5", border: "#E58D97", text: "#7A3440", solid: "#F6A1A8" },
  { bg: "#E3EEF9", border: "#7FA8D6", text: "#2C4E77", solid: "#9EC5E8" },
  { bg: "#E6F2E6", border: "#86B886", text: "#2F5A2F", solid: "#A8CFA8" },
  { bg: "#EEE7F7", border: "#A891CF", text: "#4B3A73", solid: "#C3B1E1" },
  { bg: "#FBEEDD", border: "#E0A867", text: "#7A4E17", solid: "#F5C28B" },
  { bg: "#E2F4F2", border: "#6FBFB6", text: "#215952", solid: "#8FD0C9" },
  { bg: "#F5EFDC", border: "#C9B477", text: "#5E5020", solid: "#E3D3A8" },
  { bg: "#ECEEF2", border: "#98A2B3", text: "#3B4352", solid: "#B8C0CC" },
] as const;

export function recipientColor(index: number) {
  return RECIPIENT_COLORS[((index % RECIPIENT_COLORS.length) + RECIPIENT_COLORS.length) % RECIPIENT_COLORS.length];
}
