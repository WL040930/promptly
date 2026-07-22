import { BaseNode } from '../../../BaseNode.js';
import { getGoogleClientForUser } from '../../../../cli/services/triggers/googleTriggerClient.js';

export default class GoogleCalendarNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { client } = await getGoogleClientForUser(context.metadata?.userId);
        const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}`;
        if (config.operation === 'list') {
            const response = await client.request({ url: `${base}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=50`, method: 'GET' });
            const events = response.data?.items || [];
            return { success: true, outputData: { events }, events };
        }
        if (config.operation === 'find') {
            const response = await client.request({ url: `${base}/events/${encodeURIComponent(config.eventId)}`, method: 'GET' });
            return { success: true, outputData: response.data, event: response.data, eventId: response.data?.id };
        }
        if (config.operation === 'cancel') {
            await client.request({ url: `${base}/events/${encodeURIComponent(config.eventId)}`, method: 'DELETE' });
            return { success: true, outputData: { eventId: config.eventId, cancelled: true }, eventId: config.eventId };
        }
        const event = { summary: config.summary, description: config.description || undefined, start: { dateTime: new Date(config.start).toISOString() }, end: { dateTime: new Date(config.end).toISOString() } };
        const response = await client.request({ url: config.operation === 'update' ? `${base}/events/${encodeURIComponent(config.eventId)}` : `${base}/events`, method: config.operation === 'update' ? 'PUT' : 'POST', data: event });
        return { success: true, outputData: response.data, event: response.data, eventId: response.data?.id };
    }
}
