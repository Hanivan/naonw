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

  function unwrapCustom(el) {
    // if matched a custom element (tag contains '-'), descend to inner input/select/textarea
    if (el && el.tagName && el.tagName.includes('-')) {
      var inner = el.querySelector('input, select, textarea');
      if (inner) return inner;
    }
    return el;
  }

  // extract href value from selector like a[href="https://..."] for fallback partial match
  var exactHrefMatch = baseSelector.match(/a\\[href="([^"]+)"\\]/);
  var hrefFallback = null;
  if (exactHrefMatch) {
    try {
      var u = new URL(exactHrefMatch[1]);
      hrefFallback = u.hostname.replace(/^www\./, '') + u.pathname.slice(0, 60);
    } catch(e) {}
  }

  function search(root) {
    var candidates;
    try { candidates = Array.from(root.querySelectorAll(baseSelector)); }
    catch(e) { candidates = []; }

    if (textFilter) {
      var match = candidates.find(function(el) {
        return (el.textContent || '').toLowerCase().includes(textFilter);
      });
      if (match) return unwrapCustom(match);
    } else if (candidates.length > 0) {
      return unwrapCustom(candidates[0]);
    }

    // fallback: partial href match for Google-style redirect links (raw or URL-encoded)
    if (hrefFallback && candidates.length === 0) {
      var links = Array.from(root.querySelectorAll('a[href]'));
      var partial = links.find(function(el) {
        var href = el.getAttribute('href') || '';
        if (href.includes(hrefFallback)) return true;
        try { if (decodeURIComponent(href).includes(hrefFallback)) return true; } catch(e) {}
        return false;
      });
      if (partial) return unwrapCustom(partial);
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
