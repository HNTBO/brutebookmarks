// Instant preference restore — runs synchronously before first paint
// to prevent flash of wrong theme/accent/width
(function() {
  var theme = localStorage.getItem('theme');
  if (theme !== 'light' && theme !== 'dark') theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  var accent = localStorage.getItem('accentColor_' + theme);
  if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) {
    document.documentElement.style.setProperty('--accent', accent);
  }

  var pw = Number(localStorage.getItem('pageWidth'));
  if (!isNaN(pw) && pw >= 0 && pw <= 100) {
    document.documentElement.style.setProperty('--page-width', (800 + (pw / 100) * 800) + 'px');
  }
})();
