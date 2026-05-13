declare global {
  interface Window {
    __deepQuery(selector: string): Element | null;
  }
}

export const DEEP_QUERY_SCRIPT = `
window.__deepQuery = function(selector) {
  var hasTextMatch = selector.match(/:has-text\\("([^"]+)"\\)\\s*$/);
  var baseSelector = selector;
  var textFilter = null;
  if (hasTextMatch) {
    textFilter = hasTextMatch[1].toLowerCase();
    baseSelector = selector.slice(0, hasTextMatch.index).trim() || '*';
  }

  function search(root) {
    var candidates;
    try { candidates = Array.from(root.querySelectorAll(baseSelector)); }
    catch(e) { candidates = []; }

    if (textFilter) {
      var match = candidates.find(function(el) {
        return (el.textContent || '').toLowerCase().includes(textFilter);
      });
      if (match) return match;
    } else if (candidates.length > 0) {
      return candidates[0];
    }

    var all = Array.from(root.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        var found = search(all[i].shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  return search(document);
};
`;
