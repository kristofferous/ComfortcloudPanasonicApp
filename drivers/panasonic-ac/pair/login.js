/* global Homey */

const form = document.getElementById('login-form');
const errorNode = document.getElementById('error');

async function handleSubmit(event) {
  event.preventDefault();
  errorNode.textContent = '';

  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    errorNode.textContent = 'Email and password are required.';
    return;
  }

  try {
    Homey.showLoadingOverlay();
    await Homey.emit('login', { email, password });
    Homey.hideLoadingOverlay();
    Homey.showView('devices');
  } catch (error) {
    Homey.hideLoadingOverlay();
    errorNode.textContent = error.message || 'Login failed. Please try again.';
  }
}

form.addEventListener('submit', handleSubmit);
