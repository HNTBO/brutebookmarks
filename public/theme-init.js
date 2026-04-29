// Instant preference restore — runs synchronously before first paint
// to prevent flash of wrong theme/accent/width
(function() {
  document.documentElement.classList.add('fonts-pending');

  var theme = localStorage.getItem('theme');
  if (theme !== 'light' && theme !== 'dark' && theme !== 'auto') theme = 'dark';
  var resolvedTheme = theme === 'auto' && window.matchMedia
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme === 'auto' ? 'dark' : theme);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-mode', theme);

  var accent = localStorage.getItem('accentColor_' + resolvedTheme);
  if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) {
    document.documentElement.style.setProperty('--accent', accent);
  }

  var pw = Number(localStorage.getItem('pageWidth'));
  if (!isNaN(pw) && pw >= 0 && pw <= 100) {
    document.documentElement.style.setProperty('--page-width', (800 + (pw / 100) * 800) + 'px');
  }

  var cs = Number(localStorage.getItem('cardSize'));
  if (isNaN(cs) || cs < 60 || cs > 120) cs = 90;
  if (isNaN(pw) || pw < 50 || pw > 100) pw = 100;

  var handleX = ((pw - 50) / 50) * 100;
  var handleY = ((cs - 60) / 60) * 100;
  document.documentElement.style.setProperty('--size-handle-left', 'calc(' + handleX + '% + ' + (8 - 0.16 * handleX) + 'px)');
  document.documentElement.style.setProperty('--size-handle-top', 'calc(' + handleY + '% + ' + (8 - 0.16 * handleY) + 'px)');

  function finishFontGate() {
    document.documentElement.classList.add('fonts-ready');
    document.documentElement.classList.remove('fonts-pending');
  }

  if (!document.fonts || !document.fonts.load) {
    finishFontGate();
    return;
  }

  var timeout = setTimeout(finishFontGate, 800);
  Promise.all([
    document.fonts.load('700 72px Outfit'),
    document.fonts.load('700 48px Outfit'),
  ]).then(function() {
    clearTimeout(timeout);
    finishFontGate();
  }).catch(function() {
    clearTimeout(timeout);
    finishFontGate();
  });
})();
