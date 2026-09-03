// Turkish-aware text folding shared by search, model-family grouping and
// sub-type detection. "Can Yeleği" -> "can yelegi", "5 İp Bar" -> "5 ip bar",
// "Element 4’3" -> "element 4'3".
export const foldText = (s) => String(s ?? '')
  .replace(/[’‘`´]/g, "'")
  // Dotted/dotless i must be handled before lowercasing: 'İ'.toLowerCase() is "i̇".
  .replace(/İ/g, 'i')
  .replace(/ı/g, 'i')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

// Tokens keep apostrophes, slashes and dots so "4'3", "4.3" and "o'neill" survive.
export const tokensOf = (s) => foldText(s).split(/[^a-z0-9'/.]+/).filter(Boolean);
