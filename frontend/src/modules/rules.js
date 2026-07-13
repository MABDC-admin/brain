export const DEFAULT_RULES = [
  {
    id: 'expiry-reminders',
    kind: 'auto-create-expiry-reminder',
    label: 'Expiry reminders',
    enabled: true,
  },
  {
    id: 'large-expense-tag',
    kind: 'tag-expense-over',
    label: 'Tag large expenses',
    enabled: true,
    amount: 1000,
    tag: 'High Value',
  },
  {
    id: 'pin-keyword-notes',
    kind: 'pin-note-keywords',
    label: 'Pin keyword notes',
    enabled: false,
    keywords: 'urgent, important',
  },
];

export function applyRules(item, rules = DEFAULT_RULES) {
  return rules.reduce((next, rule) => {
    if (!rule.enabled) return next;

    if (rule.kind === 'tag-expense-over' && item.type === 'expense') {
      const amount = Number(String(item.title || '').match(/^\d+(\.\d+)?/)?.[0] || 0);
      if (amount >= Number(rule.amount || 0)) return { ...next, tags: rule.tag || 'High Value' };
    }

    if (rule.kind === 'pin-note-keywords' && item.type === 'note') {
      const keywords = String(rule.keywords || '')
        .split(',')
        .map(keyword => keyword.trim().toLowerCase())
        .filter(Boolean);
      const haystack = `${item.title || ''} ${item.subtitle || ''} ${item.body || ''}`.toLowerCase();
      if (keywords.some(keyword => haystack.includes(keyword))) return { ...next, pinned: true };
    }

    return next;
  }, item);
}

export function getExpiryReminderDraft(item, rules = DEFAULT_RULES) {
  const enabled = rules.some(rule => rule.enabled && rule.kind === 'auto-create-expiry-reminder');
  const expiryText = item.expiry_date || item.expiryDate || item.subtitle?.match(/Expires\s+(.+)$/i)?.[1];
  if (!enabled || !expiryText) return null;

  return {
    type: 'reminder',
    title: `Renew: ${item.title}`,
    subtitle: `Reminder - ${expiryText}`,
    body: `Expiry reminder for ${item.title}`,
    workspace: item.workspace || 'Personal',
  };
}
