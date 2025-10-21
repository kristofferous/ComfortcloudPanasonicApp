/* global Homey */

const listEl = document.getElementById('device-list');
const errorEl = document.getElementById('error');
const addButton = document.getElementById('add-button');
let devices = [];

function renderDevices() {
  listEl.innerHTML = '';
  if (!devices.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No Comfort Cloud devices were found for this account.';
    listEl.appendChild(empty);
    addButton.disabled = true;
    return;
  }
  addButton.disabled = false;

  devices.forEach((device, index) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '12px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = index;
    checkbox.checked = true;

    const name = document.createElement('span');
    name.textContent = device.name;

    label.appendChild(checkbox);
    label.appendChild(name);
    item.appendChild(label);
    listEl.appendChild(item);
  });
}

async function loadDevices() {
  try {
    Homey.showLoadingOverlay();
    errorEl.textContent = '';
    devices = await Homey.emit('list_devices');
    renderDevices();
  } catch (error) {
    errorEl.textContent = error.message || 'Failed to load devices.';
  } finally {
    Homey.hideLoadingOverlay();
  }
}

async function handleAdd() {
  const selectedIndices = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map((input) =>
    Number(input.value),
  );
  if (!selectedIndices.length) {
    errorEl.textContent = 'Select at least one device to continue.';
    return;
  }

  const selection = selectedIndices.map((index) => devices[index]);

  try {
    Homey.showLoadingOverlay();
    for (const device of selection) {
      await Homey.addDevice(device);
    }
    Homey.done();
  } catch (error) {
    errorEl.textContent = error.message || 'Failed to add the selected devices.';
  } finally {
    Homey.hideLoadingOverlay();
  }
}

addButton.addEventListener('click', handleAdd);
loadDevices();
