const queueKey = 'business-ed-attendance-sync-queue';

export function getPendingSyncItems() {
  try {
    return JSON.parse(localStorage.getItem(queueKey) || '[]');
  } catch (error) {
    console.warn('Unable to read sync queue', error);
    return [];
  }
}

export function enqueueSyncItem(item) {
  const nextItem = {
    id: item.id || `sync-${Date.now()}`,
    operation: item.operation,
    table: item.table,
    payload: item.payload,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(queueKey, JSON.stringify([nextItem, ...getPendingSyncItems()]));
  return nextItem;
}

export function clearSyncedItems() {
  const pending = getPendingSyncItems().filter((item) => item.status !== 'synced');
  localStorage.setItem(queueKey, JSON.stringify(pending));
  return pending;
}

