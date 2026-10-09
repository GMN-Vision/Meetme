const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

async function screen(t, view, respond = () => new Response('{}')) {
  const posts = [];
  const dashboard = {
    courses: [{ _id: 'course', title: 'Photography', enrolledStudents: [{ email: 'existing@example.com' }] }],
    assignments: [], sessions: [], upcomingClasses: [], pendingGrading: [], submissions: [], recentRecordings: [], submissionsByAssignment: {},
  };
  t.mock.method(global, 'fetch', async (url, options) => {
    if (options?.method === 'POST') { posts.push({ url, body: JSON.parse(options.body) }); return respond(); }
    return new Response(JSON.stringify(url.includes('dashboard') ? { dashboard } : { meetings: [] }));
  });
  const wrapper = ({ children }) => React.createElement('div', null, children);
  const { InstructorLmsDashboard } = load('components/lms/InstructorLmsDashboard.tsx', {
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams('courseId=course') },
    '@/components/FileShare': () => null,
    '@/components/ui/glow-card': { GlowCard: wrapper },
    '@/components/ui/gradient-border-button': { GradientBorderButton: wrapper },
    './LmsShell': { LmsShell: wrapper }, './AIMeetingNotesPanel': { AIMeetingNotesPanel: () => null },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(InstructorLmsDashboard, { view })); });
  t.after(() => act(() => tree.unmount()));
  return {
    tree, posts,
    change: async (id, value) => act(async () => tree.root.findByProps({ id }).props.onChange({ target: { value } })),
    submit: async name => act(async () => tree.root.findAllByType('form').find(form => form.props.onSubmit.name === name).props.onSubmit({ preventDefault() {} })),
  };
}

test('adding students normalizes pasted addresses and skips duplicates and current students', async t => {
  const ui = await screen(t, 'students');
  await ui.change('student-emails', 'Alex@Example.com; alex@example.com\nexisting@example.com sam@example.com');
  await ui.submit('handleEnrollStudents');
  assert.deepEqual(ui.posts, [{ url: '/api/lms/courses/course/enroll', body: { students: [{ email: 'alex@example.com' }, { email: 'sam@example.com' }] } }]);
  assert.equal(ui.tree.root.findByProps({ id: 'student-emails' }).props.value, '');
});

test('invalid emails stay editable and do not send an enrollment request', async t => {
  const ui = await screen(t, 'students');
  await ui.change('student-emails', 'not-an-email');
  await ui.submit('handleEnrollStudents');
  assert.equal(ui.posts.length, 0);
  assert.equal(ui.tree.root.findByProps({ role: 'alert' }).children[0].includes('Check the email'), true);
});

test('scheduling needs no pre-created room and sends local date/time as an ISO instant', async t => {
  const ui = await screen(t, 'schedule');
  await ui.change('class-title', 'Camera basics');
  await ui.change('class-time', '2099-06-12T15:30');
  await ui.submit('handleSessionSubmit');
  assert.deepEqual(ui.posts[0].body, { meetingTitle: 'Camera basics', notes: '', startsAt: new Date('2099-06-12T15:30').toISOString() });
  assert.equal(ui.tree.root.findByProps({ id: 'class-title' }).props.value, '');
});

test('past class times are rejected; network failures retain inputs and allow retry', async t => {
  const ui = await screen(t, 'schedule', () => { throw Error('Network unavailable'); });
  await ui.change('class-title', 'Camera basics');
  await ui.change('class-time', '2000-01-01T10:00');
  await ui.submit('handleSessionSubmit');
  assert.equal(ui.posts.length, 0);
  await ui.change('class-time', '2099-06-12T15:30');
  await ui.submit('handleSessionSubmit');
  assert.equal(ui.tree.root.findByProps({ id: 'class-title' }).props.value, 'Camera basics');
  assert.equal(ui.tree.root.findByType('fieldset').props.disabled, false);
  assert.equal(ui.tree.root.findByProps({ role: 'alert' }).children[0], 'Network unavailable');
});
