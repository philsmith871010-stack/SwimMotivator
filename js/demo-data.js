/* SwimMotivator — Demo training data (delete this file when done testing) */

(function injectDemoData() {
  const STORAGE_KEY = 'swimMotivator_training';
  const GOALS_KEY = 'swimMotivator_goals';

  // Only inject if no sessions exist yet
  if (localStorage.getItem(STORAGE_KEY)) return;

  const today = new Date();
  function dayOffset(d) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().split('T')[0];
  }

  const sessions = [
    // ── Week 1 (two weeks ago) ──────────────────────────
    {
      id: 'demo_01', date: dayOffset(-13), pool: 25, duration: 75, feeling: 3,
      notes: 'First session back after half term. Felt a bit sluggish.',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 8, distance: 50, stroke: 'free', intensity: 'moderate', type: 'main', interval: '1:10' },
        { reps: 4, distance: 100, stroke: 'im', intensity: 'hard', type: 'main', interval: '2:30' },
        { reps: 6, distance: 50, stroke: 'kick', intensity: 'moderate', type: '', interval: '1:15' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_02', date: dayOffset(-12), pool: 25, duration: 60, feeling: 4,
      notes: 'Worked on backstroke turns with coach Sarah.',
      sets: [
        { reps: 1, distance: 200, stroke: 'free', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 1, distance: 200, stroke: 'back', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 6, distance: 100, stroke: 'back', intensity: 'hard', type: 'main', interval: '2:00' },
        { reps: 8, distance: 25, stroke: 'back', intensity: 'sprint', type: 'main', interval: '1:00' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_03', date: dayOffset(-11), pool: 50, duration: 90, feeling: 3,
      notes: 'Long course session at Barnet Copthall. 50m pool is so much harder!',
      sets: [
        { reps: 1, distance: 400, stroke: 'free', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 4, distance: 200, stroke: 'free', intensity: 'moderate', type: 'main', interval: '3:30' },
        { reps: 8, distance: 100, stroke: 'free', intensity: 'hard', type: 'main', interval: '1:50' },
        { reps: 4, distance: 50, stroke: 'fly', intensity: 'sprint', type: 'main', interval: '1:30' },
        { reps: 6, distance: 50, stroke: 'kick', intensity: 'moderate', type: '', interval: '1:20' },
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_04', date: dayOffset(-9), pool: 25, duration: 60, feeling: 5,
      notes: 'Best session ever! Hit a new best in the 100 free set.',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 3, distance: 100, stroke: 'free', intensity: 'hard', type: 'main', interval: '1:45' },
        { reps: 3, distance: 100, stroke: 'breast', intensity: 'hard', type: 'main', interval: '2:15' },
        { reps: 3, distance: 100, stroke: 'back', intensity: 'hard', type: 'main', interval: '2:00' },
        { reps: 8, distance: 25, stroke: 'fly', intensity: 'sprint', type: 'main', interval: '0:50' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    // ── Week 2 (last week) ──────────────────────────────
    {
      id: 'demo_05', date: dayOffset(-7), pool: 25, duration: 60, feeling: 3,
      notes: 'Monday morning session. Tired from school.',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 10, distance: 100, stroke: 'free', intensity: 'moderate', type: 'main', interval: '1:50' },
        { reps: 4, distance: 50, stroke: 'kick', intensity: 'hard', type: '', interval: '1:10' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_06', date: dayOffset(-6), pool: 25, duration: 75, feeling: 4,
      notes: 'IM focus today. 200 IM is getting better!',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 4, distance: 50, stroke: 'fly', intensity: 'moderate', type: 'main', interval: '1:15' },
        { reps: 4, distance: 50, stroke: 'back', intensity: 'moderate', type: 'main', interval: '1:10' },
        { reps: 4, distance: 50, stroke: 'breast', intensity: 'moderate', type: 'main', interval: '1:20' },
        { reps: 4, distance: 50, stroke: 'free', intensity: 'moderate', type: 'main', interval: '1:00' },
        { reps: 4, distance: 200, stroke: 'im', intensity: 'hard', type: 'main', interval: '4:00' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_07', date: dayOffset(-5), pool: 25, duration: 60, feeling: 2,
      notes: 'Had a cold. Probably should have skipped but wanted to keep the streak going.',
      sets: [
        { reps: 1, distance: 400, stroke: 'free', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 6, distance: 100, stroke: 'free', intensity: 'moderate', type: 'main', interval: '2:00' },
        { reps: 4, distance: 100, stroke: 'pull', intensity: 'easy', type: '', interval: '2:10' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_08', date: dayOffset(-3), pool: 25, duration: 90, feeling: 4,
      notes: 'Saturday comp prep. Coach said my turns are much better now.',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 1, distance: 400, stroke: 'pull', intensity: 'moderate', type: 'warmup', interval: '' },
        { reps: 8, distance: 100, stroke: 'free', intensity: 'hard', type: 'main', interval: '1:40' },
        { reps: 6, distance: 100, stroke: 'breast', intensity: 'hard', type: 'main', interval: '2:10' },
        { reps: 8, distance: 50, stroke: 'fly', intensity: 'sprint', type: 'main', interval: '1:10' },
        { reps: 6, distance: 50, stroke: 'kick', intensity: 'hard', type: '', interval: '1:05' },
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    // ── This week ────────────────────────────────────────
    {
      id: 'demo_09', date: dayOffset(-2), pool: 25, duration: 60, feeling: 4,
      notes: 'Solid Monday. Focused on stroke count for freestyle.',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 8, distance: 100, stroke: 'free', intensity: 'hard', type: 'main', interval: '1:45' },
        { reps: 4, distance: 100, stroke: 'back', intensity: 'moderate', type: 'main', interval: '2:00' },
        { reps: 6, distance: 50, stroke: 'kick', intensity: 'moderate', type: '', interval: '1:10' },
        { reps: 1, distance: 200, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
    {
      id: 'demo_10', date: dayOffset(-1), pool: 25, duration: 75, feeling: 5,
      notes: 'Sprint day! Went under 35 seconds for 50 free for the first time!',
      sets: [
        { reps: 1, distance: 400, stroke: 'choice', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 4, distance: 50, stroke: 'free', intensity: 'easy', type: 'warmup', interval: '' },
        { reps: 12, distance: 50, stroke: 'free', intensity: 'sprint', type: 'main', interval: '1:30' },
        { reps: 8, distance: 25, stroke: 'fly', intensity: 'sprint', type: 'main', interval: '0:45' },
        { reps: 4, distance: 100, stroke: 'im', intensity: 'moderate', type: 'main', interval: '2:30' },
        { reps: 1, distance: 300, stroke: 'choice', intensity: 'easy', type: 'cooldown', interval: '' },
      ],
    },
  ];

  // Calculate totalDistance for each session
  sessions.forEach(s => {
    s.totalDistance = s.sets.reduce((sum, set) => sum + set.reps * set.distance, 0);
    s.savedAt = new Date(s.date + 'T18:00:00').toISOString();
  });

  // Goals
  const goals = [
    {
      id: 'goal_01', type: 'pb', target: '1:05.00', event: '100 Freestyle',
      deadline: dayOffset(60), createdAt: dayOffset(-14), completed: false,
    },
    {
      id: 'goal_02', type: 'pb', target: '35.00', event: '50 Freestyle',
      deadline: dayOffset(30), createdAt: dayOffset(-14), completed: false,
    },
    {
      id: 'goal_03', type: 'distance', target: '8000',
      deadline: dayOffset(90), createdAt: dayOffset(-14), completed: false,
    },
    {
      id: 'goal_04', type: 'sessions', target: '4',
      deadline: dayOffset(90), createdAt: dayOffset(-14), completed: false,
    },
    {
      id: 'goal_05', type: 'custom', target: 'Learn butterfly tumble turns',
      deadline: dayOffset(45), createdAt: dayOffset(-14), completed: false,
    },
    {
      id: 'goal_06', type: 'pb', target: '2:45.00', event: '200 IM',
      deadline: dayOffset(90), createdAt: dayOffset(-10), completed: false,
    },
  ];

  // Events
  const EVENTS_KEY = 'swimMotivator_events';
  if (!localStorage.getItem(EVENTS_KEY)) {
    const events = [
      {
        id: 'event_01', name: 'Herts County Championships', date: dayOffset(18),
        venue: 'Hatfield Swim Centre',
        entries: ['100 Free', '50 Back', '200 IM'],
        notes: 'Must hit QTs! Focus on 100 Free PB.',
        createdAt: dayOffset(-7),
      },
      {
        id: 'event_02', name: 'Club Championship Gala', date: dayOffset(5),
        venue: 'Westminster Lodge, St Albans',
        entries: ['50 Free', '100 Free', '50 Breast', '200 IM'],
        notes: 'Aiming for gold in 50 free!',
        createdAt: dayOffset(-10),
      },
      {
        id: 'event_03', name: 'East Region Spring Open', date: dayOffset(45),
        venue: 'Luton SC',
        entries: ['100 Free', '200 Free'],
        notes: 'Good chance for regional PBs.',
        createdAt: dayOffset(-5),
      },
      {
        id: 'event_04', name: 'CoSA Winter Gala', date: dayOffset(-21),
        venue: 'Westminster Lodge, St Albans',
        entries: ['50 Free', '100 Back', '200 IM'],
        notes: 'Got a PB in 50 free!',
        createdAt: dayOffset(-30),
      },
    ];
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  console.log('SwimMotivator: Demo training data loaded (10 sessions, 6 goals, 4 events)');
})();
