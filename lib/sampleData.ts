import type { ProjectData } from './types';

export function buildSampleData(): ProjectData {
  return {
    version: 1,
    projectName: 'Steam Distillery × Diamond House BBQ',
    keyDates: [
      { id: 'kd_keys', label: 'Keys Received', date: '2026-08-01' },
      { id: 'kd_open', label: 'Projected Opening', date: '2026-09-15' },
      { id: 'kd_soft', label: 'Soft Opening / Friends & Family', date: '2026-09-08' },
      { id: 'kd_press', label: 'Press Preview Day', date: '2026-09-12' }
    ],
    phases: [
      { id: 'ph1', name: 'Design & Permits', startOffset: -90, endOffset: -30, type: 'phase' },
      { id: 'ph2', name: 'Demo & Rough-In', startOffset: 0, endOffset: 14, type: 'phase' },
      { id: 'ph3', name: 'Buildout & MEP', startOffset: 10, endOffset: 35, type: 'phase' },
      { id: 'ph4', name: 'Finishes & FF&E', startOffset: 28, endOffset: 42, type: 'phase' },
      { id: 'ph5', name: 'Commissioning', startOffset: 38, endOffset: 45, type: 'phase' },
      { id: 'ms1', name: 'Keys', startOffset: 0, endOffset: 0, type: 'milestone' },
      { id: 'ms2', name: 'Inspections', startOffset: 36, endOffset: 36, type: 'milestone' },
      { id: 'ms3', name: 'Opening', startOffset: 45, endOffset: 45, type: 'milestone' }
    ],
    tasks: [
      { id: 't1', title: 'Final floor plan sign-off', priority: 'High', due: '2026-07-10', done: true, notes: 'Owners aligned on bar/smoker layout', category: 'Design' },
      { id: 't2', title: 'Pull building & health permits', priority: 'High', due: '2026-07-20', done: false, notes: '', category: 'Permits' },
      { id: 't3', title: 'Order custom smoker / pit package', priority: 'High', due: '2026-07-15', done: false, notes: 'Lead time critical', category: 'Equipment' },
      { id: 't4', title: 'HVAC & make-up air for smoke', priority: 'High', due: '2026-07-25', done: false, notes: '', category: 'MEP' },
      { id: 't5', title: 'Bar millwork shop drawings', priority: 'Medium', due: '2026-07-28', done: false, notes: '', category: 'Design' },
      { id: 't6', title: 'Select finishes', priority: 'Medium', due: '2026-07-22', done: false, notes: '', category: 'Design' },
      { id: 't7', title: 'Utility disconnect / demo plan', priority: 'High', due: '2026-07-30', done: false, notes: 'Ready for keys day', category: 'Construction' },
      { id: 't8', title: 'Signage & exterior branding', priority: 'Medium', due: '2026-08-20', done: false, notes: '', category: 'Branding' },
      { id: 't9', title: 'Staff hiring plan', priority: 'Medium', due: '2026-08-15', done: false, notes: '', category: 'Ops' },
      { id: 't10', title: 'POS & reservations setup', priority: 'Low', due: '2026-08-25', done: false, notes: '', category: 'Ops' },
      { id: 't11', title: 'Health pre-inspection walk', priority: 'High', due: '2026-09-05', done: false, notes: '', category: 'Compliance' },
      { id: 't12', title: 'Opening week inventory order', priority: 'Medium', due: '2026-09-08', done: false, notes: '', category: 'Ops' }
    ],
    mediaEvents: [
      { id: 'me1', title: 'Teaser: Something’s smoking…', date: '2026-07-15', type: 'post', channel: 'Instagram', notes: '' },
      { id: 'me2', title: 'Partnership announcement', date: '2026-07-22', type: 'announcement', channel: 'All', notes: '' },
      { id: 'me3', title: 'Behind the build — Keys day', date: '2026-08-01', type: 'video', channel: 'Reels', notes: '' },
      { id: 'me4', title: 'Weekly build diary #1', date: '2026-08-08', type: 'post', channel: 'Instagram', notes: '' },
      { id: 'me5', title: 'Weekly build diary #2', date: '2026-08-15', type: 'post', channel: 'Instagram', notes: '' },
      { id: 'me6', title: 'Founder story', date: '2026-08-18', type: 'video', channel: 'YouTube', notes: '' },
      { id: 'me7', title: 'Menu teaser carousel', date: '2026-08-25', type: 'post', channel: 'Instagram', notes: '' },
      { id: 'me8', title: 'Soft opening invite', date: '2026-09-01', type: 'announcement', channel: 'Email + Social', notes: '' },
      { id: 'me9', title: 'Grand opening promo', date: '2026-09-10', type: 'event', channel: 'All', notes: '' },
      { id: 'me10', title: 'Opening day live', date: '2026-09-15', type: 'video', channel: 'Stories', notes: '' }
    ],
    mediaAssets: [],
    approvals: [
      { id: 'a1', title: 'Final floor plan & seating', owner: 'Owners', status: 'approved', notes: '', updatedAt: '2026-07-01' },
      { id: 'a2', title: 'Budget contingency (+10%)', owner: 'Owners', status: 'pending', notes: '', updatedAt: '' },
      { id: 'a3', title: 'Co-branded logo lockup', owner: 'Marketing', status: 'pending', notes: '', updatedAt: '' },
      { id: 'a4', title: 'Opening date public announcement', owner: 'Owners', status: 'pending', notes: '', updatedAt: '' },
      { id: 'a5', title: 'Menu pricing tier', owner: 'Ops', status: 'review', notes: '', updatedAt: '' },
      { id: 'a6', title: 'Millwork contractor', owner: 'GC', status: 'approved', notes: '', updatedAt: '2026-07-05' }
    ],
    filming: {
      days: [
        { id: 'fd1', date: '2026-08-01', title: 'Keys Day Capture', location: 'Site entrance', notes: '' },
        { id: 'fd2', date: '2026-08-12', title: 'Demo / rough-in', location: 'Interior', notes: '' },
        { id: 'fd3', date: '2026-08-22', title: 'Pit install + first fire', location: 'Kitchen', notes: '' },
        { id: 'fd4', date: '2026-09-05', title: 'Beauty pass', location: 'Bar & dining', notes: '' },
        { id: 'fd5', date: '2026-09-15', title: 'Opening day', location: 'Full venue', notes: '' }
      ],
      shots: [
        { id: 'sh1', dayId: 'fd1', shot: 'Wide: facade context', status: 'planned' },
        { id: 'sh2', dayId: 'fd1', shot: 'Close: keys in hand', status: 'planned' },
        { id: 'sh3', dayId: 'fd1', shot: 'POV walkthrough', status: 'planned' },
        { id: 'sh4', dayId: 'fd3', shot: 'First smoke plume', status: 'planned' },
        { id: 'sh5', dayId: 'fd4', shot: 'Bar beauty', status: 'planned' },
        { id: 'sh6', dayId: 'fd4', shot: 'Plate hero', status: 'planned' },
        { id: 'sh7', dayId: 'fd5', shot: 'Ribbon cut', status: 'planned' },
        { id: 'sh8', dayId: 'fd5', shot: 'Guest reactions', status: 'planned' }
      ]
    },
    timelineNotes: [
      { id: 'tn1', date: '2026-07-01', title: 'Partnership kickoff', body: 'Steam Distillery and Diamond House BBQ align on concept and timeline.' },
      { id: 'tn2', date: '2026-08-01', title: 'Keys received', body: 'Site access begins.' },
      { id: 'tn3', date: '2026-09-08', title: 'Soft opening target', body: 'Friends & family service.' },
      { id: 'tn4', date: '2026-09-15', title: 'Projected public opening', body: 'Grand opening media blitz.' }
    ]
  };
}
