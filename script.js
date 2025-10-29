/*
 * Global script for HostelSync PWA.
 * Provides simple interactivity on different pages.
 */

// Register service worker if available
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Determine which page we are on by body class
  const bodyClass = document.body.classList;
  if (bodyClass.contains('laundry-page')) {
    initLaundryPage();
  } else if (bodyClass.contains('my-washes-page')) {
    initMyWashesPage();
  } else if (bodyClass.contains('alerts-page')) {
    initAlertsPage();
  } else if (bodyClass.contains('home-page')) {
    // nothing special for home
  }
});

// Data model for laundry machines (static demo)
const hostelData = {
  'LVH': {
    floors: {
      '1': [
        { id: 'M-1', status: 'free' },
        { id: 'M-2', status: 'running', eta: 18 },
        { id: 'M-3', status: 'awaiting' },
        { id: 'M-4', status: 'free' },
        { id: 'M-5', status: 'maintenance' }
      ],
      '2': [
        { id: 'M-1', status: 'running', eta: 32 },
        { id: 'M-2', status: 'running', eta: 5 },
        { id: 'M-3', status: 'awaiting' },
        { id: 'M-4', status: 'running', eta: 14 },
        { id: 'M-5', status: 'running', eta: 25 }
      ],
      '3': [
        { id: 'M-1', status: 'awaiting' },
        { id: 'M-2', status: 'awaiting' },
        { id: 'M-3', status: 'awaiting' },
        { id: 'M-4', status: 'awaiting' },
        { id: 'M-5', status: 'awaiting' }
      ],
      '4': [
        { id: 'M-1', status: 'free' },
        { id: 'M-2', status: 'free' },
        { id: 'M-3', status: 'free' },
        { id: 'M-4', status: 'running', eta: 10 },
        { id: 'M-5', status: 'maintenance' }
      ]
    }
  }
};

// Utility to update counts for summary chips
function computeCounts(machines) {
  const counts = { free: 0, running: 0, awaiting: 0, maintenance: 0 };
  machines.forEach(machine => {
    counts[machine.status]++;
  });
  return counts;
}

function initLaundryPage() {
  const hostelSelect = document.getElementById('hostel-select');
  const floorSelect = document.getElementById('floor-select');
  const machinesGrid = document.getElementById('machines-grid');
  const summaryContainer = document.getElementById('summary-container');
  const busyBanner = document.getElementById('busy-banner');
  
  // Populate hostel and floor options
  Object.keys(hostelData).forEach(hostel => {
    const opt = document.createElement('option');
    opt.value = hostel;
    opt.textContent = hostel;
    hostelSelect.appendChild(opt);
  });
  // Set default hostel
  hostelSelect.value = 'LVH';
  // Populate floors for LVH
  updateFloors();
  
  hostelSelect.addEventListener('change', updateFloors);
  floorSelect.addEventListener('change', updateView);
  
  function updateFloors() {
    const selectedHostel = hostelSelect.value;
    const floors = Object.keys(hostelData[selectedHostel].floors);
    // Clear existing options
    floorSelect.innerHTML = '';
    floors.forEach(floor => {
      const opt = document.createElement('option');
      opt.value = floor;
      opt.textContent = `Floor ${floor}`;
      floorSelect.appendChild(opt);
    });
    floorSelect.value = floors[0];
    updateView();
  }
  
  function updateView() {
    const selectedHostel = hostelSelect.value;
    const selectedFloor = floorSelect.value;
    const machines = hostelData[selectedHostel].floors[selectedFloor];
    // Update summary
    const counts = computeCounts(machines);
    summaryContainer.innerHTML = '';
    ['free','running','awaiting','maintenance'].forEach(status => {
      const chip = document.createElement('div');
      chip.className = `status-chip status-${status}`;
      chip.textContent = `${counts[status]} ${status.charAt(0).toUpperCase()+status.slice(1)}`;
      summaryContainer.appendChild(chip);
    });
    // Show busy banner when no free machines
    if (counts.free === 0) {
      busyBanner.style.display = 'flex';
    } else {
      busyBanner.style.display = 'none';
    }
    // Render machines grid
    machinesGrid.innerHTML = '';
    machines.forEach(machine => {
      const card = document.createElement('div');
      card.className = 'machine-card';
      card.dataset.id = machine.id;
      card.dataset.status = machine.status;
      // Icon using emoji
      const icon = document.createElement('div');
      icon.className = 'machine-icon';
      icon.textContent = '🧺';
      card.appendChild(icon);
      // Name
      const name = document.createElement('div');
      name.className = 'machine-name';
      name.textContent = machine.id;
      card.appendChild(name);
      // Subtext
      const sub = document.createElement('div');
      sub.className = 'machine-subtext';
      sub.textContent = `Floor ${selectedFloor}`;
      card.appendChild(sub);
      // Status chip
      const status = document.createElement('div');
      status.className = `machine-status status-${machine.status}`;
      let label = '';
      if (machine.status === 'free') label = 'Free';
      if (machine.status === 'running') label = `Running · ${machine.eta}m`;
      if (machine.status === 'awaiting') label = 'Awaiting';
      if (machine.status === 'maintenance') label = 'Maintenance';
      status.textContent = label;
      card.appendChild(status);
      // Click handler to open modal
      card.addEventListener('click', () => openMachineModal(machine, selectedFloor));
      machinesGrid.appendChild(card);
    });
  }
  
  // Busy banner notify button
  const notifyBtn = document.getElementById('notify-button');
  notifyBtn.addEventListener('click', () => {
    alert('We will notify you when a machine becomes free. (Demo only)');
  });
}

function openMachineModal(machine, floor) {
  const overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalStatus = document.getElementById('modal-status');
  const modalActions = document.getElementById('modal-actions');
  modalTitle.textContent = machine.id;
  // Set status text and actions based on machine status
  let statusText = '';
  modalActions.innerHTML = '';
  if (machine.status === 'free') {
    statusText = 'This machine is free to use.';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'Start Wash';
    startBtn.onclick = () => {
      alert('Wash started (demo).');
      overlay.classList.remove('active');
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.classList.remove('active');
    modalActions.appendChild(cancelBtn);
    modalActions.appendChild(startBtn);
  } else if (machine.status === 'running') {
    statusText = `Currently running. ${machine.eta} minutes remaining.`;
    const notifyBtn = document.createElement('button');
    notifyBtn.className = 'btn-primary';
    notifyBtn.textContent = 'Notify When Done';
    notifyBtn.onclick = () => {
      alert('You will be notified when the cycle finishes. (Demo)');
      overlay.classList.remove('active');
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Close';
    cancelBtn.onclick = () => overlay.classList.remove('active');
    modalActions.appendChild(cancelBtn);
    modalActions.appendChild(notifyBtn);
  } else if (machine.status === 'awaiting') {
    statusText = 'Cycle has completed. Clothes are awaiting pickup.';
    const nudgeBtn = document.createElement('button');
    nudgeBtn.className = 'btn-primary';
    nudgeBtn.textContent = 'Nudge User';
    nudgeBtn.onclick = () => {
      alert('Nudge sent to user. (Demo)');
      overlay.classList.remove('active');
    };
    const takeBtn = document.createElement('button');
    takeBtn.className = 'btn-secondary';
    takeBtn.textContent = 'Mark Collected';
    takeBtn.onclick = () => {
      alert('Marked as collected. (Demo)');
      overlay.classList.remove('active');
    };
    modalActions.appendChild(takeBtn);
    modalActions.appendChild(nudgeBtn);
  } else if (machine.status === 'maintenance') {
    statusText = 'This machine is under maintenance.';
    const okBtn = document.createElement('button');
    okBtn.className = 'btn-primary';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => overlay.classList.remove('active');
    modalActions.appendChild(okBtn);
  }
  modalStatus.textContent = statusText;
  overlay.classList.add('active');
  // Close overlay when clicking outside modal
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
}

function initMyWashesPage() {
  const activeList = document.getElementById('active-washes');
  const historyList = document.getElementById('wash-history');
  // Sample data
  const active = [
    { id: 'M-2', floor: '2', eta: 12 }
  ];
  const history = [
    { id: 'M-1', floor: '1', completed: 'Oct 28, 2025 14:35' },
    { id: 'M-5', floor: '4', completed: 'Oct 25, 2025 10:12' }
  ];
  // Render active
  active.forEach(item => {
    const row = document.createElement('div');
    row.className = 'wash-item';
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<strong>${item.id}</strong><span class="status">Running · ${item.eta}m remaining</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'View';
    btn.onclick = () => {
      // Navigate to laundry page and show modal
      window.location.href = 'laundry.html';
    };
    row.appendChild(info);
    row.appendChild(btn);
    activeList.appendChild(row);
  });
  // Render history
  history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'wash-item';
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<strong>${item.id}</strong><span class="status">Completed on ${item.completed}</span>`;
    row.appendChild(info);
    historyList.appendChild(row);
  });
}

function initAlertsPage() {
  const list = document.getElementById('alerts-list');
  // Sample notifications
  const alerts = [
    { message: 'Your wash on M-2 is complete. Please collect your clothes.', icon: '🔔' },
    { message: 'Machine M-3 is now free on Floor 2.', icon: '🧺' },
    { message: 'Maintenance scheduled for M-5 tomorrow.', icon: '⚠️' }
  ];
  alerts.forEach(alert => {
    const item = document.createElement('div');
    item.className = 'alert-item';
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = alert.icon;
    const text = document.createElement('div');
    text.textContent = alert.message;
    item.appendChild(icon);
    item.appendChild(text);
    list.appendChild(item);
  });
}