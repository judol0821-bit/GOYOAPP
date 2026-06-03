import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js';
import { createCalendarEvent, getSafeCalendarEvents } from '../utils/calendarEvents.js';
import { isUuid, mapCalendarEventFromSupabase, toSupabaseCalendarPayload } from './mappers.js';

const CALENDAR_EVENTS_KEY = 'calendarEvents';

const readLocalCalendarEvents = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return getSafeCalendarEvents(JSON.parse(window.localStorage.getItem(CALENDAR_EVENTS_KEY) || '[]'));
  } catch {
    return [];
  }
};

const writeLocalCalendarEvents = (events) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(getSafeCalendarEvents(events)));
};

export async function getCalendarEvents(anonymousUserId) {
  if (isSupabaseConfigured() && anonymousUserId) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { data, error } = await client
        .from('calendar_events')
        .select('id, news_id, anonymous_user_id, title, date, time, location, artist_name, type')
        .eq('anonymous_user_id', anonymousUserId)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) {
        throw error;
      }

      return getSafeCalendarEvents((data || []).map(mapCalendarEventFromSupabase));
    } catch (error) {
      console.error('Failed to load Supabase calendar events.', error);
    }
  }

  return readLocalCalendarEvents();
}

export async function addCalendarEvent(anonymousUserId, newsItem) {
  if (!newsItem) {
    return null;
  }

  if (isSupabaseConfigured() && anonymousUserId && isUuid(newsItem.id)) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { data, error } = await client
        .from('calendar_events')
        .insert(toSupabaseCalendarPayload(anonymousUserId, newsItem))
        .select('id, news_id, anonymous_user_id, title, date, time, location, artist_name, type')
        .maybeSingle();

      if (error) {
        const { data: existingEvent, error: selectError } = await client
          .from('calendar_events')
          .select('id, news_id, anonymous_user_id, title, date, time, location, artist_name, type')
          .eq('anonymous_user_id', anonymousUserId)
          .eq('news_id', newsItem.id)
          .maybeSingle();

        if (!selectError && existingEvent) {
          return mapCalendarEventFromSupabase(existingEvent);
        }

        throw error;
      }

      return mapCalendarEventFromSupabase(data);
    } catch (error) {
      console.error('Failed to add Supabase calendar event.', error);
    }
  }

  const localEvents = readLocalCalendarEvents();
  const existingEvent = localEvents.find((event) => event.newsId === newsItem.id);

  if (existingEvent) {
    return existingEvent;
  }

  const nextEvent = createCalendarEvent(newsItem);
  writeLocalCalendarEvents([...localEvents, nextEvent]);

  return nextEvent;
}

export async function removeCalendarEvent(anonymousUserId, eventId) {
  if (!eventId) {
    return false;
  }

  if (isSupabaseConfigured() && anonymousUserId && isUuid(eventId)) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { error } = await client
        .from('calendar_events')
        .delete()
        .eq('id', eventId)
        .eq('anonymous_user_id', anonymousUserId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Failed to remove Supabase calendar event.', error);
    }
  }

  const nextEvents = readLocalCalendarEvents().filter((event) => event.id !== eventId);
  writeLocalCalendarEvents(nextEvents);

  return true;
}
