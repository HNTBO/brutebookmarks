// Instant preference restore — runs synchronously before first paint
// to prevent flash of wrong theme/accent/width
(function() {
  var theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  var accent = localStorage.getItem('accentColor_' + theme);
  if (accent) document.documentElement.style.setProperty('--accent', accent);

  var pw = localStorage.getItem('pageWidth');
  if (pw) document.documentElement.style.setProperty('--page-width', (800 + (pw / 100) * 800) + 'px');
})();
