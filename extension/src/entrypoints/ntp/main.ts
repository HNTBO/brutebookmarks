import './style.css';
import { getAppUrl } from '../../lib/auth';

async function redirectToApp(): Promise<void> {
  const url = await getAppUrl();
  window.location.replace(url);
}

document.addEventListener('DOMContentLoaded', () => {
  void redirectToApp();
});
