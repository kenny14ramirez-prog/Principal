/**
 * Convierte el mensaje de publicación en ítems de lista para OTA.
 * Acepta: saltos de línea, +, ;, o listas numeradas "1, foo, 2, bar".
 */
export function parseChangelogMessage(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    var merged = [];
    raw.forEach(function (item) {
      merged = merged.concat(parseChangelogMessage(item));
    });
    return merged.filter(Boolean);
  }

  var text = String(raw).trim();
  if (!text) return [];

  if (/\n/.test(text)) {
    return text
      .split(/\n+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  var plusSemi = text.split(/\s*\+\s*|\s*;\s*/);
  if (plusSemi.length > 1) {
    return plusSemi
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  if (/,\s*\d+\s*[,.]?\s*/.test(text) || /^\d+\s*[,.]\s*/.test(text)) {
    var numbered = text.split(/,\s*(?=\d+\s*[,.]?\s*)/);
    if (numbered.length > 1) {
      return numbered
        .map(function (part) {
          return part
            .replace(/^,\s*/, '')
            .replace(/^\d+\s*[,.]\s*/, '')
            .trim();
        })
        .filter(Boolean);
    }
  }

  var parts = text.split(/\s*,\s*/);
  if (parts.length >= 4 && /^\d+$/.test(parts[0])) {
    var paired = [];
    var allPairs = true;
    for (var i = 0; i < parts.length; i += 2) {
      if (!/^\d+$/.test(parts[i])) {
        allPairs = false;
        break;
      }
      if (parts[i + 1]) paired.push(parts[i + 1].trim());
    }
    if (allPairs && paired.length) return paired.filter(Boolean);
  }

  return [text];
}
