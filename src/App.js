import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  getCurrentProfile,
  getSupabaseConfigStatus,
  signInWithPassword,
  signOut as signOutSupabase,
} from './services/auth.service';
import {
  canUseLiveState,
  loadLiveStateSnapshot,
  mergeLiveState,
  normalizeLiveState,
  saveLiveStateSnapshot,
  subscribeToLiveStateSnapshot,
  syncStudentsTable,
} from './services/live-state.service';
import './App.css';

const seedStudents = [
  { id: 'BE-2026-001', idNo: '2022-0148', firstName: 'Alyssa', middleName: 'Dela Cruz', lastName: 'Mendoza', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '4th Year', sex: 'Female', civilStatus: 'Single' },
  { id: 'BE-2026-002', idNo: '2022-0172', firstName: 'Marco', middleName: 'Lopez', lastName: 'Reyes', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '4th Year', sex: 'Male', civilStatus: 'Single' },
  { id: 'BE-2026-003', idNo: '2023-0224', firstName: 'Janelle', middleName: 'Ramos', lastName: 'Cruz', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '3rd Year', sex: 'Female', civilStatus: 'Single' },
  { id: 'BE-2026-004', idNo: '2023-0255', firstName: 'Nico', middleName: 'Garcia', lastName: 'Santos', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '3rd Year', sex: 'Male', civilStatus: 'Single' },
  { id: 'BE-2026-005', idNo: '2024-0119', firstName: 'Patricia', middleName: 'Uy', lastName: 'Lim', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '2nd Year', sex: 'Female', civilStatus: 'Single' },
  { id: 'BE-2026-006', idNo: '2025-0061', firstName: 'Diego', middleName: 'Tan', lastName: 'Villanueva', college: 'College of Education', course: 'BSEd Business Education', yearLevel: '1st Year', sex: 'Male', civilStatus: 'Single' },
];

const seedEvents = [
  {
    id: 'EVT-001',
    title: 'Business Education General Assembly',
    date: '2026-04-30',
    venue: 'BEd Auditorium',
    organizer: 'Business Ed Department',
    description: 'Department-wide orientation and activity briefing.',
  },
  {
    id: 'EVT-002',
    title: 'Teaching Demonstration Workshop',
    date: '2026-05-08',
    venue: 'BEd Laboratory Room',
    organizer: 'Practice Teaching Committee',
    description: 'Skills workshop for teaching strategies and demo preparation.',
  },
];

const seedLogs = [
  { id: 'LOG-001', eventId: 'EVT-001', studentId: 'BE-2026-001', loginAt: '2026-04-30T08:02:00+08:00', logoutAt: '2026-04-30T11:46:00+08:00' },
  { id: 'LOG-002', eventId: 'EVT-001', studentId: 'BE-2026-002', loginAt: '2026-04-30T08:17:00+08:00', logoutAt: null },
  { id: 'LOG-003', eventId: 'EVT-001', studentId: 'BE-2026-003', loginAt: '2026-04-30T08:05:00+08:00', logoutAt: '2026-04-30T11:35:00+08:00' },
];

const storageKey = 'business-ed-event-attendance-state';
const authStorageKey = 'business-ed-event-attendance-auth';
const previousStorageKey = 'business-ed-attendance-state';
const logoPath = `${process.env.PUBLIC_URL}/department-logo.png`;
const defaultAdminAccount = { username: 'admin', password: 'admin123', name: 'System Admin', role: 'Admin' };
const seedOfficerAccounts = [
  { id: 'OFF-001', username: 'officer', password: 'officer123', name: 'Student Officer', role: 'Student Officer' },
];

function createInitialState() {
  return {
    user: { name: 'Catherine Ramos', role: 'Admin' },
    students: seedStudents,
    events: seedEvents,
    logs: seedLogs,
    adminAccount: defaultAdminAccount,
    officerAccounts: seedOfficerAccounts,
    notices: [
      'Students must log in when they arrive and log out before leaving the event.',
      'Open logs show students currently inside the event venue.',
    ],
  };
}

function createEmptyLiveState() {
  return {
    ...createInitialState(),
    students: [],
    events: [],
    logs: [],
    notices: [],
  };
}

function migrateState(savedState) {
  if (savedState?.events && savedState?.logs) {
    return {
      ...savedState,
      adminAccount: savedState.adminAccount || defaultAdminAccount,
      officerAccounts: savedState.officerAccounts || seedOfficerAccounts,
    };
  }

  return createInitialState();
}

function loadState() {
  if (canUseLiveState()) {
    return createEmptyLiveState();
  }

  try {
    localStorage.removeItem(previousStorageKey);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      return migrateState(JSON.parse(saved));
    }
  } catch (error) {
    console.warn('Unable to load saved attendance state', error);
  }
  return createInitialState();
}

function loadAuthUser() {
  try {
    const saved = sessionStorage.getItem(authStorageKey);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('Unable to load saved user session', error);
    return null;
  }
}

function App() {
  const [state, setState] = useState(loadState);
  const [authUser, setAuthUser] = useState(loadAuthUser);
  const [activeView, setActiveView] = useState('Dashboard');
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.id || '');
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState(canUseLiveState() ? 'Connecting to Supabase...' : 'Local mode');
  const hasLoadedLiveState = useRef(false);
  const lastSavedState = useRef('');

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLiveState() {
      if (!canUseLiveState()) {
        hasLoadedLiveState.current = true;
        setSyncStatus('Local mode');
        return;
      }

      setSyncStatus('Loading Supabase data...');
      const { data, error } = await loadLiveStateSnapshot();

      if (cancelled) return;

      if (error) {
        hasLoadedLiveState.current = true;
        setSyncStatus('Run the live app state SQL migration in Supabase.');
        console.warn('Unable to load Supabase live state', error);
        return;
      }

      const liveState = normalizeLiveState(data || {});
      setState((current) => mergeLiveState(current, liveState));
      lastSavedState.current = JSON.stringify(liveState);
      setSyncStatus('Live data loaded from Supabase');

      if (liveState.students.length) {
        const { error: studentSyncError } = await syncStudentsTable(liveState.students);
        if (studentSyncError) {
          setSyncStatus('Run migration 0003 to sync public.students.');
        } else {
          setSyncStatus(`Synced to Supabase (${liveState.students.length} students)`);
        }
      }

      hasLoadedLiveState.current = true;
    }

    hydrateLiveState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canUseLiveState()) return undefined;

    return subscribeToLiveStateSnapshot(
      (liveState) => {
        const serialized = JSON.stringify(liveState);
        if (serialized === lastSavedState.current) return;

        lastSavedState.current = serialized;
        setState((current) => mergeLiveState(current, liveState));
        setSyncStatus('Live update received from Supabase');
      },
      (error) => {
        console.warn('Supabase realtime subscription failed', error);
        setSyncStatus('Realtime unavailable. Saving still works when online.');
      }
    );
  }, []);

  useEffect(() => {
    if (!hasLoadedLiveState.current || !canUseLiveState()) return undefined;

    const syncTimer = window.setTimeout(async () => {
      const livePayload = {
        students: state.students,
        events: state.events,
        logs: state.logs,
        notices: state.notices,
      };
      const serialized = JSON.stringify(livePayload);

      if (serialized === lastSavedState.current) return;

      setSyncStatus('Saving to Supabase...');
      const { error } = await saveLiveStateSnapshot(state);

      if (error) {
        setSyncStatus('Snapshot saved, but students table needs migration 0003.');
        console.warn('Unable to save Supabase live state', error);
        return;
      }

      lastSavedState.current = serialized;
      setSyncStatus(`Synced to Supabase (${state.students.length} students)`);
    }, 700);

    return () => window.clearTimeout(syncTimer);
  }, [state]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!state.events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(state.events[0]?.id || '');
    }
  }, [selectedEventId, state.events]);

  useEffect(() => {
    if (authUser?.role === 'Student Officer' && activeView !== 'Attendance') {
      setActiveView('Attendance');
    }
  }, [activeView, authUser]);

  const metrics = useMemo(() => getMetrics(state, selectedEventId), [state, selectedEventId]);
  const updateState = (patch) => setState((current) => ({ ...current, ...patch }));
  const isStudentOfficer = authUser?.role === 'Student Officer';

  function handleLogin(user) {
    const sessionUser = { name: user.name, role: user.role, username: user.username };
    sessionStorage.setItem(authStorageKey, JSON.stringify(sessionUser));
    setAuthUser(sessionUser);
    setActiveView(user.role === 'Student Officer' ? 'Attendance' : 'Dashboard');
  }

  async function handleLogout() {
    await signOutSupabase();
    sessionStorage.removeItem(authStorageKey);
    setAuthUser(null);
    setActiveView('Dashboard');
  }

  if (!authUser) {
    return <LoginScreen adminAccount={state.adminAccount} officerAccounts={state.officerAccounts} onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} user={authUser} online={online} isStudentOfficer={isStudentOfficer} onLogout={handleLogout} />
      <section className="workspace">
        <TopBar user={authUser} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} state={state} syncStatus={syncStatus} onLogout={handleLogout} />
        {!isStudentOfficer && activeView === 'Dashboard' && <Dashboard state={state} metrics={metrics} selectedEventId={selectedEventId} setActiveView={setActiveView} />}
        {!isStudentOfficer && activeView === 'Students' && <Students state={state} updateState={updateState} />}
        {!isStudentOfficer && activeView === 'Events' && <Events state={state} updateState={updateState} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />}
        {activeView === 'Attendance' && <Attendance state={state} updateState={updateState} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} canClearRecords={!isStudentOfficer} />}
        {!isStudentOfficer && activeView === 'Reports' && <Reports state={state} metrics={metrics} selectedEventId={selectedEventId} />}
        {!isStudentOfficer && activeView === 'Settings' && <UserSettings state={state} updateState={updateState} authUser={authUser} setAuthUser={setAuthUser} />}
      </section>
    </main>
  );
}

function LoginScreen({ adminAccount, officerAccounts, onLogin }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const loginId = credentials.username.trim();
    const password = credentials.password;

    if (loginId.includes('@')) {
      try {
        const { data, error: signInError } = await signInWithPassword(loginId, password);

        if (signInError) {
          setError(signInError.message || 'Invalid email or password.');
          setIsSubmitting(false);
          return;
        }

        const { data: profile, error: profileError } = await getCurrentProfile();

        if (profileError || !profile) {
          setError('Signed in, but no user profile was found. Run supabase/seed.sql after creating the Auth user.');
          setIsSubmitting(false);
          return;
        }

        onLogin({
          name: profile.full_name || data.user?.email || 'Supabase User',
          role: mapSupabaseRoleToAppRole(profile.role, profile.email),
          username: profile.email,
        });
        setIsSubmitting(false);
        return;
      } catch (loginError) {
        console.warn('Supabase login failed', loginError);
        setError('Supabase login failed. Check your project keys and user seed.');
        setIsSubmitting(false);
        return;
      }
    }

    const users = [adminAccount || defaultAdminAccount, ...(officerAccounts || [])];
    const found = users.find((user) =>
      user.username === loginId && user.password === password
    );

    if (!found) {
      setError('Invalid username or password.');
      setIsSubmitting(false);
      return;
    }

    onLogin(found);
    setIsSubmitting(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <img src={logoPath} alt="Business Education Department logo" />
        <p className="eyebrow">User Role Login</p>
        <h1>BUSINESS EDUCATION DEPARTMENT ATTENDANCE TRACKER</h1>
        <form className="login-form" onSubmit={submitLogin}>
          <input placeholder="Username" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} />
          <input placeholder="Password" type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} />
          {error && <p className="login-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Logging in...' : 'Log in'}</button>
        </form>
        <div className="credential-hint">
          <strong>Demo accounts</strong>
          <p>Supabase Admin: admin@example.com / admin123</p>
          <p>Supabase Officer: officer@example.com / officer123</p>
          <p>Admin: {(adminAccount || defaultAdminAccount).username} / current Admin password</p>
          <p>Student Officer: officer / officer123</p>
          <p>Admin may add more Student Officer accounts in Settings.</p>
        </div>
      </section>
    </main>
  );
}

function mapSupabaseRoleToAppRole(role, email) {
  if (role === 'admin') return 'Admin';
  if (email === 'officer@example.com') return 'Student Officer';
  if (role === 'coordinator') return 'Department Coordinator';
  if (role === 'student_viewer') return 'Student Viewer';
  return 'Instructor';
}

function Sidebar({ activeView, setActiveView, user, online, isStudentOfficer, onLogout }) {
  const nav = isStudentOfficer ? ['Attendance'] : ['Dashboard', 'Students', 'Events', 'Attendance', 'Reports', 'Settings'];
  return (
    <aside className="sidebar">
      <div>
        <div className="brand-mark">
          <img src={logoPath} alt="Business Education Department logo" />
        </div>
        <p className="eyebrow">Business Education Department</p>
        <h1>Event Attendance</h1>
      </div>
      <nav className="nav-list" aria-label="Primary navigation">
        {nav.map((item) => (
          <button className={activeView === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => setActiveView(item)}>
            <span>{iconFor(item)}</span>
            {item}
          </button>
        ))}
      </nav>
      <div className="user-card">
        <span className={online ? 'status-dot online' : 'status-dot'} />
        <div>
          <strong>{user.name}</strong>
          <p>{user.role} - {online ? 'Online' : 'Offline ready'}</p>
        </div>
      </div>
      <button className="logout-button" onClick={onLogout}>Log out</button>
    </aside>
  );
}

function TopBar({ state, user, selectedEventId, setSelectedEventId, syncStatus, onLogout }) {
  return (
    <header className="topbar">
      <div className="title-lockup">
        <img src={logoPath} alt="" aria-hidden="true" />
        <div>
          <p className="eyebrow">Event attendance tracker</p>
          <h2>BUSINESS EDUCATION DEPARTMENT ATTENDANCE TRACKER</h2>
        </div>
      </div>
      <div className="topbar-controls">
        <label className="role-switcher">
          Active Event
          <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
            {state.events.map((eventItem) => <option key={eventItem.id} value={eventItem.id}>{eventItem.title}</option>)}
          </select>
        </label>
        <div className="sync-pill">{syncStatus}</div>
        <div className="signed-in-pill">{user.role}</div>
        <button className="ghost-button" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function Dashboard({ state, metrics, selectedEventId, setActiveView }) {
  const event = state.events.find((item) => item.id === selectedEventId);
  const groupedCharts = getDashboardGroups(state, selectedEventId);
  const analysis = getDashboardAnalysis(groupedCharts, metrics);

  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Active event</p>
          <h3>{event?.title || 'Create an event to start tracking attendance'}</h3>
          <p>{event ? `${formatDate(event.date)} at ${event.venue}. ${metrics.checkedInNow} student(s) are currently logged in.` : 'Add an event, then students can log in and log out with timestamps.'}</p>
        </div>
        <button className="primary-button" onClick={() => setActiveView('Attendance')}>Open log in / log out</button>
      </section>

      <section className="metric-grid" aria-label="Event attendance summary">
        <Metric label="Total students" value={state.students.length} tone="blue" />
        <Metric label="Logged in" value={metrics.loggedIn} tone="green" />
        <Metric label="Logged out" value={metrics.loggedOut} tone="amber" />
        <Metric label="Not yet logged" value={metrics.notLogged} tone="red" />
      </section>

      <div className="content-grid">
        <section className="panel">
          <PanelTitle title="Current Event Flow" action={`${metrics.attendanceRate}% attendance`} />
          <div className="chart-bars">
            <ProgressRow label="Logged in" value={metrics.loggedIn} max={state.students.length} />
            <ProgressRow label="Logged out" value={metrics.loggedOut} max={state.students.length} />
            <ProgressRow label="Inside venue" value={metrics.checkedInNow} max={state.students.length} />
            <ProgressRow label="No log yet" value={metrics.notLogged} max={state.students.length} />
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="Dashboard Analysis" action="Event summary" />
          <div className="analysis-list">
            {analysis.map((item) => <p key={item}>{item}</p>)}
          </div>
        </section>
      </div>
      <section className="dashboard-chart-grid">
        <DashboardChart title="Attendance by Course" data={groupedCharts.course} />
        <DashboardChart title="Attendance by Year Level" data={groupedCharts.yearLevel} />
        <DashboardChart title="Attendance by Sex" data={groupedCharts.sex} />
      </section>
    </div>
  );
}

function Students({ state, updateState }) {
  const [query, setQuery] = useState('');
  const blankForm = {
    firstName: '',
    middleName: '',
    lastName: '',
    idNo: '',
    college: '',
    course: '',
    yearLevel: '1st Year',
    sex: '',
    civilStatus: '',
  };
  const [form, setForm] = useState(blankForm);
  const [importMessage, setImportMessage] = useState('');
  const students = state.students.filter((student) =>
    [
      getStudentIdNo(student),
      getStudentName(student),
      student.college,
      student.course,
      getStudentYearLevel(student),
      student.sex,
      student.civilStatus,
    ].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  function addStudent(event) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.idNo.trim()) return;
    const student = {
      id: `BE-${Date.now().toString().slice(-6)}`,
      ...form,
    };
    updateState({ students: [student, ...state.students] });
    setForm(blankForm);
  }

  function deleteStudent(id) {
    updateState({
      students: state.students.filter((student) => student.id !== id),
      logs: state.logs.filter((record) => record.studentId !== id),
    });
  }

  async function importStudents(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      const imported = rows.map(normalizeStudentRow).filter((student) => student.idNo && student.firstName && student.lastName);

      if (!imported.length) {
        setImportMessage('No valid students found. Include at least ID No., First Name, and Last Name columns.');
        event.target.value = '';
        return;
      }

      const existingByNumber = new Map(state.students.map((student) => [getStudentIdNo(student).trim().toLowerCase(), student]));
      let added = 0;
      let updated = 0;

      imported.forEach((student, index) => {
        const key = student.idNo.trim().toLowerCase();
        const existing = existingByNumber.get(key);
        if (existing) {
          existingByNumber.set(key, { ...existing, ...student });
          updated += 1;
        } else {
          existingByNumber.set(key, { id: `BE-${Date.now()}-${index}`, ...student });
          added += 1;
        }
      });

      updateState({ students: Array.from(existingByNumber.values()) });
      setImportMessage(`Imported ${imported.length} row(s): ${added} added, ${updated} updated.`);
    } catch (error) {
      console.warn('Student import failed', error);
      setImportMessage('Import failed. Please use a valid .xlsx, .xls, or .csv file.');
    }

    event.target.value = '';
  }

  return (
    <div className="view-stack">
      <SectionHeader title="Student Registry" subtitle="Enter all students under the Business Education Department before event attendance starts." />
      <div className="content-grid">
        <form className="panel form-panel" onSubmit={addStudent}>
          <PanelTitle title="Add Student" action="Department roster" />
          <input placeholder="ID No." value={form.idNo} onChange={(event) => setForm({ ...form, idNo: event.target.value })} />
          <div className="form-row">
            <input placeholder="First Name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            <input placeholder="Middle Name" value={form.middleName} onChange={(event) => setForm({ ...form, middleName: event.target.value })} />
          </div>
          <input placeholder="Last Name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <input placeholder="College" value={form.college} onChange={(event) => setForm({ ...form, college: event.target.value })} />
          <input placeholder="Course" value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} />
          <div className="form-row">
            <select value={form.yearLevel} onChange={(event) => setForm({ ...form, yearLevel: event.target.value })}>
              <option>1st Year</option>
              <option>2nd Year</option>
              <option>3rd Year</option>
              <option>4th Year</option>
            </select>
            <select value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
              <option value="">Sex</option>
              <option>Female</option>
              <option>Male</option>
            </select>
          </div>
          <input placeholder="Civil Status" value={form.civilStatus} onChange={(event) => setForm({ ...form, civilStatus: event.target.value })} />
          <button className="primary-button" type="submit">Add student</button>
        </form>
        <section className="panel table-panel">
          <PanelTitle title="Department Students" action={`${students.length} shown`} />
          <div className="import-box">
            <div>
              <strong>Import Excel Student List</strong>
              <p>Accepted columns: First Name, Middle Name, Last Name, ID No., College, Course, Year Level, Sex, Civil Status.</p>
            </div>
            <label className="file-button">
              Choose file
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importStudents} />
            </label>
          </div>
          {importMessage && <p className="import-message">{importMessage}</p>}
          <input className="search-input" placeholder="Search ID no., name, college, course, year, sex, or civil status" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="table-list">
            {students.map((student) => (
              <article className="table-card" key={student.id}>
                <div>
                  <strong>{getStudentName(student)}</strong>
                  <p>{getStudentIdNo(student)} - {getStudentYearLevel(student)} - {student.course || student.section || 'No course'}</p>
                  <div className="student-details">
                    <span>{student.college || 'No college'}</span>
                    <span>{student.sex || 'No sex'}</span>
                    <span>{student.civilStatus || 'No civil status'}</span>
                  </div>
                </div>
                <button className="ghost-button danger" onClick={() => deleteStudent(student.id)}>Delete</button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Events({ state, updateState, selectedEventId, setSelectedEventId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: '', date: today, venue: '', organizer: 'Business Ed Department', description: '' });

  function addEvent(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.date || !form.venue.trim()) return;
    const nextEvent = { id: `EVT-${Date.now().toString().slice(-5)}`, ...form };
    updateState({ events: [nextEvent, ...state.events] });
    setSelectedEventId(nextEvent.id);
    setForm({ title: '', date: today, venue: '', organizer: 'Business Ed Department', description: '' });
  }

  function deleteEvent(id) {
    const remainingEvents = state.events.filter((event) => event.id !== id);
    updateState({
      events: remainingEvents,
      logs: state.logs.filter((record) => record.eventId !== id),
    });
    if (selectedEventId === id) {
      setSelectedEventId(remainingEvents[0]?.id || '');
    }
  }

  return (
    <div className="view-stack">
      <SectionHeader title="Activities & Events" subtitle="Create department activities, assemblies, seminars, and workshops for attendance monitoring." />
      <div className="content-grid">
        <form className="panel form-panel" onSubmit={addEvent}>
          <PanelTitle title="Add Event" action="Activity setup" />
          <input placeholder="Event or activity title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <div className="form-row">
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            <input placeholder="Venue" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} />
          </div>
          <input placeholder="Organizer" value={form.organizer} onChange={(event) => setForm({ ...form, organizer: event.target.value })} />
          <input placeholder="Short description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <button className="primary-button" type="submit">Add event</button>
        </form>
        <section className="class-grid">
          {state.events.map((item) => {
            const count = getEventLogs(state.logs, item.id).length;
            return (
              <article className={item.id === selectedEventId ? 'class-card selected' : 'class-card'} key={item.id}>
                <span>{formatDate(item.date)}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <dl>
                  <div><dt>Venue</dt><dd>{item.venue}</dd></div>
                  <div><dt>Logs</dt><dd>{count}</dd></div>
                </dl>
                <div className="card-actions">
                  <button className="ghost-button" onClick={() => setSelectedEventId(item.id)}>Use event</button>
                  <button className="ghost-button danger" onClick={() => deleteEvent(item.id)}>Delete</button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Attendance({ state, updateState, selectedEventId, setSelectedEventId, canClearRecords }) {
  const [query, setQuery] = useState('');
  const [scanMode, setScanMode] = useState('login');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannerStatus, setScannerStatus] = useState('Scan a student ID barcode or type the ID number manually.');
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef(null);
  const scannerTimerRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const event = state.events.find((item) => item.id === selectedEventId);
  const students = state.students.filter((student) =>
    [getStudentIdNo(student), getStudentName(student), student.college, student.course, getStudentYearLevel(student), student.sex, student.civilStatus].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => () => stopScanner(false), []);

  function getLog(studentId) {
    return state.logs.find((record) => record.eventId === selectedEventId && record.studentId === studentId);
  }

  function logIn(studentId) {
    if (!event) return;
    const existing = getLog(studentId);
    if (existing?.loginAt) return;

    if (existing) {
      updateState({
        logs: state.logs.map((record) =>
          record.id === existing.id ? { ...record, loginAt: new Date().toISOString() } : record
        ),
      });
      return;
    }

    updateState({
      logs: [{
        id: `LOG-${Date.now()}`,
        eventId: selectedEventId,
        studentId,
        loginAt: new Date().toISOString(),
        logoutAt: null,
      }, ...state.logs],
    });
  }

  function logOut(studentId) {
    const existing = getLog(studentId);
    if (!event || existing?.logoutAt) return;

    if (existing) {
      updateState({
        logs: state.logs.map((record) =>
          record.id === existing.id ? { ...record, logoutAt: new Date().toISOString() } : record
        ),
      });
      return;
    }

    updateState({
      logs: [{
        id: `LOG-${Date.now()}`,
        eventId: selectedEventId,
        studentId,
        loginAt: null,
        logoutAt: new Date().toISOString(),
      }, ...state.logs],
    });
  }

  function undoLogIn(studentId) {
    const existing = getLog(studentId);
    if (!existing?.loginAt) return;

    if (existing.logoutAt) {
      updateState({
        logs: state.logs.map((record) =>
          record.id === existing.id ? { ...record, loginAt: null } : record
        ),
      });
      return;
    }

    updateState({
      logs: state.logs.filter((record) => record.id !== existing.id),
    });
  }

  function undoLogOut(studentId) {
    const existing = getLog(studentId);
    if (!existing?.logoutAt) return;

    if (existing.loginAt) {
      updateState({
        logs: state.logs.map((record) =>
          record.id === existing.id ? { ...record, logoutAt: null } : record
        ),
      });
      return;
    }

    updateState({
      logs: state.logs.filter((record) => record.id !== existing.id),
    });
  }

  function findStudentByBarcode(code) {
    const normalizedCode = normalizeBarcode(code);
    return state.students.find((student) => normalizeBarcode(getStudentIdNo(student)) === normalizedCode);
  }

  function recordBarcodeAttendance(code) {
    const student = findStudentByBarcode(code);
    if (!student) {
      setScannerStatus(`No student found for ID No. ${code}.`);
      setQuery(code);
      return false;
    }

    if (scanMode === 'login') {
      logIn(student.id);
      setScannerStatus(`Logged in ${getStudentName(student)} using ID No. ${getStudentIdNo(student)}.`);
    } else {
      logOut(student.id);
      setScannerStatus(`Logged out ${getStudentName(student)} using ID No. ${getStudentIdNo(student)}.`);
    }

    setQuery(getStudentIdNo(student));
    return true;
  }

  function submitManualBarcode(eventTarget) {
    eventTarget.preventDefault();
    if (!manualBarcode.trim()) return;
    recordBarcodeAttendance(manualBarcode.trim());
    setManualBarcode('');
  }

  async function startScanner() {
    if (!event) {
      setScannerStatus('Select or create an event before scanning.');
      return;
    }

    if (!('BarcodeDetector' in window)) {
      setScannerStatus('Camera barcode scanning is not supported in this browser. Type the ID No. in the manual scanner field.');
      return;
    }

    try {
      stopScanner();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      scannerStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'],
      });
      setScannerActive(true);
      setScannerStatus('Scanner active. Point the camera at the barcode on the student ID.');

      scannerTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length) {
          const code = barcodes[0].rawValue;
          const recorded = recordBarcodeAttendance(code);
          if (recorded) {
            stopScanner();
          }
        }
      }, 700);
    } catch (error) {
      console.warn('Barcode scanner failed', error);
      setScannerStatus('Unable to open the camera. Check browser permissions or type the ID No. manually.');
      stopScanner();
    }
  }

  function stopScanner(updateUi = true) {
    if (scannerTimerRef.current) {
      window.clearInterval(scannerTimerRef.current);
      scannerTimerRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (updateUi) {
      setScannerActive(false);
    }
  }

  function clearAllAttendanceLogs() {
    const shouldClear = window.confirm('Clear all log in and log out records for all events? This cannot be undone.');
    if (!shouldClear) return;
    updateState({ logs: [] });
    setScannerStatus('All attendance log in and log out records were cleared by Admin.');
  }

  return (
    <div className="view-stack">
      <SectionHeader title="Log In / Log Out Attendance" subtitle="Select an event, then record each student's arrival and leaving time with automatic timestamps." />
      <section className="panel session-panel event-session-panel">
        <label>
          Event
          <select value={selectedEventId} onChange={(eventTarget) => setSelectedEventId(eventTarget.target.value)}>
            {state.events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>
          Search Student
          <input value={query} placeholder="ID no., name, college, course, year, sex, or civil status" onChange={(eventTarget) => setQuery(eventTarget.target.value)} />
        </label>
      </section>
      <section className="panel scanner-panel">
        <PanelTitle title="Barcode Scanner" action={scanMode === 'login' ? 'Log In mode' : 'Log Out mode'} />
        <div className="scanner-grid">
          <div className="scanner-box">
            <video ref={videoRef} className={scannerActive ? 'scanner-video active' : 'scanner-video'} muted playsInline />
            {!scannerActive && <div className="scanner-placeholder">Camera scanner</div>}
          </div>
          <div className="scanner-controls">
            <div className="mode-toggle" aria-label="Scanner mode">
              <button className={scanMode === 'login' ? 'mode-button active login-mode' : 'mode-button login-mode'} onClick={() => setScanMode('login')}>Log In</button>
              <button className={scanMode === 'logout' ? 'mode-button active logout-mode' : 'mode-button logout-mode'} onClick={() => setScanMode('logout')}>Log Out</button>
            </div>
            <div className="scanner-actions">
              <button className="primary-button" onClick={startScanner}>{scannerActive ? 'Restart scanner' : 'Start scanner'}</button>
              <button className="ghost-button" onClick={stopScanner} disabled={!scannerActive}>Stop scanner</button>
            </div>
            <form className="manual-scan-form" onSubmit={submitManualBarcode}>
              <input value={manualBarcode} placeholder="Type or scan ID No. here" onChange={(eventTarget) => setManualBarcode(eventTarget.target.value)} />
              <button className="primary-button" type="submit">Submit</button>
            </form>
            <p className="scanner-status">{scannerStatus}</p>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="attendance-panel-heading">
          <PanelTitle title={event?.title || 'No event selected'} action={`${students.length} students`} />
          {canClearRecords && (
            <button className="clear-records-button" onClick={clearAllAttendanceLogs} disabled={!state.logs.length}>
              Clear all records
            </button>
          )}
        </div>
        <div className="attendance-list">
          {students.map((student) => {
            const log = getLog(student.id);
            return (
              <article className="attendance-card" key={student.id}>
                <div className="student-log-info">
                  <strong>{getStudentName(student)}</strong>
                  <p>{getStudentIdNo(student)} - {getStudentYearLevel(student)} - {student.course || student.section || 'No course'}</p>
                  <div className="timestamp-line">
                    <span>Log in: {log?.loginAt ? formatDateTime(log.loginAt) : 'Not yet'}</span>
                    <span>Log out: {log?.logoutAt ? formatDateTime(log.logoutAt) : log?.loginAt ? 'Still inside' : 'Not yet'}</span>
                  </div>
                </div>
                <div className="status-buttons">
                  <div className="attendance-action">
                    <button className={log?.loginAt ? 'status-pill login active' : 'status-pill login'} disabled={!event || Boolean(log?.loginAt)} onClick={() => logIn(student.id)}>Log In</button>
                    <button className="undo-button login-undo" disabled={!log?.loginAt} aria-label={`Undo log in for ${getStudentName(student)}`} title="Undo log in" onClick={() => undoLogIn(student.id)}>X</button>
                  </div>
                  <div className="attendance-action">
                    <button className={log?.logoutAt ? 'status-pill logout active' : 'status-pill logout'} disabled={!event || Boolean(log?.logoutAt)} onClick={() => logOut(student.id)}>Log Out</button>
                    <button className="undo-button logout-undo" disabled={!log?.logoutAt} aria-label={`Undo log out for ${getStudentName(student)}`} title="Undo log out" onClick={() => undoLogOut(student.id)}>X</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Reports({ state, metrics, selectedEventId }) {
  const event = state.events.find((item) => item.id === selectedEventId);
  const records = state.logs
    .filter((record) => record.eventId === selectedEventId)
    .map((record) => ({
      ...record,
      student: state.students.find((student) => student.id === record.studentId),
    }))
    .filter((record) => record.student);

  function exportCsv() {
    const rows = [
      'Event,ID No.,First Name,Middle Name,Last Name,College,Course,Year Level,Sex,Civil Status,Log In,Log Out,Duration',
      ...records.map((record) => [
        event?.title,
        getStudentIdNo(record.student),
        record.student.firstName || '',
        record.student.middleName || '',
        record.student.lastName || '',
        record.student.college || '',
        record.student.course || '',
        getStudentYearLevel(record.student),
        record.student.sex || '',
        record.student.civilStatus || '',
        record.loginAt ? formatDateTime(record.loginAt) : 'Not recorded',
        record.logoutAt ? formatDateTime(record.logoutAt) : 'Still inside',
        getDuration(record.loginAt, record.logoutAt),
      ].map((value) => `"${value || ''}"`).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${event?.title || 'event'}-attendance.csv`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="view-stack">
      <SectionHeader title="Reports & Time Logs" subtitle="Review each student's log in timestamp, log out timestamp, and event attendance duration." />
      <section className="metric-grid">
        <Metric label="Attendance rate" value={`${metrics.attendanceRate}%`} tone="green" />
        <Metric label="Total logs" value={records.length} tone="blue" />
        <Metric label="Still inside" value={metrics.checkedInNow} tone="amber" />
        <Metric label="Missing log" value={metrics.notLogged} tone="red" />
      </section>
      <div className="content-grid reports-grid">
        <section className="panel">
          <PanelTitle title="Export Center" action="CSV ready" />
          <p className="muted">Export includes event name, student details, log in time, log out time, and duration.</p>
          <button className="primary-button" onClick={exportCsv} disabled={!records.length}>Export CSV</button>
        </section>
        <section className="panel table-panel">
          <PanelTitle title={event?.title || 'Event logs'} action={`${records.length} records`} />
          <div className="table-list">
            {records.map((record) => (
              <article className="table-card report-card" key={record.id}>
                <div>
                  <strong>{getStudentName(record.student)}</strong>
                  <p>{getStudentIdNo(record.student)} - {getStudentYearLevel(record.student)} - {record.student.course || record.student.section || 'No course'}</p>
                </div>
                <div className="report-times">
                  <span>In: {record.loginAt ? formatDateTime(record.loginAt) : 'Not recorded'}</span>
                  <span>Out: {record.logoutAt ? formatDateTime(record.logoutAt) : 'Still inside'}</span>
                  <strong>{getDuration(record.loginAt, record.logoutAt)}</strong>
                </div>
              </article>
            ))}
            {!records.length && <p className="muted">No attendance logs for this event yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function UserSettings({ state, updateState, authUser, setAuthUser }) {
  const blankForm = { name: '', username: '', password: '' };
  const supabaseStatus = getSupabaseConfigStatus();
  const [form, setForm] = useState(blankForm);
  const [adminForm, setAdminForm] = useState({
    name: state.adminAccount?.name || defaultAdminAccount.name,
    username: state.adminAccount?.username || defaultAdminAccount.username,
    password: state.adminAccount?.password || defaultAdminAccount.password,
  });
  const [message, setMessage] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  function saveAdmin(event) {
    event.preventDefault();
    const username = adminForm.username.trim();
    const password = adminForm.password.trim();
    const name = adminForm.name.trim() || 'System Admin';

    if (!username || !password) {
      setAdminMessage('Admin username and password are required.');
      return;
    }

    const usernameUsedByOfficer = state.officerAccounts.some((account) => account.username.toLowerCase() === username.toLowerCase());
    if (usernameUsedByOfficer) {
      setAdminMessage('That username is already used by a Student Officer.');
      return;
    }

    const nextAdmin = { username, password, name, role: 'Admin' };
    updateState({ adminAccount: nextAdmin });
    if (authUser?.role === 'Admin') {
      const nextSession = { name, username, role: 'Admin' };
      sessionStorage.setItem(authStorageKey, JSON.stringify(nextSession));
      setAuthUser(nextSession);
    }
    setAdminMessage('Admin account updated.');
  }

  function saveOfficer(event) {
    event.preventDefault();
    const username = form.username.trim();
    const password = form.password.trim();
    const name = form.name.trim() || 'Student Officer';

    if (!username || !password) {
      setMessage('Username and password are required.');
      return;
    }

    const adminUsername = (state.adminAccount?.username || defaultAdminAccount.username).toLowerCase();
    if (username.toLowerCase() === adminUsername) {
      setMessage('That username is reserved for the Admin account.');
      return;
    }

    const existing = state.officerAccounts.find((account) => account.username.toLowerCase() === username.toLowerCase());
    const nextAccount = {
      id: existing?.id || `OFF-${Date.now()}`,
      name,
      username,
      password,
      role: 'Student Officer',
    };

    updateState({
      officerAccounts: existing
        ? state.officerAccounts.map((account) => (account.id === existing.id ? nextAccount : account))
        : [nextAccount, ...state.officerAccounts],
    });
    setForm(blankForm);
    setMessage(existing ? 'Student Officer account updated.' : 'Student Officer account created.');
  }

  function editOfficer(account) {
    setForm({ name: account.name, username: account.username, password: account.password });
    setMessage('Editing selected Student Officer account.');
  }

  function deleteOfficer(id) {
    updateState({
      officerAccounts: state.officerAccounts.filter((account) => account.id !== id),
    });
    setMessage('Student Officer account deleted.');
  }

  return (
    <div className="view-stack">
      <SectionHeader title="User Settings" subtitle="Set up usernames and passwords for Student Officers. Admin keeps full access to the system." />
      <div className="content-grid settings-grid">
        <div className="settings-stack">
          <BackendStatus status={supabaseStatus} />
          <form className="panel form-panel" onSubmit={saveAdmin}>
            <PanelTitle title="Admin Account" action="Full access" />
            <input placeholder="Admin display name" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} />
            <input placeholder="Admin username" value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} />
            <input placeholder="Admin password" type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} />
            {adminMessage && <p className="settings-message">{adminMessage}</p>}
            <button className="primary-button" type="submit">Update admin</button>
          </form>
          <form className="panel form-panel" onSubmit={saveOfficer}>
            <PanelTitle title="Student Officer Account" action="Attendance access" />
            <input placeholder="Officer display name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            <input placeholder="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            {message && <p className="settings-message">{message}</p>}
            <div className="settings-actions">
              <button className="primary-button" type="submit">Save officer</button>
              <button className="ghost-button" type="button" onClick={() => { setForm(blankForm); setMessage(''); }}>Clear</button>
            </div>
          </form>
        </div>
        <section className="panel table-panel">
          <PanelTitle title="Student Officer Users" action={`${state.officerAccounts.length} account(s)`} />
          <div className="table-list">
            {state.officerAccounts.map((account) => (
              <article className="table-card" key={account.id}>
                <div>
                  <strong>{account.name}</strong>
                  <p>{account.username} - Student Officer</p>
                </div>
                <div className="card-actions">
                  <button className="ghost-button" onClick={() => editOfficer(account)}>Edit</button>
                  <button className="ghost-button danger" onClick={() => deleteOfficer(account.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BackendStatus({ status }) {
  return (
    <section className="panel backend-status-panel">
      <PanelTitle title="Supabase Backend" action={status.ready ? 'Ready' : 'Setup needed'} />
      <div className={status.ready ? 'backend-status ready' : 'backend-status pending'}>
        <span aria-hidden="true" />
        <div>
          <strong>{status.label}</strong>
          <p>{status.detail}</p>
        </div>
      </div>
      <div className="backend-checklist">
        <p>1. Create a Supabase project.</p>
        <p>2. Run `supabase/migrations/0001_initial_schema.sql` in Supabase SQL Editor or CLI.</p>
        <p>3. Add the values from `.env.example` to your local `.env` file.</p>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function PanelTitle({ title, action }) {
  return (
    <div className="panel-title">
      <h3>{title}</h3>
      <span>{action}</span>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <header className="section-header">
      <p className="eyebrow">Business Education Department</p>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}

function ProgressRow({ label, value, max }) {
  const rate = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <span style={{ width: `${rate}%` }} />
      </div>
      <strong>{rate}%</strong>
    </div>
  );
}

function DashboardChart({ title, data }) {
  return (
    <section className="panel dashboard-chart">
      <PanelTitle title={title} action={`${data.length} group(s)`} />
      <div className="chart-bars dashboard-bars">
        {data.length ? data.map((item) => (
          <div className="bar-row grouped-bar-row" key={item.label}>
            <span>{item.label}</span>
            <div className="bar-track">
              <span style={{ width: `${item.rate}%` }} />
            </div>
            <strong>{item.rate}%</strong>
            <small>{item.present}/{item.total}</small>
          </div>
        )) : <p className="muted">No student data available for this chart.</p>}
      </div>
    </section>
  );
}

function getMetrics(state, selectedEventId) {
  const eventLogs = getEventLogs(state.logs, selectedEventId);
  const loggedIn = eventLogs.filter((record) => record.loginAt).length;
  const loggedOut = eventLogs.filter((record) => record.logoutAt).length;
  const checkedInNow = eventLogs.filter((record) => record.loginAt && !record.logoutAt).length;
  const notLogged = Math.max(state.students.length - loggedIn, 0);
  const attendanceRate = state.students.length ? Math.round((loggedIn / state.students.length) * 100) : 0;

  return { loggedIn, loggedOut, checkedInNow, notLogged, attendanceRate };
}

function getDashboardGroups(state, selectedEventId) {
  return {
    course: getAttendanceGroups(state, selectedEventId, (student) => student.course || 'No course'),
    yearLevel: getAttendanceGroups(state, selectedEventId, (student) => getStudentYearLevel(student) || 'No year level'),
    sex: getAttendanceGroups(state, selectedEventId, (student) => student.sex || 'No sex'),
  };
}

function getAttendanceGroups(state, selectedEventId, getLabel) {
  const eventLogs = getEventLogs(state.logs, selectedEventId);
  const loggedInIds = new Set(eventLogs.filter((record) => record.loginAt).map((record) => record.studentId));
  const groups = new Map();

  state.students.forEach((student) => {
    const label = getLabel(student);
    const current = groups.get(label) || { label, total: 0, present: 0 };
    current.total += 1;
    if (loggedInIds.has(student.id)) {
      current.present += 1;
    }
    groups.set(label, current);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rate: group.total ? Math.round((group.present / group.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.present - a.present || a.label.localeCompare(b.label));
}

function getDashboardAnalysis(groupedCharts, metrics) {
  const strongestCourse = groupedCharts.course[0];
  const weakestCourse = [...groupedCharts.course].sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label))[0];
  const strongestYear = groupedCharts.yearLevel[0];
  const strongestSex = groupedCharts.sex[0];
  const analysis = [
    `Overall attendance for the selected event is ${metrics.attendanceRate}%, with ${metrics.loggedIn} of ${metrics.loggedIn + metrics.notLogged} student(s) logged in.`,
  ];

  if (strongestCourse) {
    analysis.push(`${strongestCourse.label} has the highest course attendance at ${strongestCourse.rate}% (${strongestCourse.present}/${strongestCourse.total}).`);
  }

  if (weakestCourse && weakestCourse.label !== strongestCourse?.label) {
    analysis.push(`${weakestCourse.label} needs the most follow-up among courses at ${weakestCourse.rate}% (${weakestCourse.present}/${weakestCourse.total}).`);
  }

  if (strongestYear) {
    analysis.push(`${strongestYear.label} is currently the strongest year-level group at ${strongestYear.rate}%.`);
  }

  if (strongestSex) {
    analysis.push(`By sex, ${strongestSex.label} has the highest attendance rate at ${strongestSex.rate}%.`);
  }

  return analysis;
}

function normalizeStudentRow(row) {
  return {
    firstName: readColumn(row, ['first name', 'firstname', 'given name']),
    middleName: readColumn(row, ['middle name', 'middlename', 'middle initial', 'mi']),
    lastName: readColumn(row, ['last name', 'lastname', 'surname', 'family name']),
    idNo: readColumn(row, ['id no', 'id no.', 'id number', 'student number', 'student no', 'student id']),
    college: readColumn(row, ['college']),
    course: readColumn(row, ['course', 'program']),
    yearLevel: readColumn(row, ['year level', 'year', 'level']) || '1st Year',
    sex: readColumn(row, ['sex', 'gender']),
    civilStatus: readColumn(row, ['civil status', 'civilstatus', 'status']),
  };
}

function getStudentIdNo(student) {
  return student.idNo || student.studentNo || '';
}

function getStudentName(student) {
  if (student.firstName || student.middleName || student.lastName) {
    return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
  }
  return student.name || 'Unnamed student';
}

function getStudentYearLevel(student) {
  return student.yearLevel || student.year || '';
}

function readColumn(row, names) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value).trim()]);
  const found = normalizedEntries.find(([key]) => names.includes(key));
  return found?.[1] || '';
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeBarcode(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getEventLogs(logs, eventId) {
  return logs.filter((record) => record.eventId === eventId);
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDuration(loginAt, logoutAt) {
  if (!loginAt || !logoutAt) return 'Open log';
  const minutes = Math.max(Math.round((new Date(logoutAt) - new Date(loginAt)) / 60000), 0);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} min`;
  return `${hours} hr ${mins} min`;
}

function iconFor(item) {
  return {
    Dashboard: 'DB',
    Students: 'ST',
    Events: 'EV',
    Attendance: 'IN',
    Reports: 'RP',
    Settings: 'US',
  }[item];
}

export default App;
