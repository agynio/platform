import { useState } from 'react';
import RemindersScreen, { Reminder, ReminderStatus } from '../screens/RemindersScreen';

// Generate sample reminders
const generateSampleReminders = (): Reminder[] => {
  const reminders: Reminder[] = [];
  const now = Date.now();
  
  const notes = [
    'Follow up on the API integration task',
    'Review pull request #234',
    'Schedule team meeting for Q1 planning to discuss upcoming initiatives, resource allocation, and key deliverables for the next quarter',
    'Update documentation for new features',
    'Check system performance metrics',
    'Respond to customer feedback on feature X',
    'Prepare presentation for stakeholder meeting',
    'Review and merge pending PRs',
    'Update dependencies to latest versions',
    'Run security audit on authentication flow',
    'Optimize database queries for reports',
    'Test new deployment pipeline',
    'Archive old projects from repository',
    'Update CI/CD configuration',
    'Review code quality metrics',
    'Schedule 1-on-1 with team members',
    'Prepare sprint retrospective notes',
    'Update project roadmap',
    'Review and respond to GitHub issues',
    'Test mobile responsiveness',
    'Backup database before migration',
    'Review accessibility compliance',
    'Update API documentation',
    'Analyze user analytics data',
    'Plan infrastructure upgrades',
    'Review security patches',
    'Update monitoring dashboards',
    'Conduct performance testing',
    'Review third-party integrations',
    'Update changelog for release',
  ];

  const statuses: ReminderStatus[] = ['scheduled', 'executed', 'cancelled'];

  // Generate 30 reminders
  for (let i = 0; i < 30; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const daysOffset = status === 'scheduled' 
      ? Math.floor(Math.random() * 14) - 7 // -7 to +7 days
      : -(Math.floor(Math.random() * 30) + 1); // Past dates for executed/cancelled
    
    const scheduledAt = new Date(now + daysOffset * 24 * 60 * 60 * 1000);
    
    const reminder: Reminder = {
      id: `reminder-${i}`,
      note: notes[i % notes.length],
      scheduledAt: scheduledAt.toISOString(),
      status,
      threadId: `thread-${Math.floor(Math.random() * 1000)}`,
    };

    // Add run ID for executed reminders
    if (status === 'executed') {
      reminder.runId = `run-${Math.floor(Math.random() * 1000)}`;
      reminder.executedAt = new Date(scheduledAt.getTime() + Math.random() * 3600000).toISOString();
    }

    reminders.push(reminder);
  }

  // Sort by scheduled time (newest first)
  return reminders.sort((a, b) => 
    new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
};

interface RemindersScreenShowcaseProps {
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function RemindersScreenShowcase({ onBack, selectedMenuItem, onMenuItemSelect }: RemindersScreenShowcaseProps) {
  const [reminders] = useState<Reminder[]>(generateSampleReminders());

  return (
    <RemindersScreen
      reminders={reminders}
      onViewThread={(threadId) => {
        console.log('View thread:', threadId);
        alert(`Viewing thread: ${threadId}`);
      }}
      onViewRun={(runId) => {
        console.log('View run:', runId);
        alert(`Viewing run: ${runId}`);
      }}
      onDeleteReminder={(reminderId) => {
        console.log('Delete reminder:', reminderId);
        alert(`Deleting reminder: ${reminderId}`);
      }}
      onBack={onBack}
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={onMenuItemSelect}
    />
  );
}
