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

// Global error handler disabled.  Enable manually for debugging if needed.
// window.onerror = function(message, source, lineno, colno, error) {
//   if (!window.__errorShown) {
//     window.__errorShown = true;
//     alert('Script error: ' + message + ' at ' + lineno + ':' + colno);
//   }
// };

// -----------------------------------------------------------------------------
// HostelSync State Management and Helpers
//
// To bring the demo closer to the React version, we persist a small state
// object in localStorage.  This allows machines, washes and notifications to
// survive across page reloads.  Machines are initialised with random
// statuses, similar to the original mock, and a minute-level timer drives
// countdowns, notifications and state transitions.  Each page reads from the
// shared state and re-renders when necessary.

// Bump this number whenever the state schema or default machine setup changes.
// Incrementing the version forces a reset of the persisted state in localStorage.
const STATE_VERSION = 3;
let state = null;
const COMMON_ROOM_DB_KEY = 'hostelsync_common_room_db';
let commonRoomDB = null;
const AUTH_COOKIE_KEY = 'hostelsync_auth';

// Demo credentials. These are the only accepted logins in this prototype and
// are validated by a simple client-side check before enabling student/admin
// experiences.
const DEMO_STUDENT = {
  email: 'student@hostel.edu',
  password: 'student123',
  name: 'Sample Student',
  hostel: 'LVH',
  room: '101',
};

const DEMO_ADMIN = {
  email: 'admin@hostel.edu',
  password: 'admin123',
  name: 'Common Room Admin',
};

// Global error handler (disabled in production).  In development you can
// uncomment the following to surface errors in an alert.  The default
// behaviour is to silently log errors to the console.
// Global error handler disabled in production. Uncomment for development if needed.
// window.onerror = function(message, source, lineno, colno, error) {
//   alert('Error: ' + message + '\n' + source + ':' + lineno + ':' + colno);
// };
let tickIntervalStarted = false;

// Load state from localStorage.  If parsing fails or no state exists, null is
// returned.
function loadState() {
  const data = localStorage.getItem('hostelsync_state');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
}

// Persist current state back to localStorage.
function saveState() {
  if (state) {
    localStorage.setItem('hostelsync_state', JSON.stringify(state));
  }
}

// -----------------------------------------------------------------------------
// Authentication persistence helpers
//
// Demo login is intentionally simple.  Credentials are validated client-side and
// the active user is mirrored into a short-lived cookie so any page will prompt
// once and then remember the mode (student/admin) until logout.
function isValidDemoUser(user) {
  if (!user) return false;
  if (user.role === 'admin') return user.email === DEMO_ADMIN.email;
  if (user.role === 'student') return user.email === DEMO_STUDENT.email;
  return false;
}

function setAuthCookie(user) {
  if (!user) return;
  const payload = {
    id: user.id,
    role: user.role,
    email: user.email,
    phone: user.phone || null,
    name: user.name || null,
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  document.cookie = `${AUTH_COOKIE_KEY}=${encoded}; path=/; max-age=${60 * 60 * 24 * 30}`;
}

function readAuthCookie() {
  const raw = document.cookie || '';
  const cookies = raw.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed.startsWith(`${AUTH_COOKIE_KEY}=`)) continue;
    try {
      const value = decodeURIComponent(trimmed.split('=').slice(1).join('='));
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function clearAuthCookie() {
  document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0`;
}

function syncUserFromCookie() {
  const cookieUser = readAuthCookie();
  if (!cookieUser || !isValidDemoUser(cookieUser)) {
    clearAuthCookie();
    if (state) {
      state.user = null;
      saveState();
    }
    return;
  }
  state.user = {
    id: cookieUser.id || `${cookieUser.role}-${Date.now()}`,
    role: cookieUser.role,
    email: cookieUser.email,
    phone: cookieUser.phone || null,
    hostel: cookieUser.role === 'student' ? DEMO_STUDENT.hostel : '',
    room: cookieUser.role === 'student' ? DEMO_STUDENT.room : '',
    name: cookieUser.name || (cookieUser.email ? cookieUser.email.split('@')[0] : ''),
  };
  saveState();
}

// Create an array of machine objects with random starting statuses.  This
// function assumes a single hostel (LVH) with 4 floors and 5 machines per
// floor.  Machines are labelled like M-1A, M-1B, etc.
function makeMachines() {
  // Generate machines for all four hostels (LVH, OH, WH, NH).  Each hostel
  // contains 4 floors with 5 machines per floor.  Statuses are
  // randomised for demonstration and align with the original React mock.
  const hostels = ['LVH', 'OH', 'WH', 'NH'];
  const machines = [];
  hostels.forEach((hostel) => {
    const floors = 4;
    for (let floor = 1; floor <= floors; floor++) {
      for (let i = 1; i <= 5; i++) {
        const id = `${hostel}-${floor}-${i}`;
        const label = `M-${floor}${String.fromCharCode(64 + i)}`;
        const running = Math.random() < 0.45;
        const awaiting = !running && Math.random() < 0.25;
        machines.push({
          id,
          label,
          hostel,
          floor,
          status: running ? 'RUNNING' : awaiting ? 'AWAITING' : 'FREE',
          eta: running ? Math.floor(8 + Math.random() * 28) : undefined,
          lastCompletedAt: awaiting
            ? Date.now() - Math.floor(Math.random() * 1000 * 60 * 30)
            : undefined,
        });
      }
    }
  });
  return machines;
}

// Create a list of common rooms for booking.  Each room has an id, a
// human-readable label and a flag indicating whether AC is available.  The
// first half of the rooms have AC.
function makeRooms() {
  const rooms = [];
  const total = 8;
  for (let i = 1; i <= total; i++) {
    rooms.push({
      id: `CR-${i}`,
      label: `Common Room ${i}`,
      hasAC: i <= total / 2,
    });
  }
  return rooms;
}

// -----------------------------------------------------------------------------
// Common room database helpers
//
// The common room booking experience needs persistent storage that is decoupled
// from the broader laundry/game state.  We keep a lightweight “database” in
// localStorage so bookings and the room catalog survive resets and can be
// reused across pages.

// Load the common room database from localStorage.  If the payload is missing
// or invalid, null is returned so the caller can seed defaults.
function loadCommonRoomDb() {
  const data = localStorage.getItem(COMMON_ROOM_DB_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.rooms || !Array.isArray(parsed.rooms)) return null;
      if (!parsed.bookings || !Array.isArray(parsed.bookings)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

// Persist the current database snapshot.
function saveCommonRoomDb() {
  if (commonRoomDB) {
    localStorage.setItem(COMMON_ROOM_DB_KEY, JSON.stringify(commonRoomDB));
  }
}

// Ensure the in-memory database is present.  Optionally reset to defaults when
// the state schema is reset.
function initCommonRoomDb(forceReset = false) {
  if (!forceReset) {
    const loaded = loadCommonRoomDb();
    if (loaded) {
      commonRoomDB = loaded;
    }
  }
  if (!commonRoomDB || forceReset) {
    commonRoomDB = {
      rooms:
        state && Array.isArray(state.rooms) && state.rooms.length > 0
          ? state.rooms
          : makeRooms(),
      bookings: state && Array.isArray(state.bookings) ? state.bookings : [],
    };
  }
  state.rooms = commonRoomDB.rooms;
  state.bookings = commonRoomDB.bookings;
  saveCommonRoomDb();
}

// Keep the backing database and app state aligned after any mutation.
function persistCommonRoomState() {
  if (!commonRoomDB) initCommonRoomDb(false);
  commonRoomDB.rooms = state.rooms;
  commonRoomDB.bookings = state.bookings;
  saveCommonRoomDb();
  saveState();
}

function ensureCommonRoomDb() {
  if (!commonRoomDB) initCommonRoomDb(false);
}

// Initialise state if none exists.  We seed machines with random data and
// prepare empty arrays for washes, notifications and reports.  A watchFree
// structure tracks which floors the user wants to be alerted about when a
// machine becomes free.
function initState() {
  state = loadState();
  // If there is no saved state OR the saved state appears invalid
  // (e.g. no machines, or machine statuses are not one of the four
  // recognised values), then recreate a fresh state.  This helps avoid
  // issues if the data model changes between versions.
  const validStatuses = ['FREE','RUNNING','AWAITING','MAINT'];
  const needsReset =
    !state ||
    state.version !== STATE_VERSION ||
    !state.machines ||
    state.machines.length === 0 ||
    state.machines.some((m) => !validStatuses.includes(m.status));

  if (needsReset) {
    state = {
      version: STATE_VERSION,
      machines: makeMachines(),
      washes: [],
      notices: [],
      reports: [],
      watchFree: {},
      user: null,
      // Add rooms and bookings for the new common room module.  Rooms are
      // pre-generated and bookings start empty.  A booking records which
      // room was requested, the time range, a reason and its approval
      // status.  Statuses include PENDING, APPROVED, REJECTED and
      // CANCELLED.
      rooms: makeRooms(),
      bookings: [],
    };
    // Initialise watchFree flags for all hostels and floors present in machines.
    const hostels = Array.from(new Set(state.machines.map((m) => m.hostel)));
    hostels.forEach((hostel) => {
      state.watchFree[hostel] = {};
      const floors = Array.from(
        new Set(state.machines.filter((m) => m.hostel === hostel).map((m) => m.floor))
      );
      floors.forEach((floor) => {
        state.watchFree[hostel][floor] = false;
      });
    });
  }
  initCommonRoomDb(needsReset);
  saveState();
}

// Push a notification into the notice list.  If the Web Notifications API is
// available and permissions are granted, also show a native toast.  Notices
// are capped at 50 entries to avoid uncontrolled growth.
function pushNotice(title, kind) {
  const notice = {
    id: `n-${Date.now()}`,
    title,
    time: new Date().toLocaleTimeString(),
    kind,
  };
  state.notices.unshift(notice);
  if (state.notices.length > 50) state.notices.pop();
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title);
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title);
      });
    }
  }
  saveState();
}

// Start a wash on the given machine with the specified duration.  The machine
// status is switched to RUNNING, an ETA is set, and a new wash record is
// inserted into the wash history.  A notification is emitted.
function startWash(machine, minutes) {
  // When starting a wash mark the machine as running and reset any
  // community nudge/flag counters.  These counters are used in the
  // game‑theory enforcement system to encourage timely pickup.
  state.machines = state.machines.map((m) =>
    m.id === machine.id
      ? {
          ...m,
          status: 'RUNNING',
          eta: minutes,
          // reset nudge and flag counters whenever a new cycle starts
          nudgeCount: 0,
          flagCount: 0,
          // record which user started the wash for nudging purposes
          ownerId: state.user ? state.user.id : null,
        }
      : m
  );
  state.washes.unshift({
    id: `w-${Date.now()}`,
    machineId: machine.id,
    machineLabel: machine.label,
    hostel: machine.hostel,
    floor: machine.floor,
    startAt: Date.now(),
    status: 'RUNNING',
  });
  pushNotice(`Started wash on ${machine.label}.`, 'info');
  saveState();
}

// Mark a machine as collected.  This frees the machine and updates any
// corresponding wash entries to the COLLECTED status.  A notification
// acknowledges the action.
function markCollected(machine) {
  state.machines = state.machines.map((m) =>
    m.id === machine.id
      ? { ...m, status: 'FREE', eta: undefined, lastCompletedAt: undefined }
      : m
  );
  state.washes = state.washes.map((w) =>
    w.machineId === machine.id && (w.status === 'AWAITING' || w.status === 'RUNNING')
      ? { ...w, status: 'COLLECTED', endAt: Date.now() }
      : w
  );
  pushNotice(`Thank you! ${machine.label} is free now.`, 'success');
  saveState();
}

// Send a gentle nudge to the current user of the machine.  No state changes
// occur but a notice is generated.
function nudgeUser(machine) {
  pushNotice(`A gentle nudge was sent for ${machine.label}.`, 'info');
}

// Community nudge system.  Increases a per‑machine counter each time
// someone nudges the owner to collect their clothes.  After several
// nudges a stronger warning is shown.  Counters reset when a new cycle
// starts.
function nudgeMachine(machine) {
  // initialise counters if missing
  if (machine.nudgeCount == null) machine.nudgeCount = 0;
  machine.nudgeCount++;
  if (machine.nudgeCount >= 3) {
    pushNotice(`Multiple nudges sent for ${machine.label}. Please collect your clothes.`, 'warning');
    // After multiple nudges, send a reminder to the owner via email/WhatsApp if possible
    sendReminderEmail(machine);
  } else {
    pushNotice(`A nudge was sent for ${machine.label}.`, 'info');
  }
  saveState();
  // re-render laundry view if present
  if (typeof updateLaundryView === 'function') updateLaundryView();
}

// Community flag system.  If two different users flag that clothes are
// still in the machine, the cycle is considered abandoned.  The
// machine returns to the AWAITING state and counters reset.  This
// provides a game‑theory mechanism to discourage users from marking a
// machine as collected when clothes remain.
function flagMachine(machine) {
  if (machine.flagCount == null) machine.flagCount = 0;
  machine.flagCount++;
  if (machine.flagCount >= 2) {
    // reset counters and return to awaiting
    machine.flagCount = 0;
    machine.nudgeCount = 0;
    machine.status = 'AWAITING';
    machine.lastCompletedAt = Date.now();
    pushNotice(`${machine.label} flagged as still occupied. Please collect your clothes.`, 'report');
  } else {
    pushNotice(`Flag recorded for ${machine.label}. One more flag will apply a penalty.`, 'info');
  }
  saveState();
  if (typeof updateLaundryView === 'function') updateLaundryView();
}

// Submit a report for a machine.  The entry is stored in the reports array.
// If affectStatus is true and the reason suggests the machine is broken,
// the machine’s status is updated to MAINT.  A notification logs the report.
function submitReport(machineId, reason, notes, photoDataUrl, affectStatus) {
  const entry = {
    id: `r-${Date.now()}`,
    machineId,
    reason,
    notes,
    photoDataUrl,
    createdAt: new Date().toLocaleString(),
  };
  state.reports.unshift(entry);
  pushNotice(`Report submitted for ${machineId}.`, 'report');
  if (affectStatus) {
    state.machines = state.machines.map((m) =>
      m.id === machineId ? { ...m, status: 'MAINT', eta: undefined } : m
    );
  }
  saveState();
}

// Minute-level tick handler.  Decrements ETAs, transitions RUNNING machines
// into AWAITING when complete, and fires notifications.  WatchFree flags
// trigger notifications when a machine becomes free on a watched floor.  If
// the current page is laundry, my-washes or alerts we re-render the
// respective views after state changes.  Only one interval is ever started.
function startTick() {
  if (tickIntervalStarted) return;
  tickIntervalStarted = true;
  setInterval(() => {
    // snapshot of free machine counts before updates
    const freeBefore = {};
    state.machines.forEach((m) => {
      if (!freeBefore[m.hostel]) freeBefore[m.hostel] = {};
      if (!freeBefore[m.hostel][m.floor]) freeBefore[m.hostel][m.floor] = 0;
      if (m.status === 'FREE') freeBefore[m.hostel][m.floor]++;
    });
    // countdown running machines
    state.machines = state.machines.map((m) => {
      if (m.status === 'RUNNING' && m.eta != null) {
        const eta = m.eta - 1;
        if (eta === 3) {
          pushNotice(`${m.label} finishing in ~3 minutes.`, 'info');
        }
        if (eta <= 0) {
          // transition to awaiting
          pushNotice(`${m.label} finished. Please collect clothes.`, 'success');
          // update washes
          state.washes = state.washes.map((w) =>
            w.machineId === m.id && w.status === 'RUNNING'
              ? { ...w, status: 'AWAITING', endAt: Date.now() }
              : w
          );
          return {
            ...m,
            status: 'AWAITING',
            eta: undefined,
            lastCompletedAt: Date.now(),
          };
        }
        return { ...m, eta };
      }
      return m;
    });
    // snapshot of free machine counts after updates
    const freeAfter = {};
    state.machines.forEach((m) => {
      if (!freeAfter[m.hostel]) freeAfter[m.hostel] = {};
      if (!freeAfter[m.hostel][m.floor]) freeAfter[m.hostel][m.floor] = 0;
      if (m.status === 'FREE') freeAfter[m.hostel][m.floor]++;
    });
    // check watchFree flags
    Object.keys(state.watchFree).forEach((hostel) => {
      Object.keys(state.watchFree[hostel]).forEach((floor) => {
        if (state.watchFree[hostel][floor]) {
          const before = freeBefore[hostel]?.[floor] ?? 0;
          const after = freeAfter[hostel]?.[floor] ?? 0;
          if (before === 0 && after > 0) {
            pushNotice(`A machine is now free on Floor ${floor}.`, 'success');
            state.watchFree[hostel][floor] = false;
          }
        }
      });
    });
    saveState();
    // If on interactive pages re-render to reflect updates
    if (document.body.classList.contains('laundry-page')) {
      updateLaundryView();
    }
    if (document.body.classList.contains('my-washes-page')) {
      renderMyWashes();
    }
    if (document.body.classList.contains('alerts-page')) {
      renderAlerts();
    }
  }, 60 * 1000);
}

// Helper to compute counts of machine statuses for a list of machines
function computeCounts(machines) {
  const counts = { FREE: 0, RUNNING: 0, AWAITING: 0, MAINT: 0 };
  machines.forEach((m) => {
    counts[m.status]++;
  });
  return counts;
}

// -----------------------------------------------------------------------------
// Room booking logic
//
// A room booking stores information about the room (id and label), the
// requested time range, the reason for booking and its current status.  When a
// student submits a booking request, a new entry is added to state.bookings
// with status PENDING.  A simulated approval routine automatically
// transitions the booking to APPROVED after a short delay.  Students can
// cancel or extend bookings, and the UI can display active and past bookings.

// Determine whether a new booking for the given room and time range
// conflicts with any existing booking.  Conflicts arise when the requested
// start time is before an existing booking’s end and the requested end time is
// after an existing booking’s start, and the existing booking is either
// pending or approved.
function checkConflict(roomId, startAt, endAt) {
  ensureCommonRoomDb();
  return commonRoomDB.bookings.some((b) => {
    if (b.roomId !== roomId) return false;
    // Only consider bookings that are active or awaiting approval
    if (b.status === 'CANCELLED' || b.status === 'REJECTED') return false;
    return startAt < b.endAt && endAt > b.startAt;
  });
}

// Submit a new booking request.  Adds a booking with status PENDING to
// state.bookings, notifies the user and schedules a simulated approval.
function submitBooking(room, startAt, endAt, reason) {
  ensureCommonRoomDb();
  const booking = {
    id: `b-${Date.now()}`,
    roomId: room.id,
    roomLabel: room.label,
    hasAC: room.hasAC,
    startAt,
    endAt,
    reason,
    status: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  commonRoomDB.bookings.unshift(booking);
  state.bookings = commonRoomDB.bookings;
  pushNotice(`Request submitted for ${room.label}.`, 'info');
  persistCommonRoomState();
  // update bookings view if present
  if (typeof renderMyBookings === 'function') renderMyBookings();
  if (typeof updateRoomsView === 'function') updateRoomsView();
}

// Simulate admin approval.  After a short delay, if the booking is still
// pending, mark it as approved and notify the user.  In a real system this
// would involve server-side logic and admin interaction.
// Admin approval helpers. These replace the earlier simulated approval and
// allow an admin view to explicitly approve or reject requests.
function approveBooking(bookingId) {
  ensureCommonRoomDb();
  const idx = commonRoomDB.bookings.findIndex((b) => b.id === bookingId);
  if (idx >= 0 && commonRoomDB.bookings[idx].status === 'PENDING') {
    const booking = commonRoomDB.bookings[idx];
    commonRoomDB.bookings[idx] = {
      ...booking,
      status: 'APPROVED',
      updatedAt: Date.now(),
    };
    state.bookings = commonRoomDB.bookings;
    pushNotice(`Booking approved for ${booking.roomLabel}.`, 'success');
    persistCommonRoomState();
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof updateRoomsView === 'function') updateRoomsView();
    if (typeof renderAdminBookings === 'function') renderAdminBookings();
  }
}

function rejectBooking(bookingId) {
  ensureCommonRoomDb();
  const idx = commonRoomDB.bookings.findIndex((b) => b.id === bookingId);
  if (idx >= 0 && commonRoomDB.bookings[idx].status === 'PENDING') {
    const booking = commonRoomDB.bookings[idx];
    commonRoomDB.bookings[idx] = {
      ...booking,
      status: 'REJECTED',
      updatedAt: Date.now(),
    };
    state.bookings = commonRoomDB.bookings;
    pushNotice(`Booking rejected for ${booking.roomLabel}.`, 'warning');
    persistCommonRoomState();
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof updateRoomsView === 'function') updateRoomsView();
    if (typeof renderAdminBookings === 'function') renderAdminBookings();
  }
}

// Cancel an existing booking.  Changes status to CANCELLED and notifies
// the user.  Only bookings in PENDING or APPROVED state can be cancelled.
function cancelBooking(id) {
  ensureCommonRoomDb();
  const idx = commonRoomDB.bookings.findIndex((b) => b.id === id);
  if (idx >= 0) {
    const booking = commonRoomDB.bookings[idx];
    if (booking.status === 'PENDING' || booking.status === 'APPROVED') {
      commonRoomDB.bookings[idx] = {
        ...booking,
        status: 'CANCELLED',
        updatedAt: Date.now(),
      };
      state.bookings = commonRoomDB.bookings;
      pushNotice(`Booking cancelled for ${booking.roomLabel}.`, 'info');
      persistCommonRoomState();
      if (typeof renderMyBookings === 'function') renderMyBookings();
      if (typeof updateRoomsView === 'function') updateRoomsView();
    }
  }
}

// Extend an existing booking by requesting a new end time.  Sets the booking
// status back to PENDING and invokes simulated approval.  Only approved
// bookings can be extended.
function extendBooking(id, newEndAt) {
  ensureCommonRoomDb();
  const idx = commonRoomDB.bookings.findIndex((b) => b.id === id);
  if (idx >= 0) {
    const booking = commonRoomDB.bookings[idx];
    if (booking.status === 'APPROVED') {
      // check that the extension does not exceed 24 hours and does not
      // conflict with other bookings
      const diff = newEndAt - booking.startAt;
      if (diff > 24 * 60 * 60 * 1000) {
        alert('Extension exceeds 24 hours from start time.');
        return;
      }
      if (checkConflict(booking.roomId, booking.startAt, newEndAt)) {
        alert('Requested extension overlaps with another booking.');
        return;
      }
      commonRoomDB.bookings[idx] = {
        ...booking,
        endAt: newEndAt,
        status: 'PENDING',
        updatedAt: Date.now(),
      };
      state.bookings = commonRoomDB.bookings;
      pushNotice(`Extension requested for ${booking.roomLabel}.`, 'info');
      persistCommonRoomState();
      if (typeof renderMyBookings === 'function') renderMyBookings();
    }
  }
}

// Modify an existing booking by specifying a new start and end time and
// optionally a new reason.  The booking returns to PENDING status pending
// approval.  Only pending or approved bookings can be modified.
function modifyBooking(id, newStartAt, newEndAt, newReason) {
  ensureCommonRoomDb();
  const idx = commonRoomDB.bookings.findIndex((b) => b.id === id);
  if (idx >= 0) {
    const booking = commonRoomDB.bookings[idx];
    if (booking.status === 'PENDING' || booking.status === 'APPROVED') {
      const diff = newEndAt - newStartAt;
      if (diff <= 0) {
        alert('End time must be after start time.');
        return;
      }
      if (diff > 24 * 60 * 60 * 1000) {
        alert('Bookings cannot exceed 24 hours.');
        return;
      }
      if (checkConflict(booking.roomId, newStartAt, newEndAt)) {
        alert('Requested times overlap with another booking.');
        return;
      }
      commonRoomDB.bookings[idx] = {
        ...booking,
        startAt: newStartAt,
        endAt: newEndAt,
        reason: newReason ?? booking.reason,
        status: 'PENDING',
        updatedAt: Date.now(),
      };
      state.bookings = commonRoomDB.bookings;
      pushNotice(`Booking modified for ${booking.roomLabel}.`, 'info');
      persistCommonRoomState();
      if (typeof renderMyBookings === 'function') renderMyBookings();
      if (typeof updateRoomsView === 'function') updateRoomsView();
    }
  }
}

// Initialise the rooms page.  Renders a list of rooms and their current
// availability, and wires up a modal for creating bookings.  A global
// updateRoomsView() is defined so other functions can re-render.
function initRoomsPage() {
  const roomsGrid = document.getElementById('rooms-grid');
  const acFilter = document.getElementById('ac-filter');
  function updateRoomsView() {
    roomsGrid.innerHTML = '';
    const filterAC = acFilter ? acFilter.checked : false;
    const now = Date.now();
    state.rooms.forEach((room) => {
      if (filterAC && !room.hasAC) return;
      const card = document.createElement('div');
      card.className = 'machine-card';
      // Icon (door emoji)
      const icon = document.createElement('div');
      icon.className = 'machine-icon';
      icon.textContent = '🚪';
      card.appendChild(icon);
      // Name
      const name = document.createElement('div');
      name.className = 'machine-name';
      name.textContent = room.label;
      card.appendChild(name);
      // Subtext: AC or Non-AC
      const sub = document.createElement('div');
      sub.className = 'machine-subtext';
      sub.textContent = room.hasAC ? 'AC room' : 'Non-AC room';
      card.appendChild(sub);
      // Determine status based on bookings
      let status = 'FREE';
      let currentBooking = null;
      state.bookings.forEach((b) => {
        if (b.roomId === room.id && b.status === 'APPROVED' && b.startAt <= now && b.endAt > now) {
          status = 'BOOKED';
          currentBooking = b;
        }
      });
      // Status chip
      const chip = document.createElement('div');
      chip.className = 'machine-status';
      if (status === 'FREE') {
        chip.classList.add('status-free');
        chip.textContent = 'Free';
      } else {
        chip.classList.add('status-booked');
        // Show booking end time for clarity
        const endDate = new Date(currentBooking.endAt);
        chip.textContent = `Booked until ${endDate.toLocaleTimeString()}`;
        card.classList.add('room-unavailable');
      }
      card.appendChild(chip);
      // Click handler to open booking modal
      card.addEventListener('click', () => {
        openRoomModal(room);
      });
      roomsGrid.appendChild(card);
    });
  }
  window.updateRoomsView = updateRoomsView;
  if (acFilter) {
    acFilter.addEventListener('change', () => updateRoomsView());
  }
  // Initial render. A short delay ensures the layout has been parsed before inserting
  // dynamic content, which fixes an issue where the grid would not render on first load.
  // Defer initial render slightly longer to ensure state and DOM are ready.
  setTimeout(() => updateRoomsView(), 50);
}

// Show a modal to create or manage a booking for the specified room.  The
// modal includes inputs for date, start time, end time and reason.  Upon
// submission, the booking is validated and submitted.  Bookings longer than
// 24 hours are rejected.
function openRoomModal(room) {
  // Create overlay if necessary
  let roomOverlay = document.getElementById('room-overlay');
  if (!roomOverlay) {
    roomOverlay = document.createElement('div');
    roomOverlay.id = 'room-overlay';
    roomOverlay.className = 'overlay';
    document.body.appendChild(roomOverlay);
  }
  roomOverlay.innerHTML = '';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const title = document.createElement('h3');
  title.textContent = room.label + (room.hasAC ? ' (AC)' : '');
  modal.appendChild(title);
  // Existing bookings section
  const existingBlock = document.createElement('div');
  existingBlock.className = 'booking-availability';
  const existingTitle = document.createElement('h4');
  existingTitle.textContent = 'Booked slots';
  existingBlock.appendChild(existingTitle);
  const bookingsList = document.createElement('div');
  bookingsList.className = 'booking-slot-list';
  const upcoming = state.bookings
    .filter((b) => b.roomId === room.id && (b.status === 'APPROVED' || b.status === 'PENDING'))
    .sort((a, b) => a.startAt - b.startAt);
  if (upcoming.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No upcoming bookings yet.';
    bookingsList.appendChild(empty);
  } else {
    upcoming.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'booking-slot-row';
      const time = `${new Date(b.startAt).toLocaleString()} → ${new Date(b.endAt).toLocaleTimeString()}`;
      const status = b.status === 'PENDING' ? 'Pending approval' : 'Approved';
      row.innerHTML = `<strong>${status}</strong><span>${time}</span>`;
      bookingsList.appendChild(row);
    });
  }
  existingBlock.appendChild(bookingsList);
  modal.appendChild(existingBlock);
  // Date input
  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Date';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.valueAsDate = new Date();
  const dateDiv = document.createElement('div');
  dateDiv.className = 'form-group';
  dateDiv.appendChild(dateLabel);
  dateDiv.appendChild(dateInput);
  modal.appendChild(dateDiv);
  // Start time input
  const startLabel = document.createElement('label');
  startLabel.textContent = 'Start time';
  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.value = '09:00';
  const startDiv = document.createElement('div');
  startDiv.className = 'form-group';
  startDiv.appendChild(startLabel);
  startDiv.appendChild(startInput);
  modal.appendChild(startDiv);
  // End time input
  const endLabel = document.createElement('label');
  endLabel.textContent = 'End time';
  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.value = '10:00';
  const endDiv = document.createElement('div');
  endDiv.className = 'form-group';
  endDiv.appendChild(endLabel);
  endDiv.appendChild(endInput);
  modal.appendChild(endDiv);
  // Reason textarea
  const reasonLabel = document.createElement('label');
  reasonLabel.textContent = 'Reason for booking';
  const reasonArea = document.createElement('textarea');
  reasonArea.rows = 3;
  reasonArea.placeholder = 'E.g., study group, LAN party, club meeting';
  const reasonDiv = document.createElement('div');
  reasonDiv.className = 'form-group';
  reasonDiv.appendChild(reasonLabel);
  reasonDiv.appendChild(reasonArea);
  modal.appendChild(reasonDiv);
  // Instruction note
  const note = document.createElement('p');
  note.style.fontSize = '0.75rem';
  note.style.color = 'var(--text-muted)';
  note.textContent = 'Bookings cannot exceed 24 hours and may span across days.';
  modal.appendChild(note);
  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'modal-actions-row';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => roomOverlay.classList.remove('active');
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Submit request';
  submitBtn.onclick = () => {
    const dateValue = dateInput.value;
    const startValue = startInput.value;
    const endValue = endInput.value;
    const reason = reasonArea.value.trim();
    if (!dateValue || !startValue || !endValue) {
      alert('Please select a date and times.');
      return;
    }
    // Construct start and end timestamps.  If the end time is before the
    // start time, assume it crosses midnight to the next day.
    const startAt = new Date(`${dateValue}T${startValue}`);
    let endAt = new Date(`${dateValue}T${endValue}`);
    if (endAt <= startAt) {
      // move end time to next day
      endAt.setDate(endAt.getDate() + 1);
    }
    const diff = endAt - startAt;
    if (diff <= 0) {
      alert('End time must be after start time.');
      return;
    }
    if (diff > 24 * 60 * 60 * 1000) {
      alert('Booking duration cannot exceed 24 hours.');
      return;
    }
    // Check for conflicts
    const startTimestamp = startAt.getTime();
    const endTimestamp = endAt.getTime();
    if (checkConflict(room.id, startTimestamp, endTimestamp)) {
      alert('This room is not available for the selected times. Please choose another slot.');
      return;
    }
    if (!reason) {
      alert('Please provide a reason for booking.');
      return;
    }
    submitBooking(room, startTimestamp, endTimestamp, reason);
    roomOverlay.classList.remove('active');
  };
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  modal.appendChild(actions);
  roomOverlay.appendChild(modal);
  roomOverlay.classList.add('active');
  // Close on outside click
  roomOverlay.addEventListener('click', (e) => {
    if (e.target === roomOverlay) {
      roomOverlay.classList.remove('active');
    }
  }, { once: true });
}

// Initialise the My Bookings page.  Defines a renderMyBookings() function
// that renders both active/pending bookings and past/cancelled bookings.
function initMyBookingsPage() {
  window.renderMyBookings = function renderMyBookings() {
    const activeList = document.getElementById('active-bookings');
    const historyList = document.getElementById('booking-history');
    if (!activeList || !historyList) return;
    activeList.innerHTML = '';
    historyList.innerHTML = '';
    const now = Date.now();
    // Define categories
    const active = [];
    const history = [];
    state.bookings.forEach((b) => {
      if (b.status === 'CANCELLED' || b.status === 'REJECTED') {
        history.push(b);
      } else if (b.endAt < now) {
        history.push({ ...b, status: 'COMPLETED' });
      } else {
        active.push(b);
      }
    });
    // Render active bookings
    active.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'wash-item';
      const info = document.createElement('div');
      info.className = 'info';
      const startStr = new Date(b.startAt).toLocaleString();
      const endStr = new Date(b.endAt).toLocaleString();
      let statusLabel;
      if (b.status === 'PENDING') statusLabel = 'Pending approval';
      else if (b.status === 'APPROVED') statusLabel = 'Approved';
      else statusLabel = b.status;
      info.innerHTML = `<strong>${b.roomLabel}</strong><span class="status">${startStr} → ${endStr}</span><span class="status">${statusLabel}</span>`;
      const actions = document.createElement('div');
      actions.className = 'wash-actions';
      // Cancel
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        cancelBooking(b.id);
        renderMyBookings();
        if (typeof updateRoomsView === 'function') updateRoomsView();
      };
      actions.appendChild(cancelBtn);
      // Extend (only for approved)
      if (b.status === 'APPROVED') {
        const extendBtn = document.createElement('button');
        extendBtn.textContent = 'Extend';
        extendBtn.onclick = () => {
          const newEnd = prompt('Enter new end time (YYYY-MM-DD HH:MM)');
          if (newEnd) {
            const newEndAt = new Date(newEnd).getTime();
            extendBooking(b.id, newEndAt);
            renderMyBookings();
          }
        };
        actions.appendChild(extendBtn);
      }
      // Modify (only for pending or approved)
      if (b.status === 'PENDING' || b.status === 'APPROVED') {
        const modifyBtn = document.createElement('button');
        modifyBtn.textContent = 'Modify';
        modifyBtn.onclick = () => {
          const newStart = prompt('Enter new start time (YYYY-MM-DD HH:MM)', new Date(b.startAt).toISOString().slice(0,16).replace('T',' '));
          const newEnd = prompt('Enter new end time (YYYY-MM-DD HH:MM)', new Date(b.endAt).toISOString().slice(0,16).replace('T',' '));
          const newReason = prompt('Enter new reason (optional)', b.reason);
          if (newStart && newEnd) {
            const newStartAt = new Date(newStart).getTime();
            const newEndAt = new Date(newEnd).getTime();
            modifyBooking(b.id, newStartAt, newEndAt, newReason);
            renderMyBookings();
          }
        };
        actions.appendChild(modifyBtn);
      }
      row.appendChild(info);
      row.appendChild(actions);
      activeList.appendChild(row);
    });
    // Render history bookings
    history.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'wash-item';
      const info = document.createElement('div');
      info.className = 'info';
      const startStr = new Date(b.startAt).toLocaleString();
      const endStr = new Date(b.endAt).toLocaleString();
      let statusLabel;
      if (b.status === 'COMPLETED') statusLabel = 'Completed';
      else statusLabel = b.status;
      info.innerHTML = `<strong>${b.roomLabel}</strong><span class="status">${startStr} → ${endStr}</span><span class="status">${statusLabel}</span>`;
      row.appendChild(info);
      historyList.appendChild(row);
    });
  };
  // Initial render after a tick to allow DOM to settle.
  setTimeout(() => renderMyBookings(), 0);
}

// Admin view for booking approvals. This page lists pending requests with
// approve/reject actions and shows upcoming approved bookings for awareness.
function initAdminBookingsPage() {
  const pendingList = document.getElementById('pending-bookings');
  const approvedList = document.getElementById('approved-bookings');
  if (!pendingList || !approvedList) return;

  const logoutLink = document.getElementById('admin-logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }

  window.renderAdminBookings = function renderAdminBookings() {
    ensureCommonRoomDb();
    pendingList.innerHTML = '';
    approvedList.innerHTML = '';
    const now = Date.now();
    const pending = state.bookings.filter((b) => b.status === 'PENDING');
    const approved = state.bookings
      .filter((b) => b.status === 'APPROVED' && b.endAt > now)
      .sort((a, b) => a.startAt - b.startAt);

    if (pending.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No pending requests.';
      pendingList.appendChild(empty);
    } else {
      pending.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'wash-item';
        const info = document.createElement('div');
        info.className = 'info';
        const times = `${new Date(b.startAt).toLocaleString()} → ${new Date(b.endAt).toLocaleTimeString()}`;
        info.innerHTML = `<strong>${b.roomLabel}</strong><span class="status">${times}</span><span class="status">Reason: ${b.reason}</span>`;
        const actions = document.createElement('div');
        actions.className = 'wash-actions';
        const approveBtn = document.createElement('button');
        approveBtn.textContent = 'Approve';
        approveBtn.onclick = () => approveBooking(b.id);
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = 'Reject';
        rejectBtn.onclick = () => rejectBooking(b.id);
        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
        row.appendChild(info);
        row.appendChild(actions);
        pendingList.appendChild(row);
      });
    }

    if (approved.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No upcoming approved bookings.';
      approvedList.appendChild(empty);
    } else {
      approved.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'wash-item';
        const info = document.createElement('div');
        info.className = 'info';
        const times = `${new Date(b.startAt).toLocaleString()} → ${new Date(b.endAt).toLocaleTimeString()}`;
        info.innerHTML = `<strong>${b.roomLabel}</strong><span class="status">${times}</span><span class="status">Approved</span>`;
        row.appendChild(info);
        approvedList.appendChild(row);
      });
    }
  };

  setTimeout(() => renderAdminBookings(), 0);
}

// On DOM ready we initialise state and start the tick.  Then we detect
// which page we are on by body class and call the appropriate initialiser.
document.addEventListener('DOMContentLoaded', () => {
  // Initialise application state and start the minute-level timer.  Do not
  // present any debug alerts in production.  Previous debug alerts have been
  // removed.
  initState();
  syncUserFromCookie();
  const canProceed = ensureAuthMode();
  startTick();
  if (!canProceed) return;
  const bodyClass = document.body.classList;
  if (bodyClass.contains('laundry-page')) {
    initLaundryPage();
  } else if (bodyClass.contains('my-washes-page')) {
    initMyWashesPage();
  } else if (bodyClass.contains('alerts-page')) {
    initAlertsPage();
  } else if (bodyClass.contains('rooms-page')) {
    initRoomsPage();
  } else if (bodyClass.contains('my-bookings-page')) {
    initMyBookingsPage();
  } else if (bodyClass.contains('admin-bookings-page')) {
    initAdminBookingsPage();
  } else if (bodyClass.contains('profile-page')) {
    initProfilePage();
  } else if (bodyClass.contains('home-page')) {
    // nothing special for home page
  }
});

// Initialise the laundry page.  This populates the hostel and floor
// selectors, renders summary chips and machine cards from the persisted
// state, and wires up event handlers for changing hostels/floors and
// watching for free machines.  A global function updateLaundryView() is
// defined so that the tick handler can trigger re-renders.
function initLaundryPage() {
  try {
    const hostelSelect = document.getElementById('hostel-select');
    const floorSelect = document.getElementById('floor-select');
    const machinesGrid = document.getElementById('machines-grid');
    const summaryContainer = document.getElementById('summary-container');
    const busyBanner = document.getElementById('busy-banner');
    const notifyBtn = document.getElementById('notify-button');

  // Remove any leftover debug messaging from earlier development.  We no longer
  // surface alerts on load; instead rely on proper rendering below.

  // Populate hostel options (only LVH for now).  Additional hostels
  // could be added to state.machines in the future.
  const hostels = Array.from(new Set(state.machines.map((m) => m.hostel)));
  hostels.forEach((hostel) => {
    const opt = document.createElement('option');
    opt.value = hostel;
    opt.textContent = hostel;
    hostelSelect.appendChild(opt);
  });
  // Default selection
  if (!hostelSelect.value) hostelSelect.value = hostels[0];

  // Populate floors based on selected hostel
  function populateFloors() {
    const selectedHostel = hostelSelect.value;
    const floors = Array.from(
      new Set(state.machines.filter((m) => m.hostel === selectedHostel).map((m) => m.floor))
    ).sort();
    floorSelect.innerHTML = '';
    floors.forEach((floor) => {
      const opt = document.createElement('option');
      opt.value = String(floor);
      opt.textContent = `Floor ${floor}`;
      floorSelect.appendChild(opt);
    });
    if (!floorSelect.value) floorSelect.value = String(floors[0]);
  }
    populateFloors();

    hostelSelect.addEventListener('change', () => {
      populateFloors();
      window.updateLaundryView();
    });
    floorSelect.addEventListener('change', () => window.updateLaundryView());

    // Update the view with machines and summary for the selected location
    window.updateLaundryView = function updateLaundryView() {
    try {
      const selectedHostel = hostelSelect.value;
      const selectedFloor = parseInt(floorSelect.value);
      const machines = state.machines.filter(
        (m) => m.hostel === selectedHostel && m.floor === selectedFloor
      );
      // compute counts
      const counts = { FREE: 0, RUNNING: 0, AWAITING: 0, MAINT: 0 };
      machines.forEach((m) => {
        counts[m.status]++;
      });
      // summary chips
      summaryContainer.innerHTML = '';
      [
        { key: 'FREE', label: 'Free' },
        { key: 'RUNNING', label: 'Running' },
        { key: 'AWAITING', label: 'Awaiting' },
        { key: 'MAINT', label: 'Maint' },
      ].forEach(({ key, label }) => {
        const chip = document.createElement('div');
        chip.className = `status-chip status-${key.toLowerCase()}`;
        chip.textContent = `${counts[key]} ${label}`;
        summaryContainer.appendChild(chip);
      });
      // busy banner
      busyBanner.style.display = counts['FREE'] === 0 ? 'flex' : 'none';
      // render machine cards
      machinesGrid.innerHTML = '';
      machines.forEach((m) => {
        const card = document.createElement('div');
        card.className = 'machine-card';
        card.dataset.id = m.id;
        card.dataset.status = m.status;
        // icon
        const icon = document.createElement('div');
        icon.className = 'machine-icon';
        icon.textContent = '🧺';
        card.appendChild(icon);
        // name
        const name = document.createElement('div');
        name.className = 'machine-name';
        name.textContent = m.label;
        card.appendChild(name);
        // subtext
        const sub = document.createElement('div');
        sub.className = 'machine-subtext';
        sub.textContent = `Floor ${m.floor} · ${m.hostel}`;
        card.appendChild(sub);
        // status chip
        const status = document.createElement('div');
        status.className = `machine-status status-${m.status.toLowerCase()}`;
        let labelStr;
        if (m.status === 'FREE') labelStr = 'Free';
        else if (m.status === 'RUNNING') labelStr = m.eta != null ? `Running · ${m.eta}m` : 'Running';
        else if (m.status === 'AWAITING') labelStr = 'Awaiting pickup';
        else labelStr = 'Maintenance';
        status.textContent = labelStr;
        card.appendChild(status);
        // click handler opens modal
        card.addEventListener('click', () => openMachineModal(m));
        machinesGrid.appendChild(card);
      });
    } catch (err) {
      console.error('updateLaundryView error:', err);
    }
  };

    // Initial render. Perform the update on the next tick to allow the DOM to
    // settle. Without deferring, the view may not populate on the first load.
    setTimeout(() => {
      try { window.updateLaundryView(); } catch (e) { console.error(e); }
    }, 0);
    // Watch-free notify button
    notifyBtn.addEventListener('click', () => {
      const selectedHostel = hostelSelect.value;
      const selectedFloor = parseInt(floorSelect.value);
      if (!state.watchFree[selectedHostel]) state.watchFree[selectedHostel] = {};
      state.watchFree[selectedHostel][selectedFloor] = true;
      saveState();
      // Provide immediate feedback to the user
      notifyBtn.textContent = 'We’ll notify you';
      notifyBtn.disabled = true;
    });

    // If a machine was requested to be opened from My Washes, handle it
    const openMachineId = localStorage.getItem('openMachineId');
    if (openMachineId) {
      const machine = state.machines.find((m) => m.id === openMachineId);
      if (machine) {
        // Delay opening slightly to allow page layout to stabilise
        setTimeout(() => openMachineModal(machine), 100);
      }
      localStorage.removeItem('openMachineId');
    }
  } catch (err) {
    console.error('initLaundryPage error:', err);
  }
}

// Display machine details in a modal.  The modal shows the current status
// along with context-specific actions (start wash, notify, nudge, mark
// collected, report).  A nested report form can be opened to flag
// maintenance issues.  When actions are taken the state is updated and
// re-rendering occurs.
function openMachineModal(machine) {
  const overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalStatus = document.getElementById('modal-status');
  const modalActions = document.getElementById('modal-actions');
  modalTitle.textContent = machine.label;
  modalActions.innerHTML = '';
  let statusText = '';
  if (machine.status === 'FREE') {
    statusText = 'This machine is free to use.';
    // Duration input
    const durationLabel = document.createElement('label');
    durationLabel.className = 'duration-label';
    durationLabel.textContent = 'Duration (min)';
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '10';
    durationInput.max = '90';
    durationInput.value = '35';
    durationInput.className = 'duration-input';
    const durationWrapper = document.createElement('div');
    durationWrapper.className = 'duration-wrapper';
    durationWrapper.appendChild(durationLabel);
    durationWrapper.appendChild(durationInput);
    modalActions.appendChild(durationWrapper);
    // Actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions-row';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.classList.remove('active');
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'Start Wash';
      startBtn.onclick = () => {
      const minutes = parseInt(durationInput.value || '35');
      startWash(machine, minutes);
      overlay.classList.remove('active');
      updateLaundryView();
      // Only attempt to render My Washes if the function exists.
      if (typeof renderMyWashes === 'function') {
        renderMyWashes();
      }
    };
    actionsRow.appendChild(cancelBtn);
    actionsRow.appendChild(startBtn);
    modalActions.appendChild(actionsRow);
  } else if (machine.status === 'RUNNING') {
    statusText = machine.eta != null
      ? `Currently running. ${machine.eta} minutes remaining.`
      : 'Currently running.';
    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions-row';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => overlay.classList.remove('active');
    const notifyBtn = document.createElement('button');
    notifyBtn.className = 'btn-primary';
    notifyBtn.textContent = 'Notify When Done';
    notifyBtn.onclick = () => {
      pushNotice(`You will be notified when ${machine.label} finishes.`, 'info');
      overlay.classList.remove('active');
    };
    actionsRow.appendChild(closeBtn);
    actionsRow.appendChild(notifyBtn);
    modalActions.appendChild(actionsRow);
  } else if (machine.status === 'AWAITING') {
    const minsAgo = machine.lastCompletedAt
      ? Math.round((Date.now() - machine.lastCompletedAt) / 60000)
      : 0;
    statusText = `Cycle complete ${minsAgo} min ago. Clothes are awaiting pickup.`;
    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions-row';
    // Create nudge button: sends a reminder to the owner using the
    // nudgeMachine() helper defined at the bottom of this file.  After
    // three nudges a stronger warning is displayed.
    const nudgeBtn = document.createElement('button');
    nudgeBtn.className = 'btn-primary';
    nudgeBtn.textContent = 'Nudge owner';
    nudgeBtn.onclick = () => {
      nudgeMachine(machine);
      overlay.classList.remove('active');
    };
    // Create flag button: indicates that clothes are still in the
    // machine.  Two flags will revert the cycle back to AWAITING and
    // notify the owner.
    const flagBtn = document.createElement('button');
    flagBtn.className = 'btn-secondary';
    flagBtn.textContent = 'Flag clothes';
    flagBtn.onclick = () => {
      flagMachine(machine);
      overlay.classList.remove('active');
    };
    // Collect button: used by the owner to mark the machine as free.
    const collectBtn = document.createElement('button');
    collectBtn.className = 'btn-secondary';
    collectBtn.textContent = 'Mark collected';
    collectBtn.onclick = () => {
      markCollected(machine);
      overlay.classList.remove('active');
      updateLaundryView();
      if (typeof renderMyWashes === 'function') {
        renderMyWashes();
      }
    };
    // Append buttons in intuitive order: nudge, flag, collect.
    actionsRow.appendChild(nudgeBtn);
    actionsRow.appendChild(flagBtn);
    actionsRow.appendChild(collectBtn);
    modalActions.appendChild(actionsRow);
  } else if (machine.status === 'MAINT') {
    statusText = 'This machine is under maintenance.';
    const okBtn = document.createElement('button');
    okBtn.className = 'btn-primary';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => overlay.classList.remove('active');
    modalActions.appendChild(okBtn);
  }
  // Report button (available for all statuses)
  const reportBtn = document.createElement('button');
  reportBtn.className = 'btn-secondary report-btn';
  reportBtn.textContent = 'Report / Flag';
  reportBtn.onclick = () => {
    // open report form
    openReportForm(machine);
  };
  modalActions.appendChild(reportBtn);
  // Status text
  modalStatus.textContent = statusText;
  overlay.classList.add('active');
  // Close overlay when clicking outside modal (but not inside nested modals)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  }, { once: true });
}

// Open a report form modal for the given machine.  Users can select a reason,
// optionally add notes and a photo, and choose whether to mark the machine as
// maintenance if the issue seems severe.  Upon submission the report is
// recorded and the machine status may be updated.
function openReportForm(machine) {
  // Create overlay if not already present
  let reportOverlay = document.getElementById('report-overlay');
  if (!reportOverlay) {
    reportOverlay = document.createElement('div');
    reportOverlay.id = 'report-overlay';
    reportOverlay.className = 'overlay';
    document.body.appendChild(reportOverlay);
  }
  reportOverlay.innerHTML = '';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const title = document.createElement('h3');
  title.textContent = `Report ${machine.label}`;
  modal.appendChild(title);
  // Reason select
  const reasonLabel = document.createElement('label');
  reasonLabel.textContent = 'Reason';
  const reasonSelect = document.createElement('select');
  ['Not working', 'Needs cleanup', 'Leaking water', 'Other'].forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    reasonSelect.appendChild(o);
  });
  const reasonDiv = document.createElement('div');
  reasonDiv.className = 'form-group';
  reasonDiv.appendChild(reasonLabel);
  reasonDiv.appendChild(reasonSelect);
  modal.appendChild(reasonDiv);
  // Notes textarea
  const notesLabel = document.createElement('label');
  notesLabel.textContent = 'Notes (optional)';
  const notesArea = document.createElement('textarea');
  notesArea.rows = 3;
  const notesDiv = document.createElement('div');
  notesDiv.className = 'form-group';
  notesDiv.appendChild(notesLabel);
  notesDiv.appendChild(notesArea);
  modal.appendChild(notesDiv);
  // Photo input
  const photoLabel = document.createElement('label');
  photoLabel.textContent = 'Photo (optional)';
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  const photoDiv = document.createElement('div');
  photoDiv.className = 'form-group';
  photoDiv.appendChild(photoLabel);
  photoDiv.appendChild(photoInput);
  modal.appendChild(photoDiv);
  let photoData = undefined;
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      photoData = reader.result;
    };
    reader.readAsDataURL(file);
  });
  // Affect maintenance checkbox
  const affectDiv = document.createElement('div');
  affectDiv.className = 'form-group horizontal';
  const affectInput = document.createElement('input');
  affectInput.type = 'checkbox';
  affectInput.id = 'affect';
  affectInput.checked = true;
  const affectLabel = document.createElement('label');
  affectLabel.htmlFor = 'affect';
  affectLabel.textContent = 'Mark machine as maintenance if issue is severe';
  affectDiv.appendChild(affectInput);
  affectDiv.appendChild(affectLabel);
  modal.appendChild(affectDiv);
  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'modal-actions-row';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    reportOverlay.classList.remove('active');
  };
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Submit';
  submitBtn.onclick = () => {
    const reason = reasonSelect.value;
    const notes = notesArea.value;
    const severe = reason === 'Not working' || reason === 'Leaking water';
    const affect = affectInput.checked && severe;
    submitReport(machine.id, reason, notes, photoData, affect);
    reportOverlay.classList.remove('active');
    // Re-render to reflect maintenance status if changed
    updateLaundryView();
  };
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  modal.appendChild(actions);
  reportOverlay.appendChild(modal);
  reportOverlay.classList.add('active');
  // close on outside click
  reportOverlay.addEventListener('click', (e) => {
    if (e.target === reportOverlay) {
      reportOverlay.classList.remove('active');
    }
  }, { once: true });
}

// Initialise the My Washes page.  Delegates rendering to renderMyWashes(),
// which will be called every minute by the tick handler to keep the list
// current.  Provide a global renderMyWashes() so other parts of the code
// (tick or actions) can refresh this view on demand.
function initMyWashesPage() {
  window.renderMyWashes = function renderMyWashes() {
    const activeList = document.getElementById('active-washes');
    const historyList = document.getElementById('wash-history');
    if (!activeList || !historyList) return;
    activeList.innerHTML = '';
    historyList.innerHTML = '';
    const active = state.washes.filter((w) => w.status === 'RUNNING' || w.status === 'AWAITING');
    const history = state.washes.filter((w) => w.status === 'COLLECTED');
    // render active
    active.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'wash-item';
      const info = document.createElement('div');
      info.className = 'info';
      // find machine for eta and location
      const machine = state.machines.find((m) => m.id === w.machineId);
      let statusLabel;
      if (w.status === 'RUNNING') {
        statusLabel = machine?.eta != null ? `Running · ${machine.eta}m remaining` : 'Running';
      } else {
        statusLabel = 'Finished · waiting pickup';
      }
      info.innerHTML = `<strong>${w.machineLabel}</strong><span class="status">${statusLabel}</span>`;
      const btnGroup = document.createElement('div');
      btnGroup.className = 'wash-actions';
      // View button
      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View';
      viewBtn.onclick = () => {
        localStorage.setItem('openMachineId', w.machineId);
        window.location.href = 'laundry.html';
      };
      btnGroup.appendChild(viewBtn);
      // Collect button if awaiting
      if (w.status === 'AWAITING') {
        const collectBtn = document.createElement('button');
        collectBtn.textContent = 'Collected';
        collectBtn.onclick = () => {
          const machineToCollect = state.machines.find((m) => m.id === w.machineId);
          if (machineToCollect) {
            markCollected(machineToCollect);
            renderMyWashes();
            updateLaundryView();
          }
        };
        btnGroup.appendChild(collectBtn);
      }
      row.appendChild(info);
      row.appendChild(btnGroup);
      activeList.appendChild(row);
    });
    // render history
    history.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'wash-item';
      const info = document.createElement('div');
      info.className = 'info';
      const start = new Date(w.startAt).toLocaleString();
      const end = w.endAt ? new Date(w.endAt).toLocaleString() : '';
      info.innerHTML = `<strong>${w.machineLabel}</strong><span class="status">${start} → ${end}</span>`;
      row.appendChild(info);
      historyList.appendChild(row);
    });
  };
  renderMyWashes();
}

// Initialise the alerts page.  Defines a renderAlerts() function which
// populates the notifications list from state.notices.  Called on page
// load and subsequently every minute by the tick handler.
function initAlertsPage() {
  window.renderAlerts = function renderAlerts() {
    const list = document.getElementById('alerts-list');
    if (!list) return;
    list.innerHTML = '';
    state.notices.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'alert-item';
      const iconDiv = document.createElement('div');
      iconDiv.className = 'icon';
      // choose an emoji based on kind
      let emoji = '🔔';
      if (n.kind === 'success') emoji = '✅';
      else if (n.kind === 'info') emoji = 'ℹ️';
      else if (n.kind === 'warning') emoji = '⚠️';
      else if (n.kind === 'report') emoji = '📝';
      iconDiv.textContent = emoji;
      const textDiv = document.createElement('div');
      textDiv.innerHTML = `<strong>${n.title}</strong><br/><span class="time">${n.time}</span>`;
      item.appendChild(iconDiv);
      item.appendChild(textDiv);
      list.appendChild(item);
    });
  };
  renderAlerts();
}

// -----------------------------------------------------------------------------
// Authentication overlay
//
// A lightweight, client-side gate that prompts for the demo student/admin
// credentials before the rest of the UI is shown.  Only the provided demo
// accounts are accepted.
function ensureAuthMode() {
  const body = document.body;
  const onAdminPage = body.classList.contains('admin-bookings-page');
  const validPersisted = isValidDemoUser(state.user);

  if (!validPersisted) {
    state.user = null;
    saveState();
    clearAuthCookie();
  }
  if (!state.user) {
    body.classList.add('auth-locked');
    showAuthOverlay();
    return false;
  }
  body.classList.remove('auth-locked');
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.remove();
  const isAdmin = state.user.role === 'admin';
  body.classList.toggle('admin-mode', isAdmin);
  setAuthCookie(state.user);
  if (isAdmin && !onAdminPage) {
    window.location.href = 'admin-bookings.html';
    return false;
  }
  if (!isAdmin && onAdminPage) {
    window.location.href = 'rooms.html';
    return false;
  }
  return true;
}

function showAuthOverlay() {
  let overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.add('active');
    return overlay;
  }
  overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.className = 'auth-overlay active';
  const card = document.createElement('div');
  card.className = 'auth-card';
  const title = document.createElement('h2');
  title.textContent = 'Log in to continue';
  const helper = document.createElement('p');
  helper.className = 'muted';
  helper.textContent = 'Use the demo accounts below to view student or admin mode.';
  card.appendChild(title);
  card.appendChild(helper);

  const formsWrapper = document.createElement('div');
  formsWrapper.className = 'auth-columns';

  const studentForm = document.createElement('form');
  studentForm.className = 'auth-form';
  const sHeading = document.createElement('h3');
  sHeading.textContent = 'Student mode';
  const sHint = document.createElement('p');
  sHint.className = 'muted';
  sHint.textContent = 'student@hostel.edu / student123';
  const sEmail = document.createElement('input');
  sEmail.type = 'email';
  sEmail.required = true;
  sEmail.value = DEMO_STUDENT.email;
  sEmail.placeholder = DEMO_STUDENT.email;
  const sPass = document.createElement('input');
  sPass.type = 'password';
  sPass.required = true;
  sPass.value = DEMO_STUDENT.password;
  const sError = document.createElement('div');
  sError.className = 'auth-error';
  const sSubmit = document.createElement('button');
  sSubmit.type = 'submit';
  sSubmit.textContent = 'Enter student mode';
  studentForm.appendChild(sHeading);
  studentForm.appendChild(sHint);
  studentForm.appendChild(sEmail);
  studentForm.appendChild(sPass);
  studentForm.appendChild(sError);
  studentForm.appendChild(sSubmit);
  studentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const valid =
      sEmail.value.trim().toLowerCase() === DEMO_STUDENT.email && sPass.value === DEMO_STUDENT.password;
    if (!valid) {
      sError.textContent = 'Use the provided student credentials to continue.';
      return;
    }
    sError.textContent = '';
    loginUser(DEMO_STUDENT.email, '', 'student', DEMO_STUDENT.name, {
      redirectTo: window.location.pathname.split('/').pop() || 'index.html',
    });
  });

  const adminForm = document.createElement('form');
  adminForm.className = 'auth-form';
  const aHeading = document.createElement('h3');
  aHeading.textContent = 'Admin mode';
  const aHint = document.createElement('p');
  aHint.className = 'muted';
  aHint.textContent = 'admin@hostel.edu / admin123';
  const aEmail = document.createElement('input');
  aEmail.type = 'email';
  aEmail.required = true;
  aEmail.value = DEMO_ADMIN.email;
  aEmail.placeholder = DEMO_ADMIN.email;
  const aPass = document.createElement('input');
  aPass.type = 'password';
  aPass.required = true;
  aPass.value = DEMO_ADMIN.password;
  const aError = document.createElement('div');
  aError.className = 'auth-error';
  const aSubmit = document.createElement('button');
  aSubmit.type = 'submit';
  aSubmit.textContent = 'Enter admin approvals';
  adminForm.appendChild(aHeading);
  adminForm.appendChild(aHint);
  adminForm.appendChild(aEmail);
  adminForm.appendChild(aPass);
  adminForm.appendChild(aError);
  adminForm.appendChild(aSubmit);
  adminForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const valid =
      aEmail.value.trim().toLowerCase() === DEMO_ADMIN.email && aPass.value === DEMO_ADMIN.password;
    if (!valid) {
      aError.textContent = 'Use the provided admin credentials to continue.';
      return;
    }
    aError.textContent = '';
    loginUser(DEMO_ADMIN.email, '', 'admin', DEMO_ADMIN.name, { redirectTo: 'admin-bookings.html' });
  });

  formsWrapper.appendChild(studentForm);
  formsWrapper.appendChild(adminForm);
  card.appendChild(formsWrapper);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}

// Initialise the profile page.  If a user is logged in (state.user), show
// their details and allow updating contact info or logging out.  If no
// user is logged in, display a simple login form that collects an email
// address (Google) and optional phone/WhatsApp number.  After login the
// user is stored in state.user and the app redirects to the home page.
function initProfilePage() {
  const container = document.getElementById('profile-container');
  if (!container) return;
  container.innerHTML = '';
  if (!state.user) {
    // Not logged in: show login form with demo credentials
    const form = document.createElement('form');
    form.className = 'profile-form';
    const heading = document.createElement('h2');
    heading.textContent = 'Student login';
    form.appendChild(heading);
    const subtitle = document.createElement('p');
    subtitle.className = 'muted';
    subtitle.textContent = 'Use student@hostel.edu / student123';
    form.appendChild(subtitle);
    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Academic email (Google)';
    emailLabel.setAttribute('for', 'login-email');
    form.appendChild(emailLabel);
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'login-email';
    emailInput.required = true;
    emailInput.placeholder = DEMO_STUDENT.email;
    emailInput.value = DEMO_STUDENT.email;
    form.appendChild(emailInput);
    const passLabel = document.createElement('label');
    passLabel.textContent = 'Password';
    form.appendChild(passLabel);
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.required = true;
    passInput.value = DEMO_STUDENT.password;
    form.appendChild(passInput);
    const phoneLabel = document.createElement('label');
    phoneLabel.textContent = 'Phone / WhatsApp (optional)';
    phoneLabel.setAttribute('for', 'login-phone');
    form.appendChild(phoneLabel);
    const phoneInput = document.createElement('input');
    phoneInput.type = 'text';
    phoneInput.id = 'login-phone';
    phoneInput.placeholder = '+91 9876543210';
    form.appendChild(phoneInput);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'auth-error';
    form.appendChild(errorMsg);
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Sign in';
    form.appendChild(submitBtn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;
      if (email !== DEMO_STUDENT.email || password !== DEMO_STUDENT.password) {
        errorMsg.textContent = 'Use the provided student credentials.';
        return;
      }
      const phone = phoneInput.value.trim();
      errorMsg.textContent = '';
      loginUser(DEMO_STUDENT.email, phone, 'student', DEMO_STUDENT.name, {
        redirectTo: 'index.html',
      });
    });
    // Append the student login form to the container
    container.appendChild(form);
    // Create an admin login toggle below the form
    const adminPara = document.createElement('p');
    adminPara.className = 'admin-link';
    adminPara.innerHTML = 'For admin login, <a href="#">click here</a>';
    container.appendChild(adminPara);
    // Render the admin login form when the link is clicked
    adminPara.querySelector('a').addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      renderAdminForm();
    });
    // Helper to render the admin login form
    function renderAdminForm() {
      container.innerHTML = '';
      const aForm = document.createElement('form');
      aForm.className = 'profile-form';
      const h = document.createElement('h2');
      h.textContent = 'Admin login';
      aForm.appendChild(h);
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = 'Use admin@hostel.edu / admin123';
      aForm.appendChild(hint);
      // Admin email field
      const aEmailLabel = document.createElement('label');
      aEmailLabel.textContent = 'Admin email';
      aForm.appendChild(aEmailLabel);
      const aEmailInput = document.createElement('input');
      aEmailInput.type = 'email';
      aEmailInput.placeholder = DEMO_ADMIN.email;
      aEmailInput.value = DEMO_ADMIN.email;
      aForm.appendChild(aEmailInput);
      // Admin password field
      const aPassLabel = document.createElement('label');
      aPassLabel.textContent = 'Password';
      aForm.appendChild(aPassLabel);
      const aPassInput = document.createElement('input');
      aPassInput.type = 'password';
      aPassInput.value = DEMO_ADMIN.password;
      aForm.appendChild(aPassInput);
      const aError = document.createElement('div');
      aError.className = 'auth-error';
      aForm.appendChild(aError);
      // Submit button for admin login
      const aSubmit = document.createElement('button');
      aSubmit.type = 'submit';
      aSubmit.textContent = 'Log in';
      aForm.appendChild(aSubmit);
      // Back link to student login
      const backP = document.createElement('p');
      backP.className = 'admin-link';
      backP.innerHTML = '<a href="#">Back to student login</a>';
      aForm.appendChild(backP);
      aForm.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const emailVal = aEmailInput.value.trim().toLowerCase();
        const passVal = aPassInput.value;
        if (emailVal !== DEMO_ADMIN.email || passVal !== DEMO_ADMIN.password) {
          aError.textContent = 'Use the provided admin credentials.';
          return;
        }
        aError.textContent = '';
        loginUser(DEMO_ADMIN.email, '', 'admin', DEMO_ADMIN.name, { redirectTo: 'admin-bookings.html' });
      });
      // On back link click, re-render student login page
      backP.querySelector('a').addEventListener('click', (evt2) => {
        evt2.preventDefault();
        initProfilePage();
      });
      container.appendChild(aForm);
    }
  } else {
    // Logged in: show profile and update form
    const infoSection = document.createElement('div');
    infoSection.className = 'profile-info';
    // Heading
    const heading = document.createElement('h2');
    heading.textContent = 'Your Profile';
    infoSection.appendChild(heading);
    // Avatar with Google and user icons
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar';
    avatarDiv.innerHTML = `<span class="google-icon">G</span><span class="user-icon">👤</span>`;
    infoSection.appendChild(avatarDiv);
    // Name field (fall back to email local part)
    const nameVal = state.user.name || (state.user.email ? state.user.email.split('@')[0] : '');
    const nameP = document.createElement('p');
    nameP.innerHTML = `<strong>Name:</strong> ${nameVal}`;
    infoSection.appendChild(nameP);
    // Email field
    const emailP = document.createElement('p');
    emailP.innerHTML = `<strong>Email:</strong> ${state.user.email}`;
    infoSection.appendChild(emailP);
    // Hostel and room fields (use defaults if not set)
    const hostelP = document.createElement('p');
    hostelP.innerHTML = `<strong>Hostel:</strong> ${state.user.hostel || 'LVH'}`;
    infoSection.appendChild(hostelP);
    const roomP = document.createElement('p');
    roomP.innerHTML = `<strong>Room:</strong> ${state.user.room || ''}`;
    infoSection.appendChild(roomP);
    // Contact update form
    const phoneForm = document.createElement('form');
    phoneForm.className = 'profile-form';
    const phoneLabel = document.createElement('label');
    phoneLabel.textContent = 'Phone / WhatsApp';
    phoneLabel.setAttribute('for', 'profile-phone');
    phoneForm.appendChild(phoneLabel);
    const phoneInput = document.createElement('input');
    phoneInput.type = 'text';
    phoneInput.id = 'profile-phone';
    phoneInput.value = state.user.phone || '';
    phoneInput.placeholder = '+91 9876543210';
    phoneForm.appendChild(phoneInput);
    const updateBtn = document.createElement('button');
    updateBtn.type = 'submit';
    updateBtn.textContent = 'Update contact';
    phoneForm.appendChild(updateBtn);
    phoneForm.addEventListener('submit', (e) => {
      e.preventDefault();
      updateUserContact(phoneInput.value);
    });
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Log out';
    logoutBtn.addEventListener('click', () => {
      logoutUser();
    });
    container.appendChild(infoSection);
    container.appendChild(phoneForm);
    container.appendChild(logoutBtn);
    // Add My Washes and My Bookings sections within profile
    const washesSection = document.createElement('div');
    washesSection.className = 'profile-section';
    washesSection.innerHTML = `<h3>My Washes</h3><div id="active-washes" class="wash-list"></div><div id="wash-history" class="wash-list"></div>`;
    container.appendChild(washesSection);
    const bookingsSection = document.createElement('div');
    bookingsSection.className = 'profile-section';
    bookingsSection.innerHTML = `<h3>My Bookings</h3><div id="active-bookings" class="wash-list"></div><div id="booking-history" class="wash-list"></div>`;
    container.appendChild(bookingsSection);
    // Initialise the dynamic lists after a tick to ensure DOM elements exist
    setTimeout(() => {
      // Define render functions if not already defined by visiting the respective pages
      if (typeof initMyWashesPage === 'function') initMyWashesPage();
      if (typeof initMyBookingsPage === 'function') initMyBookingsPage();
    }, 0);
  }
}

// Login a user and persist to state.  Generates a simple id and records
// email and phone number.  The role controls whether the user sees the
// student experience or the admin approvals view.
function loginUser(email, phone, role = 'student', nameOverride, options = {}) {
  const cleanedEmail = email.trim();
  state.user = {
    id: `${role}-${Date.now()}`,
    role,
    email: cleanedEmail,
    phone: (phone || '').trim() || null,
    hostel: role === 'student' ? DEMO_STUDENT.hostel : '',
    room: role === 'student' ? DEMO_STUDENT.room : '',
    name: nameOverride || cleanedEmail.split('@')[0],
  };
  saveState();
  setAuthCookie(state.user);
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.remove();
  document.body.classList.remove('auth-locked');
  document.body.classList.toggle('admin-mode', role === 'admin');
  pushNotice('Logged in as ' + state.user.email, 'info');
  const redirectTarget =
    options.redirectTo || (role === 'admin' ? 'admin-bookings.html' : window.location.pathname.split('/').pop() || 'index.html');
  window.location.href = redirectTarget;
}

// Update the logged in user's contact number and save.
function updateUserContact(phone) {
  if (!state.user) return;
  state.user.phone = phone.trim() || null;
  saveState();
  pushNotice('Profile updated', 'success');
}

// Log out the current user, clear profile and redirect to home page.
function logoutUser() {
  state.user = null;
  saveState();
  clearAuthCookie();
  pushNotice('Logged out', 'info');
  window.location.href = 'index.html';
}

// Simulate sending a reminder notification (email/WhatsApp) to the owner
// of a machine after repeated nudges.  In a real system this would
// integrate with email or messaging APIs.  Here we simply record a
// notice when a machine has an owner and at least one contact method.
function sendReminderEmail(machine) {
  if (!machine.ownerId) return;
  // Find the owner in state.  In this prototype there is only one
  // logged in user, so we send to state.user if ids match.
  const owner = state.user && state.user.id === machine.ownerId ? state.user : null;
  if (!owner) return;
  const contact = owner.phone || owner.email;
  if (!contact) return;
  pushNotice(`Reminder sent to ${contact} to collect clothes from ${machine.label}.`, 'info');
}