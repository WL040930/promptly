import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function RelativeTimeDisplay({ timestamp }) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!timestamp) return 'Never';

    try {
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
        return 'Recently';
    }
}
