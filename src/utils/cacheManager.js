// Cache management utility for the dating app
export const clearAllCache = () => {
  // Clear all cached data when user logs out
  const cacheKeys = [
    'profile_page_profile',
    'explore_users',
    'messages_matches',
    'messages_last_seen_timestamps',
    'messages_last_seen_matches'
  ];
  
  // Clear specific cache keys
  cacheKeys.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Clear any chat message caches (they follow a pattern)
  const chatCacheKeys = Object.keys(localStorage).filter(key => 
    key.startsWith('chat_messages_')
  );
  chatCacheKeys.forEach(key => {
    localStorage.removeItem(key);
  });
};

export const setCacheItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to set cache item:', key, error);
  }
};

export const getCacheItem = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn('Failed to get cache item:', key, error);
    return defaultValue;
  }
};

export const removeCacheItem = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to remove cache item:', key, error);
  }
}; 