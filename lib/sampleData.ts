import type { ProjectData } from './types';
import { cascadeTaskDependencies, normalizeTask } from './tasks';

export function buildSampleData(): ProjectData {
  const tasks = cascadeTaskDependencies(
    [
      {
        id: 't1',
        title: 'Final floor plan sign-off',
        priority: 'High' as const,
        due: '2026-07-10',
        startDate: '2026-07-04',
        durationDays: 7,
        done: true,
        notes: 'Owners aligned on bar/smoker layout',
        category: 'Design',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: null
      },
      {
        id: 't2',
        title: 'Pull building & health permits',
        priority: 'High' as const,
        due: '2026-07-20',
        startDate: '2026-07-11',
        durationDays: 10,
        done: false,
        notes: '',
        category: 'Permits',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't1'
      },
      {
        id: 't3',
        title: 'Order custom smoker / pit package',
        priority: 'High' as const,
        due: '2026-07-15',
        startDate: '2026-07-11',
        durationDays: 5,
        done: false,
        notes: 'Lead time critical',
        category: 'Equipment',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't1'
      },
      {
        id: 't4',
        title: 'HVAC & make-up air for smoke',
        priority: 'High' as const,
        due: '2026-07-25',
        durationDays: 7,
        done: false,
        notes: '',
        category: 'MEP',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't2'
      },
      {
        id: 't5',
        title: 'Bar millwork shop drawings',
        priority: 'Medium' as const,
        due: '2026-07-28',
        durationDays: 7,
        done: false,
        notes: '',
        category: 'Design',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't1'
      },
      {
        id: 't6',
        title: 'Select finishes',
        priority: 'Medium' as const,
        due: '2026-07-22',
        durationDays: 5,
        done: false,
        notes: '',
        category: 'Design',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: null
      },
      {
        id: 't7',
        title: 'Utility disconnect / demo plan',
        priority: 'High' as const,
        due: '2026-07-30',
        durationDays: 5,
        done: false,
        notes: 'Ready for keys day',
        category: 'Construction',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't2'
      },
      {
        id: 't8',
        title: 'Signage & exterior branding',
        priority: 'Medium' as const,
        due: '2026-08-20',
        durationDays: 10,
        done: false,
        notes: '',
        category: 'Branding',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: null
      },
      {
        id: 't9',
        title: 'Staff hiring plan',
        priority: 'Medium' as const,
        due: '2026-08-15',
        durationDays: 14,
        done: false,
        notes: '',
        category: 'Ops',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: null
      },
      {
        id: 't10',
        title: 'POS & reservations setup',
        priority: 'Low' as const,
        due: '2026-08-25',
        durationDays: 7,
        done: false,
        notes: '',
        category: 'Ops',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't9'
      },
      {
        id: 't11',
        title: 'Health pre-inspection walk',
        priority: 'High' as const,
        due: '2026-09-05',
        durationDays: 3,
        done: false,
        notes: '',
        category: 'Compliance',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't4'
      },
      {
        id: 't12',
        title: 'Opening week inventory order',
        priority: 'Medium' as const,
        due: '2026-09-08',
        durationDays: 5,
        done: false,
        notes: '',
        category: 'Ops',
        assigneeId: null,
        assigneeName: null,
        dependsOnId: 't10'
      }
    ].map(normalizeTask)
  );

  return {
    version: 3,
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
    tasks,
    mediaEvents: [
      {
        id: 'me1',
        title: 'Teaser: Something’s smoking…',
        date: '2026-07-15',
        type: 'post',
        channel: 'Instagram',
        notes: 'Mood teaser — no location reveal',
        status: 'scheduled',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me2',
        title: 'Partnership announcement',
        date: '2026-07-22',
        type: 'announcement',
        channel: 'All',
        notes: 'Steam Distillery × Diamond House BBQ',
        status: 'draft',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me3',
        title: 'Behind the build — Keys day',
        date: '2026-08-01',
        type: 'video',
        channel: 'Reels',
        notes: 'Keys handoff + first walkthrough',
        status: 'scheduled',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me4',
        title: 'Weekly build diary #1',
        date: '2026-08-08',
        type: 'post',
        channel: 'Instagram',
        notes: '',
        status: 'draft',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me5',
        title: 'Weekly build diary #2',
        date: '2026-08-15',
        type: 'post',
        channel: 'Instagram',
        notes: '',
        status: 'draft',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me6',
        title: 'Founder story',
        date: '2026-08-18',
        type: 'video',
        channel: 'YouTube',
        notes: 'Interview cut',
        status: 'in-review',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me7',
        title: 'Menu teaser carousel',
        date: '2026-08-25',
        type: 'image',
        channel: 'Instagram',
        notes: 'Plate + cocktail heroes',
        status: 'draft',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me8',
        title: 'Soft opening invite',
        date: '2026-09-01',
        type: 'announcement',
        channel: 'Email + Social',
        notes: '',
        status: 'scheduled',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me9',
        title: 'Grand opening promo',
        date: '2026-09-10',
        type: 'event',
        channel: 'All',
        notes: '',
        status: 'draft',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'me10',
        title: 'Opening day live',
        date: '2026-09-15',
        type: 'video',
        channel: 'Stories',
        notes: '',
        status: 'scheduled',
        fileUrl: null,
        assigneeId: null,
        assigneeName: null
      }
    ],
    mediaAssets: [],
    approvals: [
      {
        id: 'a1',
        title: 'Final floor plan & seating',
        owner: 'Owners',
        status: 'approved',
        notes: '',
        updatedAt: '2026-07-01',
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'a2',
        title: 'Budget contingency (+10%)',
        owner: 'Owners',
        status: 'pending',
        notes: '',
        updatedAt: '',
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'a3',
        title: 'Co-branded logo lockup',
        owner: 'Marketing',
        status: 'pending',
        notes: '',
        updatedAt: '',
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'a4',
        title: 'Opening date public announcement',
        owner: 'Owners',
        status: 'pending',
        notes: '',
        updatedAt: '',
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'a5',
        title: 'Menu pricing tier',
        owner: 'Ops',
        status: 'review',
        notes: '',
        updatedAt: '',
        assigneeId: null,
        assigneeName: null
      },
      {
        id: 'a6',
        title: 'Millwork contractor',
        owner: 'GC',
        status: 'approved',
        notes: '',
        updatedAt: '2026-07-05',
        assigneeId: null,
        assigneeName: null
      }
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
    ],
    reviewDocuments: [
      {
        id: 'rd1',
        title: 'Space lease — main suite',
        description:
          'Primary lease for the Steam × Diamond suite. Confirm term, CAM, and TI allowance before signing.',
        status: 'Under Review',
        version: 2,
        fileName: null,
        fileUrl: null,
        pathname: null,
        mime: 'application/pdf',
        size: null,
        redlineFileName: null,
        redlineFileUrl: null,
        redlinePathname: null,
        redlineMime: null,
        redlineSize: null,
        comments: [
          {
            id: 'rdc1',
            parentId: null,
            authorId: 'sample',
            authorName: 'Ops Lead',
            body: 'Please confirm the landlord TI language on page 12 matches the LOI.',
            createdAt: '2026-07-08T14:30:00.000Z'
          },
          {
            id: 'rdc2',
            parentId: 'rdc1',
            authorId: 'sample',
            authorName: 'Counsel',
            body: 'Comparing against LOI now — will attach redline if needed.',
            createdAt: '2026-07-08T16:05:00.000Z'
          }
        ],
        createdAt: '2026-07-05T10:00:00.000Z',
        updatedAt: '2026-07-08T16:05:00.000Z',
        uploadedById: null,
        uploadedByName: 'Owners'
      },
      {
        id: 'rd2',
        title: 'GC construction contract',
        description: 'Buildout agreement and schedule of values for demo through commissioning.',
        status: 'Draft',
        version: 1,
        fileName: null,
        fileUrl: null,
        pathname: null,
        mime: 'application/pdf',
        size: null,
        redlineFileName: null,
        redlineFileUrl: null,
        redlinePathname: null,
        redlineMime: null,
        redlineSize: null,
        comments: [],
        createdAt: '2026-07-10T09:00:00.000Z',
        updatedAt: '2026-07-10T09:00:00.000Z',
        uploadedById: null,
        uploadedByName: null
      },
      {
        id: 'rd3',
        title: 'Health department plan review letter',
        description: 'Permit correspondence and conditions of approval.',
        status: 'Approved',
        version: 1,
        fileName: null,
        fileUrl: null,
        pathname: null,
        mime: 'application/pdf',
        size: null,
        redlineFileName: null,
        redlineFileUrl: null,
        redlinePathname: null,
        redlineMime: null,
        redlineSize: null,
        comments: [
          {
            id: 'rdc3',
            parentId: null,
            authorId: 'sample',
            authorName: 'GC',
            body: 'Conditions noted; hood make-up air addressed in MEP package.',
            createdAt: '2026-07-06T11:20:00.000Z'
          }
        ],
        createdAt: '2026-07-04T12:00:00.000Z',
        updatedAt: '2026-07-06T11:20:00.000Z',
        uploadedById: null,
        uploadedByName: 'Permits'
      }
    ]
  };
}
